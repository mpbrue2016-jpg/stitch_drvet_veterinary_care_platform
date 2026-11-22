import Link from 'next/link';
import { Button, PageHeader } from '@/components/ui';
import { SupabaseSchemaPanel } from '@/components/supabase-schema-panel';

export default function SetupSupabasePage() {
  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <PageHeader
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/login">
              <Button variant="secondary">Ir para Login</Button>
            </Link>
            <Link href="/">
              <Button variant="outline">Voltar à Home</Button>
            </Link>
          </div>
        }
        description="Localização em tempo real das 24 tabelas, 28 funções RPC, Realtime Push, 3 buckets de Storage e pacote consolidado das 12 migrations SQL do DrVet."
        title="Diagnóstico do Schema & 12 Migrations SQL"
      />
      <SupabaseSchemaPanel />
    </div>
  );
}
