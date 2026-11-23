import { NextResponse } from 'next/server';
import { getSupabasePublicConfig, isSupabaseConfigured } from '@/lib/supabase/config';
import {
  DRVET_ALL_TABLES,
  DRVET_MIGRATIONS_REGISTRY,
} from '@/lib/supabase/schema-registry';

export const dynamic = 'force-dynamic';

interface TableProbeResult {
  table: string;
  located: boolean;
  httpStatus: number;
  code: string | null;
}

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      configured: false,
      projectHost: null,
      projectRef: null,
      authOk: false,
      authStatus: 0,
      latencyMs: null,
      locatedTablesCount: 0,
      totalTables: DRVET_ALL_TABLES.length,
      missingTables: DRVET_ALL_TABLES,
      appliedMigrationsCount: 0,
      totalMigrations: DRVET_MIGRATIONS_REGISTRY.length,
      schemaReady: false,
      tables: [],
      migrations: DRVET_MIGRATIONS_REGISTRY.map((entry) => ({
        ...entry,
        applied: false,
        missingTables: entry.tables,
      })),
    });
  }

  const { url, key } = getSupabasePublicConfig();
  const parsed = new URL(url);
  const projectHost = parsed.host;
  const projectRef = parsed.hostname.split('.')[0] ?? null;

  const startedAt = Date.now();
  let authOk = false;
  let authStatus = 0;

  try {
    const authRes = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key },
      cache: 'no-store',
    });
    authStatus = authRes.status;
    authOk = authRes.ok;
  } catch {
    authOk = false;
    authStatus = 0;
  }

  const tableChecks = await Promise.all(
    DRVET_ALL_TABLES.map(async (table): Promise<TableProbeResult> => {
      try {
        const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=0`, {
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
          },
          cache: 'no-store',
        });

        let code: string | null = null;
        if (!res.ok) {
          try {
            const payload = (await res.json()) as { code?: string };
            code = payload.code ?? null;
          } catch {
            code = null;
          }
        }

        const isMissing = res.status === 404 || code === 'PGRST205';
        const located = !isMissing && (res.status === 200 || res.status === 401 || res.status === 403);

        return {
          table,
          located,
          httpStatus: res.status,
          code,
        };
      } catch {
        return {
          table,
          located: false,
          httpStatus: 0,
          code: 'NETWORK_ERROR',
        };
      }
    }),
  );

  const latencyMs = Date.now() - startedAt;
  const locatedSet = new Set(
    tableChecks.filter((item) => item.located).map((item) => item.table),
  );
  const missingTables = tableChecks
    .filter((item) => !item.located)
    .map((item) => item.table);

  const migrations = DRVET_MIGRATIONS_REGISTRY.map((entry) => {
    const missingInEntry = entry.tables.filter((t) => !locatedSet.has(t));
    return {
      ...entry,
      applied: missingInEntry.length === 0,
      missingTables: missingInEntry,
    };
  });

  const appliedMigrationsCount = migrations.filter((m) => m.applied).length;

  return NextResponse.json({
    configured: true,
    projectHost,
    projectRef,
    authOk,
    authStatus,
    latencyMs,
    locatedTablesCount: locatedSet.size,
    totalTables: DRVET_ALL_TABLES.length,
    missingTables,
    appliedMigrationsCount,
    totalMigrations: DRVET_MIGRATIONS_REGISTRY.length,
    schemaReady: locatedSet.size === DRVET_ALL_TABLES.length,
    tables: tableChecks,
    migrations,
  });
}
