import { generateVAPIDKeys, setVapidDetails } from 'web-push';

interface VapidState {
  publicKey: string;
  privateKey: string;
  subject: string;
  usingEnvKeys: boolean;
}

let cachedVapid: VapidState | null = null;

function isValidSubject(value: string): boolean {
  return value.startsWith('mailto:') || value.startsWith('https://');
}

export function getServerVapidConfig(): VapidState {
  if (cachedVapid) return cachedVapid;

  const envPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? '';
  const envPrivate = process.env.VAPID_PRIVATE_KEY?.trim() ?? '';
  const rawSubject = process.env.VAPID_SUBJECT?.trim() ?? '';
  const subject = isValidSubject(rawSubject) ? rawSubject : 'mailto:contato@drvets.com.br';

  if (envPublic && envPrivate) {
    cachedVapid = {
      publicKey: envPublic,
      privateKey: envPrivate,
      subject,
      usingEnvKeys: true,
    };
  } else {
    const generated = generateVAPIDKeys();
    cachedVapid = {
      publicKey: generated.publicKey,
      privateKey: generated.privateKey,
      subject,
      usingEnvKeys: false,
    };
  }

  setVapidDetails(
    cachedVapid.subject,
    cachedVapid.publicKey,
    cachedVapid.privateKey,
  );

  return cachedVapid;
}

export function getPublicVapidInfo() {
  const { publicKey, usingEnvKeys } = getServerVapidConfig();
  return {
    publicKey,
    vapidConfiguredFromEnv: usingEnvKeys,
    supportPush: true,
  };
}
