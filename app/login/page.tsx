'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { FacialBiometricsCapture } from '@/components/facial-biometrics-capture';
import { sanitizeNextPath } from '@/lib/auth/guards';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { loginSchema, resetRequestSchema, signUpSchema } from '@/lib/validations';
import {
  cadastrarUsuario,
  entrarComEmailSenha,
  enviarRecuperacaoSenha,
  reenviarConfirmacaoEmail,
  sairDaConta,
} from '@/services/auth.service';
import { consultarBiometriaFacial } from '@/services/biometrics.service';

export default function LoginPage() {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(false);
  const [isResetRequest, setIsResetRequest] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [showResendConfirmation, setShowResendConfirmation] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [needsSetup, setNeedsSetup] = useState(false);
  const [nextPath, setNextPath] = useState('/agendamento');
  const [biometricStep, setBiometricStep] = useState<'none' | 'enroll' | 'verify'>('none');

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const configured = isSupabaseConfigured();
    setNeedsSetup(searchParams.get('setup') === 'required' || !configured);
    setNextPath(sanitizeNextPath(searchParams.get('next'), '/agendamento'));

    const emailParam = searchParams.get('email');
    if (emailParam) {
      setEmailInput(emailParam.trim());
    }

    const errorParam = searchParams.get('error');
    if (errorParam === 'callback') {
      setErrorMessage(
        'Não foi possível confirmar o acesso. Solicite um novo link de confirmação.',
      );
    } else if (errorParam === 'unconfirmed') {
      setErrorMessage(
        'Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada ou reenvie o link de confirmação abaixo.',
      );
      setShowResendConfirmation(true);
    }
    if (searchParams.get('confirm_email') === 'required') {
      setErrorMessage(
        'Confirme seu e-mail antes de acessar as áreas protegidas. Abra o link enviado para o seu endereço.',
      );
    }
  }, []);

  async function handleResendConfirmation() {
    setMessage('');
    setErrorMessage('');
    const parsedEmail = resetRequestSchema.safeParse({ email: emailInput });
    if (!parsedEmail.success) {
      setErrorMessage(
        parsedEmail.error.issues[0]?.message ??
          'Informe seu e-mail acima para reenviar o link de confirmação.',
      );
      return;
    }

    setIsResending(true);
    try {
      await reenviarConfirmacaoEmail(
        parsedEmail.data.email,
        `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
      );
      setMessage(
        'Se a conta estiver pendente de confirmação, reenviamos o link para o seu e-mail.',
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível reenviar o e-mail de confirmação.',
      );
    } finally {
      setIsResending(false);
    }
  }

  async function handleSwitchAccount() {
    await sairDaConta().catch(() => null);
    setBiometricStep('none');
    setMessage('');
    setErrorMessage('');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setErrorMessage('');
    setShowResendConfirmation(false);

    const formData = new FormData(event.currentTarget);
    const email = emailInput.trim();
    const password = String(formData.get('password') ?? '');
    const displayName = String(formData.get('displayName') ?? '').trim();

    if (isResetRequest) {
      const parsed = resetRequestSchema.safeParse({ email });
      if (!parsed.success) {
        setErrorMessage(parsed.error.issues[0]?.message ?? 'Informe um e-mail válido.');
        return;
      }
    } else if (isSignUp) {
      const parsed = signUpSchema.safeParse({ email, password, displayName });
      if (!parsed.success) {
        setErrorMessage(parsed.error.issues[0]?.message ?? 'Confira os dados do cadastro.');
        return;
      }
    } else {
      const parsed = loginSchema.safeParse({ email, password });
      if (!parsed.success) {
        setErrorMessage(parsed.error.issues[0]?.message ?? 'E-mail ou senha inválidos.');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      if (isResetRequest) {
        await enviarRecuperacaoSenha(
          email,
          `${window.location.origin}/auth/callback?next=/senha/nova`,
        );
        setMessage(
          'Se houver uma conta com esse e-mail, enviaremos um link para redefinir a senha.',
        );
        return;
      }

      if (isSignUp) {
        const data = await cadastrarUsuario({
          email,
          password,
          displayName,
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        });

        if (data.session && (data.user?.email_confirmed_at || data.user?.confirmed_at)) {
          router.replace(nextPath);
          router.refresh();
          return;
        }
        setShowResendConfirmation(true);
        setMessage(
          'Cadastro iniciado. Verifique seu e-mail para confirmar a conta antes de entrar.',
        );
        return;
      }

      await entrarComEmailSenha({ email, password });

      const bioStatus = await consultarBiometriaFacial().catch(() => null);
      if (bioStatus?.schemaReady) {
        if (bioStatus.enrolled) {
          setBiometricStep('verify');
          setMessage(
            'Credenciais validadas. Confirme sua biometria facial para liberar o acesso.',
          );
          return;
        }
        if (bioStatus.isVeterinarian) {
          setBiometricStep('enroll');
          setMessage(
            'Não identificamos biometria facial cadastrada para sua conta veterinária. Realize o cadastro biométrico abaixo para continuar.',
          );
          return;
        }
      }

      router.replace(nextPath);
      router.refresh();
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : 'Não foi possível concluir a autenticação.';
      setErrorMessage(msg);
      if (msg.toLowerCase().includes('confirme seu e-mail')) {
        setShowResendConfirmation(true);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f6faff] px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
        <Link className="text-sm font-bold text-[#087a68]" href="/">
          ← Voltar ao DrVet
        </Link>
        <p className="mt-7 text-xs font-bold uppercase tracking-[0.18em] text-[#087a68]">
          {biometricStep !== 'none' ? 'Biometria Facial' : 'Acesso seguro'}
        </p>
        <h1 className="mt-2 text-3xl font-extrabold text-[#153b50]">
          {biometricStep === 'enroll'
            ? 'Cadastrar biometria facial'
            : biometricStep === 'verify'
              ? 'Validar biometria facial'
              : isResetRequest
                ? 'Recuperar senha'
                : isSignUp
                  ? 'Criar conta'
                  : 'Entrar no DrVet'}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {biometricStep === 'enroll'
            ? 'Sua conta veterinária ainda não possui biometria facial ativa. Conclua a captura pela câmera para salvar no sistema e no banco de dados.'
            : biometricStep === 'verify'
              ? 'Sua conta possui biometria facial cadastrada. Confirme seu rosto pela câmera para liberar o acesso.'
              : isResetRequest
                ? 'Informe seu e-mail e enviaremos instruções para redefinir sua senha.'
                : 'Sua conta autenticada protege o acesso aos dados de tutores e pacientes.'}
        </p>

        {needsSetup && (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            Supabase ainda não configurado neste ambiente (falta definir{' '}
            <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_URL</code> e{' '}
            <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> no{' '}
            <code className="font-mono text-xs">.env.local</code>). Enquanto isso, acesse as
            rotas públicas{' '}
            <Link className="font-bold underline" href="/">
              Home
            </Link>
            ,{' '}
            <Link className="font-bold underline" href="/cadastro">
              Cadastro QR
            </Link>{' '}
            ou{' '}
            <Link className="font-bold underline" href="/apresentacao">
              Apresentação
            </Link>
            .
          </div>
        )}

        {biometricStep !== 'none' ? (
          <div className="mt-6 grid gap-4">
            {message && (
              <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900" role="status">
                {message}
              </p>
            )}
            <FacialBiometricsCapture
              mode={biometricStep}
              onCompleted={() => {
                router.replace(nextPath);
                router.refresh();
              }}
            />
            <button
              className="min-h-10 w-full rounded-full border border-slate-200 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              onClick={() => void handleSwitchAccount()}
              type="button"
            >
              Sair / entrar com outra conta
            </button>
          </div>
        ) : (
          <>
            <form className="mt-6 grid gap-4" noValidate onSubmit={handleSubmit}>
              {isSignUp && !isResetRequest && (
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                  Nome completo
                  <input
                    autoComplete="name"
                    className="min-h-11 rounded-xl border border-slate-300 px-3"
                    maxLength={120}
                    name="displayName"
                    required
                  />
                </label>
              )}
              <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                E-mail
                <input
                  autoComplete="email"
                  className="min-h-11 rounded-xl border border-slate-300 px-3"
                  name="email"
                  onChange={(event) => setEmailInput(event.target.value)}
                  required
                  type="email"
                  value={emailInput}
                />
              </label>
              {!isResetRequest && (
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                  Senha
                  <input
                    autoComplete={isSignUp ? 'new-password' : 'current-password'}
                    className="min-h-11 rounded-xl border border-slate-300 px-3"
                    minLength={8}
                    name="password"
                    required
                    type="password"
                  />
                </label>
              )}

              {errorMessage && (
                <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">
                  {errorMessage}
                </p>
              )}
              {message && (
                <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900" role="status">
                  {message}
                </p>
              )}

              {showResendConfirmation && (
                <button
                  className="min-h-10 rounded-xl border border-[#087a68]/30 bg-[#ebf5ff] px-4 text-xs font-bold text-[#087a68] hover:bg-[#dff0ff] disabled:opacity-60"
                  disabled={isResending || isSubmitting}
                  onClick={() => void handleResendConfirmation()}
                  type="button"
                >
                  {isResending
                    ? 'Reenviando link de confirmação...'
                    : 'Reenviar e-mail de confirmação'}
                </button>
              )}

              <button
                className="min-h-12 rounded-full bg-[#087a68] px-5 font-bold text-white disabled:opacity-60"
                disabled={isSubmitting}
                type="submit"
              >
                {isSubmitting
                  ? 'Aguarde...'
                  : isResetRequest
                    ? 'Enviar instruções'
                    : isSignUp
                      ? 'Criar conta'
                      : 'Entrar'}
              </button>
            </form>

            {!isSignUp && !isResetRequest && (
              <button
                className="mt-4 min-h-10 w-full text-sm font-semibold text-[#087a68]"
                onClick={() => {
                  setIsResetRequest(true);
                  setMessage('');
                  setErrorMessage('');
                  setShowResendConfirmation(false);
                }}
                type="button"
              >
                Esqueci minha senha
              </button>
            )}

            <button
              className="mt-5 min-h-11 w-full text-sm font-semibold text-[#087a68]"
              onClick={() => {
                if (isResetRequest) {
                  setIsResetRequest(false);
                  setIsSignUp(false);
                } else {
                  setIsSignUp((current) => !current);
                }
                setMessage('');
                setErrorMessage('');
                setShowResendConfirmation(false);
              }}
              type="button"
            >
              {isResetRequest
                ? 'Voltar para entrar'
                : isSignUp
                  ? 'Já tenho uma conta'
                  : 'Criar uma conta de tutor'}
            </button>
          </>
        )}
      </section>
    </main>
  );
}
