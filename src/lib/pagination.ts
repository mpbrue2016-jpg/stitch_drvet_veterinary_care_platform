export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface ListFilterParams {
  page: number;
  limit: number;
  q: string;
  from: string | null;
  to: string | null;
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function matchesTextQuery(
  fields: Array<string | null | undefined>,
  query: string,
): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;
  return fields.some(
    (field) =>
      typeof field === 'string' &&
      normalizeSearchText(field).includes(normalizedQuery),
  );
}

export function matchesPeriodFilter(
  value: string | null | undefined,
  from: string | null,
  to: string | null,
): boolean {
  if (!from && !to) return true;
  if (!value) return false;
  const targetMs = new Date(value).getTime();
  if (Number.isNaN(targetMs)) return false;

  if (from) {
    const fromDate = from.length === 10 ? `${from}T00:00:00.000Z` : from;
    const fromMs = new Date(fromDate).getTime();
    if (!Number.isNaN(fromMs) && targetMs < fromMs) return false;
  }

  if (to) {
    const toDate = to.length === 10 ? `${to}T23:59:59.999Z` : to;
    const toMs = new Date(toDate).getTime();
    if (!Number.isNaN(toMs) && targetMs > toMs) return false;
  }

  return true;
}

export function parseListFilterParams(
  searchParams: { get(name: string): string | null },
  defaults: { limit?: number; maxLimit?: number } = {},
): ListFilterParams {
  const defaultLimit = defaults.limit ?? 20;
  const maxLimit = defaults.maxLimit ?? 100;

  const rawPage = Number.parseInt(searchParams.get('page') ?? '1', 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;

  const rawLimit = Number.parseInt(
    searchParams.get('limit') ?? String(defaultLimit),
    10,
  );
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, maxLimit)
      : defaultLimit;

  const q = (searchParams.get('q') ?? '').trim().slice(0, 120);
  const fromRaw = (searchParams.get('from') ?? '').trim();
  const toRaw = (searchParams.get('to') ?? '').trim();

  return {
    page,
    limit,
    q,
    from: fromRaw || null,
    to: toRaw || null,
  };
}

export function paginateItems<T>(
  items: T[],
  options: { page?: number; limit?: number } = {},
): { items: T[]; pagination: PaginationMeta } {
  const total = items.length;
  const limit = Math.max(1, Math.min(options.limit ?? 20, 200));
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const requestedPage = options.page ?? 1;
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const start = (page - 1) * limit;

  return {
    items: items.slice(start, start + limit),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
}
