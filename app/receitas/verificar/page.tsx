'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Search, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Badge, Button, Card, Input, PageHeader } from '@/components/ui';
import { verificarCodigoReceita } from '@/services/prescriptions.service';
import type { PrescriptionVerification } from '@/types/entities';

function VerifyPrescriptionContent() {
  const searchParams = useSearchParams();
  const initialCode = searchParams.get('code') ?? '';
  const [code, setCode] = useState(initialCode);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);
  const [result, setResult] = useState<PrescriptionVerification | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  async function runVerification(target: string) {
    const normalized = target.trim().toUpperCase();
    if (!normalized) return;
    setLoading(true);
    setErrorMessage('');
    setChecked(false);
    try {
      const data = await verificarCodigoReceita(normalized);
      setResult(data);
      setChecked(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível validar o código informado.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialCode) {
      setCode(initialCode);
      void runVerification(initialCode);
    }
  }, [initialCode]);

  return (
    <div className="mx-auto grid max-w-2xl gap-5 py-6">
      <PageHeader
        title="Validação pública de receita veterinária"
        description="Conferência de autenticidade por código ou QR Code para farmácias, pet shops e tutores."
        action={
          <Link
            className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-[#153b50] hover:bg-[#ebf5ff]"
            href="/"
          >
            Voltar ao início
          </Link>
        }
      />

      <Card>
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
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

        {errorMessage && (
          <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">
            {errorMessage}
          </p>
        )}

        {checked && result && (
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-bold text-emerald-950">
                <ShieldCheck className="h-5 w-5 text-emerald-700" />
                <span>Receita autêntica emitida no DrVets</span>
              </div>
              <Badge variant="success">Válida · {result.verification_code}</Badge>
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase text-slate-500">Paciente</dt>
                <dd className="font-semibold text-[#153b50]">
                  {result.pet_name} ({result.species})
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-slate-500">Veterinário responsável</dt>
                <dd className="font-semibold text-[#153b50]">
                  {result.veterinarian_name} · {result.crmv}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-slate-500">Emitida em</dt>
                <dd className="text-slate-700">
                  {new Intl.DateTimeFormat('pt-BR', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(result.issued_at))}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-slate-500">Itens prescritos</dt>
                <dd className="flex items-center gap-1 text-slate-700">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>{result.items_count} medicamento(s)</span>
                </dd>
              </div>
            </dl>
          </div>
        )}

        {checked && !result && !errorMessage && (
          <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
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
    <Suspense fallback={<div className="mx-auto max-w-2xl p-6 text-sm text-slate-500">Carregando validador...</div>}>
      <VerifyPrescriptionContent />
    </Suspense>
  );
}
