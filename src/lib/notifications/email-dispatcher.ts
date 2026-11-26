export interface TransactionalEmailInput {
  to: string | null | undefined;
  subject: string;
  text: string;
  html: string;
}

export interface TransactionalEmailResult {
  sent: boolean;
  queued: boolean;
  provider: 'resend' | 'outbox_queue';
  providerMessageId: string | null;
  error: string | null;
}

export function isEmailProviderConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export async function sendTransactionalEmail(
  input: TransactionalEmailInput,
): Promise<TransactionalEmailResult> {
  const recipient = input.to?.trim() ?? '';
  if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    return {
      sent: false,
      queued: false,
      provider: 'outbox_queue',
      providerMessageId: null,
      error: 'Destinatário sem endereço de e-mail válido.',
    };
  }

  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  if (!resendApiKey) {
    return {
      sent: false,
      queued: true,
      provider: 'outbox_queue',
      providerMessageId: null,
      error: null,
    };
  }

  const fromAddress =
    process.env.RESEND_FROM_EMAIL?.trim() || 'DrVet <noreply@drvet.com.br>';

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [recipient],
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
      signal: AbortSignal.timeout(8000),
    });

    const payload = (await response.json().catch(() => null)) as {
      id?: string;
      message?: string;
    } | null;

    if (!response.ok) {
      return {
        sent: false,
        queued: false,
        provider: 'resend',
        providerMessageId: null,
        error:
          payload?.message ||
          `Falha ao enviar e-mail transacional (HTTP ${response.status}).`,
      };
    }

    return {
      sent: true,
      queued: false,
      provider: 'resend',
      providerMessageId: payload?.id ?? null,
      error: null,
    };
  } catch (err) {
    return {
      sent: false,
      queued: false,
      provider: 'resend',
      providerMessageId: null,
      error:
        err instanceof Error
          ? err.message
          : 'Erro de rede ao enviar e-mail transacional.',
    };
  }
}
