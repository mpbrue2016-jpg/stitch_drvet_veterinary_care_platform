'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { extractPrescriptionCodeFromQrValue } from '@/lib/clinical/recent-prescription-codes';

interface BarcodeDetectorLike {
  detect(
    source: HTMLVideoElement | HTMLCanvasElement,
  ): Promise<Array<{ rawValue?: string }>>;
}

type BarcodeDetectorCtor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorLike;

interface PrescriptionQrScannerProps {
  onCodeDetected: (code: string) => void;
  onClose: () => void;
}

const MAX_SCAN_DIMENSION = 720;
const SCAN_INTERVAL_MS = 140;

function mapCameraErrorMessage(error: unknown): string {
  const errName =
    error instanceof Error ? error.name : String((error as { name?: string })?.name ?? '');

  switch (errName) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Permissão da câmera negada. Autorize o uso da câmera nas configurações do navegador e tente novamente.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'Nenhuma câmera disponível foi encontrada neste dispositivo.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'Não foi possível iniciar a câmera porque ela pode estar em uso por outro aplicativo.';
    case 'OverconstrainedError':
      return 'A câmera selecionada não atende aos requisitos do dispositivo.';
    default:
      return error instanceof Error && error.message
        ? error.message
        : 'Não foi possível acessar a câmera do dispositivo.';
  }
}

export function PrescriptionQrScanner({
  onCodeDetected,
  onClose,
}: PrescriptionQrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const onCodeDetectedRef = useRef(onCodeDetected);
  onCodeDetectedRef.current = onCodeDetected;
  const lastFrameScanAtRef = useRef(0);
  const lastInvalidQrRef = useRef<{ value: string; timestamp: number }>({
    value: '',
    timestamp: 0,
  });

  const [starting, setStarting] = useState(true);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [invalidQrNotice, setInvalidQrNotice] = useState('');

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (mountedRef.current) {
      setCameraActive(false);
    }
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    if (!mountedRef.current) return;

    setStarting(true);
    setCameraError('');
    setInvalidQrNotice('');

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      setStarting(false);
      setCameraError(
        'Acesso à câmera via MediaDevices indisponível neste navegador ou contexto sem HTTPS.',
      );
      return;
    }

    let mediaStream: MediaStream | null = null;
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
    } catch (primaryError) {
      const errName =
        primaryError instanceof Error ? primaryError.name : '';
      if (errName === 'OverconstrainedError' || errName === 'NotFoundError') {
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        } catch (fallbackError) {
          if (!mountedRef.current) return;
          setStarting(false);
          setCameraError(mapCameraErrorMessage(fallbackError));
          return;
        }
      } else {
        if (!mountedRef.current) return;
        setStarting(false);
        setCameraError(mapCameraErrorMessage(primaryError));
        return;
      }
    }

    if (!mountedRef.current) {
      for (const track of mediaStream.getTracks()) {
        track.stop();
      }
      return;
    }

    streamRef.current = mediaStream;
    const videoEl = videoRef.current;
    if (!videoEl) {
      stopCamera();
      setStarting(false);
      return;
    }

    videoEl.srcObject = mediaStream;
    try {
      await videoEl.play();
    } catch {
      // Some mobile browsers resolve playback via autoPlay attribute
    }

    if (!mountedRef.current) return;
    setStarting(false);
    setCameraActive(true);

    const detectorCtor = (
      window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }
    ).BarcodeDetector;
    let barcodeDetector: BarcodeDetectorLike | null = null;
    if (typeof detectorCtor === 'function') {
      try {
        barcodeDetector = new detectorCtor({ formats: ['qr_code'] });
      } catch {
        barcodeDetector = null;
      }
    }

    const handleDecodedValue = (rawValue: string): boolean => {
      const extracted = extractPrescriptionCodeFromQrValue(rawValue);
      if (extracted) {
        stopCamera();
        onCodeDetectedRef.current(extracted);
        return true;
      }

      const now = Date.now();
      if (
        lastInvalidQrRef.current.value !== rawValue ||
        now - lastInvalidQrRef.current.timestamp > 2500
      ) {
        lastInvalidQrRef.current = { value: rawValue, timestamp: now };
        if (mountedRef.current) {
          setInvalidQrNotice(
            'QR Code lido não corresponde a uma receita DrVet válida. Aponte para o QR Code impresso na receita.',
          );
        }
      }
      return false;
    };

    const scanLoop = async (timestamp: number) => {
      if (!mountedRef.current || !streamRef.current) return;

      if (
        timestamp - lastFrameScanAtRef.current >= SCAN_INTERVAL_MS &&
        videoEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        videoEl.videoWidth > 0 &&
        videoEl.videoHeight > 0
      ) {
        lastFrameScanAtRef.current = timestamp;

        if (barcodeDetector) {
          try {
            const detected = await barcodeDetector.detect(videoEl);
            const firstMatch = detected.find((item) => Boolean(item.rawValue));
            if (firstMatch?.rawValue && handleDecodedValue(firstMatch.rawValue)) {
              return;
            }
          } catch {
            barcodeDetector = null;
          }
        }

        const canvas = canvasRef.current;
        if (canvas) {
          const scale = Math.min(
            1,
            MAX_SCAN_DIMENSION / Math.max(videoEl.videoWidth, videoEl.videoHeight),
          );
          const targetWidth = Math.max(1, Math.round(videoEl.videoWidth * scale));
          const targetHeight = Math.max(1, Math.round(videoEl.videoHeight * scale));

          if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
            canvas.width = targetWidth;
            canvas.height = targetHeight;
          }

          const context = canvas.getContext('2d', { willReadFrequently: true });
          if (context) {
            context.drawImage(videoEl, 0, 0, targetWidth, targetHeight);
            const imageData = context.getImageData(0, 0, targetWidth, targetHeight);
            const decoded = jsQR(imageData.data, targetWidth, targetHeight, {
              inversionAttempts: 'dontInvert',
            });
            if (decoded?.data && handleDecodedValue(decoded.data)) {
              return;
            }
          }
        }
      }

      if (mountedRef.current && streamRef.current) {
        rafRef.current = window.requestAnimationFrame((nextTs) => {
          void scanLoop(nextTs);
        });
      }
    };

    rafRef.current = window.requestAnimationFrame((ts) => {
      void scanLoop(ts);
    });
  }, [stopCamera]);

  useEffect(() => {
    mountedRef.current = true;
    void startCamera();

    return () => {
      mountedRef.current = false;
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  return (
    <section
      aria-label="Leitor de QR Code pela câmera"
      className="rounded-2xl border border-[#13a88a]/40 bg-white p-4 shadow-sm sm:p-5 print:hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Camera className="h-5 w-5 text-[#006b57]" />
          <div>
            <h2 className="text-sm font-bold text-[#153b50]">
              Escanear QR Code da receita
            </h2>
            <p className="text-xs text-slate-600">
              Posicione o QR Code da receita veterinária dentro da moldura.
            </p>
          </div>
        </div>
        <Button
          onClick={() => {
            stopCamera();
            onClose();
          }}
          type="button"
          variant="outline"
        >
          <X className="h-4 w-4" />
          Fechar câmera
        </Button>
      </div>

      {cameraError ? (
        <div
          className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          role="alert"
        >
          <p>{cameraError}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              onClick={() => void startCamera()}
              type="button"
              variant="secondary"
            >
              <RefreshCw className="h-4 w-4" />
              Tentar novamente
            </Button>
            <Button
              onClick={() => {
                stopCamera();
                onClose();
              }}
              type="button"
              variant="outline"
            >
              Digitar código manualmente
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <div className="relative mx-auto aspect-[4/3] w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-[#0d2a3a]">
            <video
              autoPlay
              className="h-full w-full object-cover"
              muted
              playsInline
              ref={videoRef}
            />
            <canvas aria-hidden="true" className="hidden" ref={canvasRef} />

            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
              <div className="relative h-44 w-44 rounded-2xl border-2 border-white/40 sm:h-52 sm:w-52">
                <span className="absolute -left-0.5 -top-0.5 h-6 w-6 rounded-tl-xl border-l-4 border-t-4 border-[#13a88a]" />
                <span className="absolute -right-0.5 -top-0.5 h-6 w-6 rounded-tr-xl border-r-4 border-t-4 border-[#13a88a]" />
                <span className="absolute -bottom-0.5 -left-0.5 h-6 w-6 rounded-bl-xl border-b-4 border-l-4 border-[#13a88a]" />
                <span className="absolute -bottom-0.5 -right-0.5 h-6 w-6 rounded-br-xl border-b-4 border-r-4 border-[#13a88a]" />
              </div>
            </div>

            {starting && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#0d2a3a]/85 px-4 text-center text-sm font-semibold text-white">
                Iniciando câmera do dispositivo...
              </div>
            )}
          </div>

          <p className="mt-2.5 text-center text-xs font-medium text-slate-600" role="status">
            {cameraActive
              ? 'Câmera ativa · aguardando leitura do QR Code...'
              : 'Preparando visualização da câmera...'}
          </p>

          {invalidQrNotice && (
            <p
              className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-900"
              role="status"
            >
              {invalidQrNotice}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
