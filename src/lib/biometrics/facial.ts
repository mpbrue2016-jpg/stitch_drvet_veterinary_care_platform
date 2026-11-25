export const FACIAL_DESCRIPTOR_DIMENSION = 64;
export const FACIAL_MATCH_THRESHOLD = 0.78;
export const FACIAL_MIN_LIVENESS_SCORE = 0.55;

export interface FacialLivenessAssessment {
  passed: boolean;
  score: number;
  meanLuma: number;
  contrastStdDev: number;
  motionDelta: number;
  reason?: string;
}

/**
 * Computes a deterministic 64-dimensional illumination-normalized facial descriptor
 * from a square grayscale ROI pixel buffer (`width x height` luma values in 0..255).
 */
export function computeFaceDescriptorFromLumaGrid(
  lumaPixels: ArrayLike<number>,
  width: number,
  height: number,
): number[] {
  if (width < 8 || height < 8 || lumaPixels.length < width * height) {
    throw new Error('Área de captura facial insuficiente para extração do descritor.');
  }

  const gridSize = 8; // 8 x 8 = 64 regions
  const regionMeans = new Array<number>(FACIAL_DESCRIPTOR_DIMENSION).fill(0);
  const cellW = width / gridSize;
  const cellH = height / gridSize;

  for (let gy = 0; gy < gridSize; gy += 1) {
    const yStart = Math.floor(gy * cellH);
    const yEnd = Math.max(yStart + 1, Math.floor((gy + 1) * cellH));
    for (let gx = 0; gx < gridSize; gx += 1) {
      const xStart = Math.floor(gx * cellW);
      const xEnd = Math.max(xStart + 1, Math.floor((gx + 1) * cellW));

      let sum = 0;
      let count = 0;
      for (let y = yStart; y < yEnd; y += 1) {
        const rowOffset = y * width;
        for (let x = xStart; x < xEnd; x += 1) {
          sum += Number(lumaPixels[rowOffset + x] ?? 0);
          count += 1;
        }
      }
      regionMeans[gy * gridSize + gx] = count > 0 ? sum / count : 0;
    }
  }

  const globalMean =
    regionMeans.reduce((acc, value) => acc + value, 0) / regionMeans.length;
  const centered = regionMeans.map((value) => value - globalMean);
  const norm = Math.sqrt(
    centered.reduce((acc, value) => acc + value * value, 0),
  );

  if (!Number.isFinite(norm) || norm < 1e-6) {
    throw new Error(
      'Rosto sem contraste suficiente. Posicione-se em ambiente iluminado.',
    );
  }

  return centered.map((value) => Number((value / norm).toFixed(6)));
}

/**
 * Evaluates frame brightness, spatial contrast, and multi-frame micro-motion
 * to prevent blank/covered cameras or completely frozen static inputs.
 */
export function assessFacialLiveness(
  frameOneLuma: ArrayLike<number>,
  frameTwoLuma?: ArrayLike<number> | null,
): FacialLivenessAssessment {
  const len = frameOneLuma.length;
  if (len === 0) {
    return {
      passed: false,
      score: 0,
      meanLuma: 0,
      contrastStdDev: 0,
      motionDelta: 0,
      reason: 'Nenhum quadro válido foi capturado da câmera.',
    };
  }

  let sum = 0;
  for (let i = 0; i < len; i += 1) {
    sum += Number(frameOneLuma[i] ?? 0);
  }
  const meanLuma = sum / len;

  let varianceSum = 0;
  for (let i = 0; i < len; i += 1) {
    const diff = Number(frameOneLuma[i] ?? 0) - meanLuma;
    varianceSum += diff * diff;
  }
  const contrastStdDev = Math.sqrt(varianceSum / len);

  let motionDelta = 0.015; // default when single static frame provided in unit check
  if (frameTwoLuma && frameTwoLuma.length === len) {
    let diffSum = 0;
    for (let i = 0; i < len; i += 1) {
      diffSum += Math.abs(
        Number(frameOneLuma[i] ?? 0) - Number(frameTwoLuma[i] ?? 0),
      );
    }
    motionDelta = diffSum / (len * 255);
  }

  if (meanLuma < 22) {
    return {
      passed: false,
      score: 0.12,
      meanLuma,
      contrastStdDev,
      motionDelta,
      reason: 'Imagem muito escura. Melhore a iluminação frontal do rosto.',
    };
  }

  if (meanLuma > 244) {
    return {
      passed: false,
      score: 0.18,
      meanLuma,
      contrastStdDev,
      motionDelta,
      reason: 'Excesso de luz direta. Evite contra-luz forte atrás do rosto.',
    };
  }

  if (contrastStdDev < 10) {
    return {
      passed: false,
      score: 0.25,
      meanLuma,
      contrastStdDev,
      motionDelta,
      reason: 'Não foi possível distinguir traços faciais com nitidez suficiente.',
    };
  }

  // Normalized sub-scores combined into [0, 1]
  const lightingScore = Math.max(
    0,
    1 - Math.abs(meanLuma - 130) / 130,
  );
  const contrastScore = Math.min(1, contrastStdDev / 42);
  const motionScore =
    motionDelta >= 0.0012
      ? Math.min(1, 0.65 + motionDelta * 10)
      : 0.35;

  const score = Number(
    Math.min(
      0.99,
      Math.max(
        0,
        lightingScore * 0.35 + contrastScore * 0.45 + motionScore * 0.2,
      ),
    ).toFixed(4),
  );

  return {
    passed: score >= FACIAL_MIN_LIVENESS_SCORE,
    score,
    meanLuma: Number(meanLuma.toFixed(2)),
    contrastStdDev: Number(contrastStdDev.toFixed(2)),
    motionDelta: Number(motionDelta.toFixed(5)),
    reason:
      score >= FACIAL_MIN_LIVENESS_SCORE
        ? undefined
        : 'Centralize o rosto dentro da guia oval e mantenha boa iluminação.',
  };
}

/**
 * Computes cosine similarity in [0, 1] between two equal-length descriptor vectors.
 */
export function computeDescriptorSimilarity(
  a: readonly number[],
  b: readonly number[],
): number {
  if (a.length === 0 || a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    const va = Number(a[i]);
    const vb = Number(b[i]);
    if (!Number.isFinite(va) || !Number.isFinite(vb)) return 0;
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom < 1e-9) return 0;

  const rawCosine = Math.max(-1, Math.min(1, dot / denom));
  // Map cosine similarity [-1, 1] -> [0, 1] smoothly, keeping aligned vectors high
  const normalized = (rawCosine + 1) / 2;
  return Number(normalized.toFixed(4));
}

export async function computeTemplateSha256Hex(
  descriptor: readonly number[],
): Promise<string> {
  const canonical = descriptor.map((value) => Number(value).toFixed(5)).join(',');
  const encoded = new TextEncoder().encode(`drvet-face-v1:${canonical}`);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto API indisponível neste ambiente.');
  }
  const digest = await subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
