'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Download, QrCode } from 'lucide-react';

interface QrCodeBoxProps {
  value: string;
  size?: number;
  title?: string;
  subtitle?: string;
  downloadName?: string;
  compact?: boolean;
}

export function QrCodeBox({
  value,
  size = 180,
  title,
  subtitle,
  downloadName = 'qrcode-drvets.png',
  compact = false,
}: QrCodeBoxProps) {
  const [dataUrl, setDataUrl] = useState<string>('');
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setError(false);

    if (!value) {
      setDataUrl('');
      return;
    }

    QRCode.toDataURL(value, {
      width: size * 2,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch(() => {
        if (active) setError(true);
      });

    return () => {
      active = false;
    };
  }, [value, size]);

  if (!value) return null;

  return (
    <div
      className={
        compact
          ? 'inline-flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3'
          : 'flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm'
      }
    >
      {title && (
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
          <QrCode className="h-3.5 w-3.5 text-teal-600" />
          <span>{title}</span>
        </div>
      )}

      <div
        className="flex items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-white"
        style={{ width: size, height: size }}
      >
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={dataUrl}
            alt={title || 'QR Code'}
            width={size}
            height={size}
            className="h-full w-full object-contain"
          />
        ) : error ? (
          <span className="px-2 text-xs text-rose-600">Erro ao gerar QR</span>
        ) : (
          <span className="text-xs text-slate-400">Gerando QR...</span>
        )}
      </div>

      {subtitle && <p className="max-w-[220px] text-[11px] text-slate-500">{subtitle}</p>}

      {dataUrl && (
        <a
          href={dataUrl}
          download={downloadName}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 print:hidden"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Baixar PNG</span>
        </a>
      )}
    </div>
  );
}
