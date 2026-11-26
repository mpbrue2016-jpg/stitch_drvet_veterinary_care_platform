import { formatTwilioWhatsappAddress } from './vet-reminders';

export interface TwilioWhatsappInput {
  to: string | null | undefined;
  body: string;
}

export interface TwilioWhatsappResult {
  sent: boolean;
  queued: boolean;
  provider: 'twilio_whatsapp' | 'outbox_queue';
  providerMessageSid: string | null;
  normalizedTo: string | null;
  error: string | null;
}

const TWILIO_ACCOUNT_SID_REGEX = /^AC[a-fA-F0-9]{32}$/;

function getTwilioConfig(): {
  accountSid: string;
  authToken: string;
  fromAddress: string;
} | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim() ?? '';
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim() ?? '';
  const fromAddress = formatTwilioWhatsappAddress(
    process.env.TWILIO_WHATSAPP_FROM?.trim(),
  );

  if (
    !TWILIO_ACCOUNT_SID_REGEX.test(accountSid) ||
    !authToken ||
    !fromAddress
  ) {
    return null;
  }

  return { accountSid, authToken, fromAddress };
}

export function isWhatsappProviderConfigured(): boolean {
  return getTwilioConfig() !== null;
}

export async function sendWhatsappReminder(
  input: TwilioWhatsappInput,
): Promise<TwilioWhatsappResult> {
  const toAddress = formatTwilioWhatsappAddress(input.to);
  if (!toAddress) {
    return {
      sent: false,
      queued: false,
      provider: 'outbox_queue',
      providerMessageSid: null,
      normalizedTo: null,
      error: 'Destinatário sem número WhatsApp válido cadastrado.',
    };
  }

  const messageBody = input.body.trim().slice(0, 1600);
  if (!messageBody) {
    return {
      sent: false,
      queued: false,
      provider: 'outbox_queue',
      providerMessageSid: null,
      normalizedTo: toAddress,
      error: 'Conteúdo da mensagem WhatsApp vazio.',
    };
  }

  const config = getTwilioConfig();
  if (!config) {
    return {
      sent: false,
      queued: true,
      provider: 'outbox_queue',
      providerMessageSid: null,
      normalizedTo: toAddress,
      error: null,
    };
  }

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
    config.accountSid,
  )}/Messages.json`;

  const basicAuth = Buffer.from(
    `${config.accountSid}:${config.authToken}`,
    'utf8',
  ).toString('base64');

  const formBody = new URLSearchParams({
    From: config.fromAddress,
    To: toAddress,
    Body: messageBody,
  });

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formBody.toString(),
      signal: AbortSignal.timeout(8000),
    });

    const payload = (await response.json().catch(() => null)) as {
      sid?: string;
      message?: string;
      code?: number;
      status?: string;
    } | null;

    if (!response.ok) {
      return {
        sent: false,
        queued: false,
        provider: 'twilio_whatsapp',
        providerMessageSid: null,
        normalizedTo: toAddress,
        error:
          payload?.message ||
          `Falha ao enviar mensagem WhatsApp via Twilio (HTTP ${response.status}).`,
      };
    }

    return {
      sent: true,
      queued: false,
      provider: 'twilio_whatsapp',
      providerMessageSid: payload?.sid ?? null,
      normalizedTo: toAddress,
      error: null,
    };
  } catch (err) {
    return {
      sent: false,
      queued: false,
      provider: 'twilio_whatsapp',
      providerMessageSid: null,
      normalizedTo: toAddress,
      error:
        err instanceof Error
          ? err.message
          : 'Erro de rede ao enviar notificação WhatsApp via Twilio.',
    };
  }
}
