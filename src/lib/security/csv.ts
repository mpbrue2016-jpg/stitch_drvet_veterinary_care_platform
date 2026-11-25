const FORMULA_PREFIX_PATTERN = /^[=+\-@\t\r]/;

export function sanitizeCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const trimmedStart = raw.replace(/^ +/, '');
  const neutralized =
    FORMULA_PREFIX_PATTERN.test(raw) || FORMULA_PREFIX_PATTERN.test(trimmedStart)
      ? `'${raw}`
      : raw;
  return `"${neutralized.replace(/"/g, '""')}"`;
}

export function buildUtf8Csv(
  headers: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<unknown>>,
  delimiter = ';',
): string {
  const lines = [
    headers.map((header) => sanitizeCsvCell(header)).join(delimiter),
    ...rows.map((row) => row.map((cell) => sanitizeCsvCell(cell)).join(delimiter)),
  ];
  return `\uFEFF${lines.join('\n')}`;
}
