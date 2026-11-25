'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  CheckCircle2,
  Clock,
  History,
  Printer,
  QrCode,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { PrescriptionQrScanner } from '@/components/prescription-qr-scanner';
import { QrCodeBox } from '@/components/qr-code-box';
import { Badge, Button, Card, Input, PageHeader } from '@/components/ui';
import {
  clearRecentVerifiedCodesFromStorage,
  findCachedVerifiedPrescription,
  MAX_RECENT_VERIFIED_CODES,
  normalizeVerificationCode,
  readRecentVerifiedCodesFromStorage,
  removeRecentVerifiedCode,
  upsertRecentVerifiedCode,
  writeRecentVerifiedCodesToStorage,
  type CachedVerifiedPrescription,
} from '@/lib/clinical/recent-prescription-codes';
import { verificarCodigoReceita } from '@/services/prescriptions.service';
import type { PrescriptionVerification } from '@/types/entities';

function VerifyPrescriptionContent() {
  const searchParams = useSearchParams();
  const initialCode = searchParams.get('code') ?? '';
  const [code, setCode] = useState(initialCode);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);
  const [result, setResult] = useState<PrescriptionVerification | null>(null);
  const [verifiedAt, setVerifiedAt] = useState<string>('');
  const [fromCache, setFromCache] = useState(false);
  const [cacheNotice, setCacheNotice] = useState('');
  const [recentCodes, setRecentCodes] = useState<CachedVerifiedPrescription[]>([]);
  const [origin, setOrigin] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
    setRecentCodes(readRecentVerifiedCodesFromStorage());
  }, []);

  async function runVerification(target: string) {
    const normalized = normalizeVerificationCode(target);
    if (!normalized) return;

    const currentCached = readRecentVerifiedCodesFromStorage();
    const cachedHit = findCachedVerifiedPrescription(currentCached, normalized);

    setCode(normalized);
    setLoading(true);
    setErrorMessage('');
    setCacheNotice('');

    if (cachedHit) {
      setResult(cachedHit.result);
      setVerifiedAt(cachedHit.verifiedAt);
      setFromCache(true);
      setChecked(true);
    } else {
      setChecked(false);
    }

    try {
      const data = await verificarCodigoReceita(normalized);
      if (data) {
        const nowIso = new Date().toISOString();
        const updated = upsertRecentVerifiedCode(currentCached, data, nowIso);
        writeRecentVerifiedCodesToStorage(updated);
        setRecentCodes(updated);
        setResult(data);
        setVerifiedAt(nowIso);
        setFromCache(false);
        setChecked(true);
      } else {
        const cleaned = removeRecentVerifiedCode(currentCached, normalized);
        writeRecentVerifiedCodesToStorage(cleaned);
        setRecentCodes(cleaned);
        setResult(null);
        setVerifiedAt('');
        setFromCache(false);
        setChecked(true);
      }
    } catch (error) {
      if (cachedHit) {
        setFromCache(true);
        setCacheNotice(
          'Exibindo a última validação salva localmente; não foi possível revalidar no servidor agora.',
        );
      } else {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Não foi possível validar o código informado.',
        );
      }
    } finally {
      setLoading(false);
    }
  }

  function handleClearHistory() {
    clearRecentVerifiedCodesFromStorage();
    setRecentCodes([]);
    setFromCache(false);
    setCacheNotice('');
  }

  useEffect(() => {
    if (initialCode) {
      const normalized = normalizeVerificationCode(initialCode);
      setCode(normalized);
      void runVerification(normalized);
    }
  }, [initialCode]);

  const verificationUrl =
    origin && result
      ? `${origin}/receitas/verificar?code=${encodeURIComponent(result.verification_code)}`
      : '';

  const formattedIssuedAt = result
    ? new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(result.issued_at))
    : '';

  const formattedVerifiedAt = verifiedAt
    ? new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(verifiedAt))
    : '';

  return (
    <div className="mx-auto grid max-w-2xl gap-5 py-6 print:max-w-none print:gap-0 print:py-0">
      <div className="print:hidden">
        <PageHeader
          title="Validação pública de receita veterinária"
          description="Conferência de autenticidade por código ou QR Code para farmácias, pet shops e tutores."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                aria-expanded={scannerOpen}
                onClick={() => {
                  setErrorMessage('');
                  setScannerOpen((prev) => !prev);
                }}
                type="button"
                variant="secondary"
              >
                {scannerOpen ? (
                  <X className="h-4 w-4" />
                ) : (
                  <QrCode className="h-4 w-4" />
                )}
                {scannerOpen ? 'Fechar câmera' : 'Ler QR Code'}
              </Button>
              <Link
                className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-[#153b50] hover:bg-[#ebf5ff]"
                href="/"
              >
                Voltar ao início
              </Link>
            </div>
          }
        />
      </div>

      {scannerOpen && (
        <PrescriptionQrScanner
          onClose={() => setScannerOpen(false)}
          onCodeDetected={(scannedCode) => {
            setScannerOpen(false);
            void runVerification(scannedCode);
          }}
        />
      )}

      <Card className="print:border-0 print:bg-white print:p-0 print:shadow-none">
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end print:hidden"
          onSubmit={(event) => {
            event.preventDefault();
            void runVerification(code);
          }}
        >
          <div className="flex-1">
            <Input
              label="Código de verificação da receita"
              name="verificationCode"
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="Ex.: RX-8A2C91E0F4"
              required
              value={code}
            />
          </div>
          <Button disabled={loading || !code.trim()} type="submit" variant="secondary">
            <Search className="mr-1.5 h-4 w-4" />
            {loading ? 'Validando...' : 'Validar código'}
          </Button>
        </form>

        {recentCodes.length > 0 && (
          <section
            aria-label="Últimas receitas validadas neste navegador"
            className="mt-5 rounded-2xl border border-slate-200 bg-[#f6faff] p-4 print:hidden"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[#153b50]">
                <History className="h-4 w-4 text-[#006b57]" />
                <span>
                  Últimos códigos validados ({recentCodes.length}/
                  {MAX_RECENT_VERIFIED_CODES})
                </span>
              </div>
              <button
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-white hover:text-red-700"
                onClick={handleClearHistory}
                type="button"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Limpar histórico</span>
              </button>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {recentCodes.map((entry) => {
                const isSelected =
                  result?.verification_code === entry.code && checked;
                return (
                  <button
                    className={`flex flex-col items-start rounded-xl border p-3 text-left transition-colors ${
                      isSelected
                        ? 'border-[#13a88a] bg-white shadow-sm'
                        : 'border-slate-200 bg-white/80 hover:border-[#006b57]/40 hover:bg-white'
                    }`}
                    key={entry.code}
                    onClick={() => void runVerification(entry.code)}
                    type="button"
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-[#153b50]">
                        {entry.code}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                        <Clock className="h-3 w-3" />
                        {new Intl.DateTimeFormat('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        }).format(new Date(entry.verifiedAt))}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-700">
                      {entry.result.pet_name} ({entry.result.species})
                    </p>
                    <p className="truncate text-[11px] text-slate-500">
                      {entry.result.veterinarian_name} · {entry.result.crmv}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {errorMessage && (
          <p
            className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800 print:hidden"
            role="alert"
          >
            {errorMessage}
          </p>
        )}

        {cacheNotice && (
          <p
            className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-900 print:hidden"
            role="status"
          >
            {cacheNotice}
          </p>
        )}

        {checked && result && (
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 print:mt-0 print:rounded-xl print:border-slate-300 print:bg-white print:p-6">
            <div className="mb-5 hidden items-start justify-between gap-4 border-b border-slate-200 pb-4 print:flex">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#006b57]">
                  DrVet · Telemedicina Veterinária
                </p>
                <h2 className="mt-1 text-xl font-extrabold text-[#153b50]">
                  Comprovante de Receita Veterinária Verificada
                </h2>
                {formattedVerifiedAt && (
                  <p className="mt-1 text-xs text-slate-600">
                    Conferência realizada em {formattedVerifiedAt}
                  </p>
                )}
              </div>
              <div className="text-right">
                <span className="inline-flex rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
                  Autêntica · {result.verification_code}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
              <div className="flex items-center gap-2 font-bold text-emerald-950">
                <ShieldCheck className="h-5 w-5 text-emerald-700" />
                <span>Receita autêntica emitida no DrVet</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {fromCache && (
                  <Badge variant="info">
                    {loading ? 'Cache local · atualizando...' : 'Cache local'}
                  </Badge>
                )}
                <Badge variant="success">Válida · {result.verification_code}</Badge>
              </div>
            </div>

            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 print:mt-0 print:grid-cols-2 print:gap-5">
              <div className="print:rounded-lg print:border print:border-slate-200 print:p-3">
                <dt className="text-xs font-semibold uppercase text-slate-500">Paciente</dt>
                <dd className="mt-1 font-semibold text-[#153b50]">
                  {result.pet_name} ({result.species})
                </dd>
              </div>
              <div className="print:rounded-lg print:border print:border-slate-200 print:p-3">
                <dt className="text-xs font-semibold uppercase text-slate-500">
                  Veterinário responsável
                </dt>
                <dd className="mt-1 font-semibold text-[#153b50]">
                  {result.veterinarian_name} · {result.crmv}
                </dd>
              </div>
              <div className="print:rounded-lg print:border print:border-slate-200 print:p-3">
                <dt className="text-xs font-semibold uppercase text-slate-500">Emitida em</dt>
                <dd className="mt-1 text-slate-700">{formattedIssuedAt}</dd>
              </div>
              <div className="print:rounded-lg print:border print:border-slate-200 print:p-3">
                <dt className="text-xs font-semibold uppercase text-slate-500">
                  Itens prescritos
                </dt>
                <dd className="mt-1 flex items-center gap-1 text-slate-700">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>{result.items_count} medicamento(s)</span>
                </dd>
              </div>
              <div className="hidden print:block print:rounded-lg print:border print:border-slate-200 print:p-3">
                <dt className="text-xs font-semibold uppercase text-slate-500">
                  Código de verificação
                </dt>
                <dd className="mt-1 font-mono font-bold text-[#153b50]">
                  {result.verification_code}
                </dd>
              </div>
              <div className="hidden print:block print:rounded-lg print:border print:border-slate-200 print:p-3">
                <dt className="text-xs font-semibold uppercase text-slate-500">
                  Status do documento
                </dt>
                <dd className="mt-1 font-semibold text-emerald-800">
                  Emitida oficialmente ({result.status})
                </dd>
              </div>
            </dl>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-emerald-200/80 pt-4 print:hidden">
              <p className="text-xs text-emerald-900/80">
                Gere uma cópia limpa para arquivo da farmácia, pet shop ou tutor.
              </p>
              <Button
                onClick={() => window.print()}
                type="button"
                variant="secondary"
              >
                <Printer className="h-4 w-4" />
                Imprimir receita
              </Button>
            </div>

            <div className="mt-6 hidden items-center justify-between gap-4 border-t border-slate-200 pt-4 print:flex">
              <div className="space-y-1.5 text-xs leading-5 text-slate-600">
                <p className="font-semibold text-[#153b50]">
                  Validação pública de autenticidade
                </p>
                <p>
                  Documento conferido no validador público DrVet conforme Resolução CFMV nº 1.465/2022.
                </p>
                {verificationUrl && (
                  <p className="break-all font-mono text-[11px] text-slate-500">
                    {verificationUrl}
                  </p>
                )}
              </div>
              {verificationUrl && (
                <div className="shrink-0">
                  <QrCodeBox
                    compact
                    size={96}
                    title="Conferência QR"
                    value={verificationUrl}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {checked && !result && !errorMessage && (
          <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 print:hidden">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <div>
              <p className="font-bold">Código não localizado</p>
              <p className="mt-1">
                Nenhuma receita emitida corresponde ao código informado. Confira o código impresso ou solicite a reemissão ao veterinário.
              </p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

export default function VerifyPrescriptionPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-2xl p-6 text-sm text-slate-500">
          Carregando validador...
        </div>
      }
    >
      <VerifyPrescriptionContent />
    </Suspense>
  );
}
