'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  assessFacialLiveness,
  computeFaceDescriptorFromLumaGrid,
  computeTemplateSha256Hex,
} from '@/lib/biometrics/facial';
import {
  cadastrarBiometriaFacial,
  verificarBiometriaFacial,
} from '@/services/biometrics.service';
import type { FacialBiometricProfile } from '@/types/entities';

interface FaceDetectorLike {
  detect: (
    image: HTMLVideoElement,
  ) => Promise<Array<{ boundingBox: { x: number; y: number; width: number; height: number } }>>;
}

interface FacialBiometricsCaptureProps {
  mode: 'enroll' | 'verify';
  title?: string;
  subtitle?: string;
  cancelLabel?: string;
  onCompleted: (result: {
    matched: boolean;
    biometric?: FacialBiometricProfile;
    similarityScore?: number;
    livenessScore?: number;
  }) => void;
  onCancel?: () => void;
}

const ROI_SIZE = 64;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractCenterLumaFromVideo(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  faceBox?: { x: number; y: number; width: number; height: number } | null,
): Uint8ClampedArray {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) {
    throw new Error('A câmera ainda está inicializando. Aguarde um instante.');
  }

  canvas.width = ROI_SIZE;
  canvas.height = ROI_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Contexto gráfico 2D indisponível neste navegador.');
  }

  let sx: number;
  let sy: number;
  let sWidth: number;
  let sHeight: number;

  if (faceBox && faceBox.width > 24 && faceBox.height > 24) {
    const padX = faceBox.width * 0.1;
    const padY = faceBox.height * 0.1;
    sx = Math.max(0, faceBox.x - padX);
    sy = Math.max(0, faceBox.y - padY);
    sWidth = Math.min(vw - sx, faceBox.width + padX * 2);
    sHeight = Math.min(vh - sy, faceBox.height + padY * 2);
  } else {
    // Centered portrait oval region of interest
    const side = Math.min(vw, vh) * 0.56;
    sx = (vw - side) / 2;
    sy = (vh - side) * 0.42;
    sWidth = side;
    sHeight = side;
  }

  ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, ROI_SIZE, ROI_SIZE);
  const { data } = ctx.getImageData(0, 0, ROI_SIZE, ROI_SIZE);
  const luma = new Uint8ClampedArray(ROI_SIZE * ROI_SIZE);

  for (let i = 0; i < luma.length; i += 1) {
    const offset = i * 4;
    const r = data[offset] ?? 0;
    const g = data[offset + 1] ?? 0;
    const b = data[offset + 2] ?? 0;
    luma[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }

  return luma;
}

export function FacialBiometricsCapture({
  mode,
  title,
  subtitle,
  cancelLabel = 'Cancelar',
  onCompleted,
  onCancel,
}: FacialBiometricsCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraState, setCameraState] = useState<'starting' | 'ready' | 'error'>('starting');
  const [capturing, setCapturing] = useState(false);
  const [statusMessage, setStatusMessage] = useState(
    'Posicione seu rosto dentro da guia oval em ambiente iluminado.',
  );
  const [errorMessage, setErrorMessage] = useState('');

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraState('starting');
    setErrorMessage('');

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setCameraState('error');
      setErrorMessage(
        'Seu navegador não suporta acesso à câmera frontal (MediaDevices). Use Chrome, Safari ou Edge atualizado em HTTPS.',
      );
      return;
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => null);
      }
      setCameraState('ready');
    } catch {
      setCameraState('error');
      setErrorMessage(
        'Não foi possível abrir a câmera. Permita o acesso à câmera nas configurações do navegador e tente novamente.',
      );
    }
  }, [stopCamera]);

  useEffect(() => {
    void startCamera();
    return () => {
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  async function handleCapture() {
    if (!videoRef.current || cameraState !== 'ready') return;
    setCapturing(true);
    setErrorMessage('');
    setStatusMessage('Analisando iluminação e prova de vida...');

    try {
      const video = videoRef.current;
      if (!canvasRef.current) {
        canvasRef.current = document.createElement('canvas');
      }
      const canvas = canvasRef.current;

      let detectedBox: { x: number; y: number; width: number; height: number } | null = null;
      const DetectorCtor = (
        window as unknown as {
          FaceDetector?: new (opts?: { fastMode?: boolean; maxDetectedFaces?: number }) => FaceDetectorLike;
        }
      ).FaceDetector;

      if (DetectorCtor) {
        try {
          const detector = new DetectorCtor({ fastMode: true, maxDetectedFaces: 1 });
          const faces = await detector.detect(video);
          if (faces.length === 0) {
            throw new Error(
              'Nenhum rosto detectado no enquadramento. Olhe diretamente para a câmera.',
            );
          }
          detectedBox = faces[0]?.boundingBox ?? null;
        } catch (faceErr) {
          if (faceErr instanceof Error && faceErr.message.includes('Nenhum rosto')) {
            throw faceErr;
          }
        }
      }

      const frameOne = extractCenterLumaFromVideo(video, canvas, detectedBox);
      await sleep(260);
      const frameTwo = extractCenterLumaFromVideo(video, canvas, detectedBox);

      const liveness = assessFacialLiveness(frameOne, frameTwo);
      if (!liveness.passed) {
        throw new Error(
          liveness.reason ||
            'Não foi possível validar a nitidez do rosto. Tente novamente em local iluminado.',
        );
      }

      const descriptor = computeFaceDescriptorFromLumaGrid(
        frameTwo,
        ROI_SIZE,
        ROI_SIZE,
      );
      const deviceLabel =
        typeof navigator !== 'undefined'
          ? navigator.userAgent.slice(0, 120)
          : 'Web Camera';

      if (mode === 'enroll') {
        setStatusMessage('Salvando biometria facial com segurança no banco de dados...');
        const templateHash = await computeTemplateSha256Hex(descriptor);
        const { biometric } = await cadastrarBiometriaFacial({
          template_hash: templateHash,
          descriptor_vector: descriptor,
          liveness_score: liveness.score,
          device_label: deviceLabel,
        });
        stopCamera();
        onCompleted({
          matched: true,
          biometric,
          livenessScore: liveness.score,
        });
        return;
      }

      setStatusMessage('Validando biometria facial no servidor...');
      const verification = await verificarBiometriaFacial({
        descriptor_vector: descriptor,
        liveness_score: liveness.score,
        device_label: deviceLabel,
      });

      if (!verification.matched) {
        setErrorMessage(
          `${verification.message} (Similaridade ${Math.round(verification.similarityScore * 100)}%).`,
        );
        setStatusMessage('Ajuste a posição do rosto e tente novamente.');
        return;
      }

      stopCamera();
      onCompleted({
        matched: true,
        similarityScore: verification.similarityScore,
        livenessScore: verification.livenessScore,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Falha ao capturar a biometria facial.',
      );
      setStatusMessage('Posicione o rosto dentro da guia e tente novamente.');
    } finally {
      setCapturing(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[#087a68]/25 bg-[#f6faff] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#087a68]">
            <ShieldCheck className="h-4 w-4" />
            {mode === 'enroll' ? 'Cadastro Biométrico Facial' : 'Validação Biométrica Facial'}
          </span>
          <h3 className="mt-1 text-lg font-extrabold text-[#153b50]">
            {title ||
              (mode === 'enroll'
                ? 'Confecção da Biometria Facial'
                : 'Confirme sua identidade facial')}
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            {subtitle ||
              (mode === 'enroll'
                ? 'Nenhuma biometria facial foi encontrada para sua conta. Capture seu rosto agora para registrar sua biometria no sistema e no banco de dados.'
                : 'Realize uma captura rápida da face para liberar sua sessão com segurança.')}
          </p>
        </div>
        {onCancel && (
          <button
            aria-label={cancelLabel}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            onClick={() => {
              stopCamera();
              onCancel();
            }}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="relative mt-4 aspect-[4/3] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-950">
        <video
          autoPlay
          className="h-full w-full -scale-x-100 object-cover"
          muted
          playsInline
          ref={videoRef}
        />

        {cameraState === 'ready' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-52 w-40 rounded-full border-2 border-dashed border-emerald-400/90 shadow-[0_0_0_9999px_rgba(15,23,42,0.38)] sm:h-60 sm:w-44" />
          </div>
        )}

        {cameraState === 'starting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900/90 text-xs font-semibold text-white">
            <Camera className="h-6 w-6 animate-pulse text-emerald-400" />
            <span>Iniciando câmera frontal...</span>
          </div>
        )}

        {cameraState === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900/95 p-5 text-center text-white">
            <AlertTriangle className="h-7 w-7 text-amber-400" />
            <p className="max-w-xs text-xs leading-5 text-slate-200">
              {errorMessage}
            </p>
            <button
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-white px-4 text-xs font-bold text-[#153b50]"
              onClick={() => void startCamera()}
              type="button"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Tentar câmera novamente
            </button>
          </div>
        )}
      </div>

      <p className="mt-3 text-center text-xs font-medium text-slate-600">
        {statusMessage}
      </p>

      {errorMessage && cameraState !== 'error' && (
        <p className="mt-2 rounded-xl bg-red-50 p-3 text-xs font-medium text-red-800" role="alert">
          {errorMessage}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {onCancel && (
          <button
            className="min-h-10 rounded-full border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            disabled={capturing}
            onClick={() => {
              stopCamera();
              onCancel();
            }}
            type="button"
          >
            {cancelLabel}
          </button>
        )}
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#087a68] px-5 text-sm font-bold text-white transition hover:bg-[#066355] disabled:opacity-50"
          disabled={cameraState !== 'ready' || capturing}
          onClick={() => void handleCapture()}
          type="button"
        >
          {mode === 'enroll' ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <Camera className="h-4 w-4" />
          )}
          {capturing
            ? 'Processando captura...'
            : mode === 'enroll'
              ? 'Capturar e salvar biometria facial'
              : 'Validar biometria facial'}
        </button>
      </div>
    </div>
  );
}
