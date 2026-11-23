function formatEmvField(id: string, value: string): string {
  const length = String(value.length).padStart(2, '0');
  return `${id}${length}${value}`;
}

function normalizeAscii(input: string, maxLength: number): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 .\-@/]/g, '')
    .trim()
    .slice(0, maxLength);
}

function computeCrc16Ccitt(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export interface PixBrCodeParams {
  amountCents: number;
  txid: string;
  description?: string;
  merchantKey?: string;
  merchantName?: string;
  merchantCity?: string;
}

export function buildPixBrCode(params: PixBrCodeParams): string {
  const key = (
    params.merchantKey ||
    process.env.PIX_MERCHANT_KEY ||
    'pix@drvets.com.br'
  ).trim();
  const merchantName = normalizeAscii(
    params.merchantName || process.env.PIX_MERCHANT_NAME || 'DrVets Telemedicina',
    25,
  ) || 'DrVets';
  const merchantCity = normalizeAscii(
    params.merchantCity || process.env.PIX_MERCHANT_CITY || 'Sao Paulo',
    15,
  ) || 'Sao Paulo';
  const txid = normalizeAscii(params.txid.replace(/[^A-Za-z0-9]/g, ''), 25) || 'DRVETPIX';

  const merchantAccountSubfields = [
    formatEmvField('00', 'BR.GOV.BCB.PIX'),
    formatEmvField('01', key.slice(0, 77)),
  ];
  if (params.description) {
    const cleanDesc = normalizeAscii(params.description, 40);
    if (cleanDesc) {
      merchantAccountSubfields.push(formatEmvField('02', cleanDesc));
    }
  }

  const amountStr = (Math.max(1, params.amountCents) / 100).toFixed(2);
  const additionalData = formatEmvField('05', txid);

  const partial = [
    formatEmvField('00', '01'),
    formatEmvField('26', merchantAccountSubfields.join('')),
    formatEmvField('52', '0000'),
    formatEmvField('53', '986'),
    formatEmvField('54', amountStr),
    formatEmvField('58', 'BR'),
    formatEmvField('59', merchantName),
    formatEmvField('60', merchantCity),
    formatEmvField('62', additionalData),
    '6304',
  ].join('');

  return `${partial}${computeCrc16Ccitt(partial)}`;
}
