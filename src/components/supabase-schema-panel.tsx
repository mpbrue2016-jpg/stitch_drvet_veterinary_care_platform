'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  MetricCard,
  Skeleton,
  Toast,
} from '@/components/ui';

interface MigrationStatusItem {
  order: number;
  filename: string;
  title: string;
  stitchScope: string;
  tables: string[];
  buckets?: string[];
  applied: boolean;
  missingTables: string[];
}

interface TableProbeItem {
  table: string;
  located: boolean;
  httpStatus: number;
  code: string | null;
}

interface SchemaStatusPayload {
  configured: boolean;
  projectHost: string | null;
  projectRef: string | null;
  authOk: boolean;
  authStatus: number;
  latencyMs: number | null;
  locatedTablesCount: number;
  totalTables: number;
  missingTables: string[];
  appliedMigrationsCount: number;
  totalMigrations: number;
  schemaReady: boolean;
  tables: TableProbeItem[];
  migrations: MigrationStatusItem[];
}

export function SupabaseSchemaPanel() {
  const [status, setStatus] = useState<SchemaStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState<'migrations' | 'seed' | null>(null);
  const [notice, setNotice] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const checkSchema = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const response = await fetch('/api/supabase/schema-status', {
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error('Não foi possível consultar o status do schema.');
      }
      const payload = (await response.json()) as SchemaStatusPayload;
      setStatus(payload);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Erro ao verificar o schema do Supabase.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void checkSchema();
  }, [checkSchema]);

  async function copySql(part: 'migrations' | 'seed') {
    setCopying(part);
    setErrorMessage('');
    setNotice('');
    try {
      const query = part === 'seed' ? '?part=seed' : '';
      const response = await fetch(`/api/supabase/migrations-bundle${query}`, {
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error('Não foi possível carregar o script SQL.');
      }
      const sqlText = await response.text();
      await navigator.clipboard.writeText(sqlText);
      setNotice(
        part === 'seed'
          ? 'Script supabase/seed.sql copiado! Cole no SQL Editor do Supabase após rodar as 12 migrations.'
          : 'Script completo das 12 migrations SQL copiado! Cole e execute no SQL Editor do Supabase.',
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Falha ao copiar o script SQL para a área de transferência.',
      );
    } finally {
      setCopying(null);
    }
  }

  const sqlEditorUrl = status?.projectRef
    ? `https://supabase.com/dashboard/project/${status.projectRef}/sql/new`
    : 'https://supabase.com/dashboard';

  return (
    <div className="grid gap-5">
      {errorMessage && (
        <Toast
          message={errorMessage}
          onDismiss={() => setErrorMessage('')}
          variant="danger"
        />
      )}
      {notice && (
        <Toast
          message={notice}
          onDismiss={() => setNotice('')}
          variant="success"
        />
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          detail={
            status?.projectHost
              ? `Projeto: ${status.projectHost}`
              : 'Defina NEXT_PUBLIC_SUPABASE_URL'
          }
          icon={status?.authOk ? '✓' : '!'}
          label="Conexão Supabase Auth"
          value={
            loading
              ? '...'
              : status?.authOk
                ? `HTTP ${status.authStatus} OK`
                : status?.configured
                  ? 'Indisponível'
                  : 'Não configurado'
          }
        />
        <MetricCard
          detail={
            status?.latencyMs !== null && status?.latencyMs !== undefined
              ? `Varredura REST concluída em ${status.latencyMs} ms`
              : 'Verificação nas rotas /rest/v1/*'
          }
          icon={status?.schemaReady ? '✓' : '◫'}
          label="Tabelas Localizadas"
          value={
            loading || !status
              ? '...'
              : `${status.locatedTablesCount} / ${status.totalTables}`
          }
        />
        <MetricCard
          detail="Ordem cronológica 01 a 12 + 3 buckets"
          icon={status?.appliedMigrationsCount === status?.totalMigrations ? '✓' : '⚡'}
          label="12 Migrations SQL"
          value={
            loading || !status
              ? '...'
              : `${status.appliedMigrationsCount} / ${status.totalMigrations}`
          }
        />
      </div>

      {!loading && status && !status.schemaReady && (
        <Card
          description="A conexão Auth com o Supabase já está ativa, mas as tabelas do schema public ainda não foram criadas no banco remoto."
          title="Aplicar as 12 Migrations SQL no Supabase (1 execução)"
        >
          <div className="grid gap-4 text-sm text-slate-700">
            <p>
              Como a chave <code className="font-mono text-xs">sb_publishable_...</code> é pública e
              não possui permissão DDL para criar tabelas remotamente, execute o pacote único{' '}
              <code className="font-mono text-xs font-bold">
                supabase/install_all_11_migrations.sql
              </code>{' '}
              diretamente no <strong>SQL Editor</strong> do seu projeto Supabase. Ele já consolida
              todas as 12 migrations (incluindo Push Notifications &amp; Realtime) de forma idempotente.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={copying !== null}
                onClick={() => void copySql('migrations')}
                type="button"
                variant="primary"
              >
                {copying === 'migrations'
                  ? 'Copiando SQL...'
                  : 'Copiar SQL Completo (12 Migrations)'}
              </Button>
              <a
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-[#153b50] transition hover:bg-[#f0f8fb]"
                download="install_all_11_migrations.sql"
                href="/api/supabase/migrations-bundle?download=1"
              >
                Baixar install_all_11_migrations.sql
              </a>
              <Button
                disabled={copying !== null}
                onClick={() => void copySql('seed')}
                type="button"
                variant="outline"
              >
                {copying === 'seed'
                  ? 'Copiando Seed...'
                  : 'Copiar Seed Inicial (seed.sql)'}
              </Button>
              <a
                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#087a68] px-4 text-sm font-bold text-white transition hover:bg-[#066355]"
                href={sqlEditorUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                Abrir SQL Editor do Supabase →
              </a>
              <Button
                disabled={loading}
                onClick={() => void checkSchema()}
                type="button"
                variant="outline"
              >
                Reverificar tabelas agora
              </Button>
            </div>
          </div>
        </Card>
      )}

      {!loading && status?.schemaReady && (
        <Card
          description="Todas as 24 tabelas, 28 funções RPC, políticas RLS, Realtime e 3 buckets de Storage foram localizados no projeto."
          title="Banco de dados 100% sincronizado com o Stitch"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-emerald-900">
              Todas as 12 migrations SQL estão ativas em{' '}
              <code className="font-mono text-xs font-bold">{status.projectHost}</code>.
            </p>
            <Button
              disabled={loading}
              onClick={() => void checkSchema()}
              type="button"
              variant="outline"
            >
              Atualizar varredura
            </Button>
          </div>
        </Card>
      )}

      <Card
        description="Mapeamento ao vivo de todas as 12 migrations SQL e das 24 tabelas que alimentam os fluxos Stitch e Notificações Push do DrVet."
        title="Mapa das 12 Migrations SQL & Tabelas do Schema"
      >
        <div className="mb-4 flex justify-end">
          <Button
            disabled={loading}
            onClick={() => void checkSchema()}
            type="button"
            variant="outline"
          >
            {loading ? 'Localizando...' : 'Localizar tabelas'}
          </Button>
        </div>
        {loading || !status ? (
          <div className="grid gap-3">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : (
          <div className="grid gap-3">
            {status.migrations.map((mig) => (
              <article
                className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-[#f6faff] p-4 sm:flex-row sm:items-center"
                key={mig.filename}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-white px-2 py-0.5 font-mono text-xs font-bold text-[#153b50]">
                      {String(mig.order).padStart(2, '0')}/{String(status.totalMigrations).padStart(2, '0')}
                    </span>
                    <h3 className="font-bold text-[#153b50]">{mig.title}</h3>
                    <Badge variant={mig.applied ? 'success' : 'warning'}>
                      {mig.applied ? 'Schema OK' : 'Pendente no SQL Editor'}
                    </Badge>
                  </div>
                  <p className="mt-1 font-mono text-xs text-slate-600">
                    {mig.filename}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    <strong>Telas Stitch:</strong> {mig.stitchScope}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {mig.tables.map((tbl) => {
                      const isMissing = mig.missingTables.includes(tbl);
                      return (
                        <span
                          className={`rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold ${
                            isMissing
                              ? 'border border-amber-300 bg-amber-50 text-amber-900'
                              : 'border border-emerald-300 bg-emerald-50 text-emerald-900'
                          }`}
                          key={`${mig.filename}-${tbl}`}
                        >
                          {isMissing ? '✗' : '✓'} {tbl}
                        </span>
                      );
                    })}
                    {mig.buckets?.map((bucket) => (
                      <span
                        className="rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-sky-900"
                        key={bucket}
                      >
                        bucket: {bucket}
                      </span>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
