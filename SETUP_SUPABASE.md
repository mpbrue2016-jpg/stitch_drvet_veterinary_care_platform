# Guia de Configuração do Supabase e Vercel — DrVet

Siga a ordem exata abaixo para colocar o backend **DrVet** no ar com segurança.

---

## 1. Criar o projeto no Supabase

1. Acesse [https://supabase.com/dashboard](https://supabase.com/dashboard) e clique em **New project**.
2. Escolha a organização, defina o nome (`drvet-prod` ou `drvet-staging`), uma senha forte para o PostgreSQL e a região mais próxima (ex.: `South America (São Paulo)`).
3. Aguarde a provisão e acesse **Project Settings → API** para copiar:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** (ou **publishable key**) → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

> **Atenção**: nunca coloque a chave `service_role` em variáveis `NEXT_PUBLIC_` nem no código frontend.

---

## 2. Rodar as Migrations SQL (em ordem exata)

Você pode rodar via **Supabase CLI** ou colar cada arquivo no **SQL Editor** do painel do Supabase **na ordem numérica abaixo**:

### Opção A — Via Supabase CLI (recomendada)
```bash
supabase link --project-ref <SEU_PROJECT_REF>
supabase db push
```

### Opção B — Manualmente no SQL Editor
Execute um arquivo por vez, nesta ordem exata:
1. `supabase/migrations/20261112210000_initial_drvet_backend.sql`
2. `supabase/migrations/20261112213000_clinical_records.sql`
3. `supabase/migrations/20261112214000_vaccination_records.sql`
4. `supabase/migrations/20261112215000_exam_orders.sql`
5. `supabase/migrations/20261112216000_availability_blocks.sql`
6. `supabase/migrations/20261112217000_prescription_drafts.sql`
7. `supabase/migrations/20261113000100_profiles_roles_and_updated_at.sql`
8. `supabase/migrations/20261113000200_commissions_and_payouts.sql`
9. `supabase/migrations/20261113000300_storage_buckets_and_policies.sql`
10. `supabase/migrations/20261113000400_teleconsulta_subscriptions_partners.sql`
11. `supabase/migrations/20261113000500_admin_integrations_and_checkout.sql`

---

## 3. Rodar o Seed inicial (`supabase/seed.sql`)

Após todas as migrations passarem sem erro, execute o arquivo `supabase/seed.sql` no **SQL Editor** (ou via `supabase db reset` em ambiente local).

O seed cria de forma idempotente organização, clínica, equipe, pets (`Pipoca`, `Thor`, `Luna`), horários disponíveis, consultas, prontuários SOAP, vacinas, exames, rascunhos de receita, conta de repasse e lançamentos de comissão, além das seguintes contas de teste (senha padrão **`DrVet@2026`**):

| E-mail | Perfil (`role`) | Uso recomendado |
|---|---|---|
| `admin@drvet.local` | `admin` | Acesso completo à organização, aprovações e painel administrativo |
| `camila.vet@drvet.local` | `veterinarian` (aprovada) | Agenda semanal, prontuário SOAP, vacinas, exames, receitas e comissões |
| `rafael.vet@drvet.local` | `veterinarian` (pendente) | Testar bloqueio antes da aprovação pela clínica |
| `mariana.tutor@drvet.local` | `tutor` | Cadastro de pets, agendamento, consulta de prontuários finalizados, vacinas e exames |

---

## 4. Configurar o Supabase Auth (URLs do localhost e Vercel)

No painel do Supabase, acesse **Authentication → URL Configuration**:

1. **Site URL**:
   - Produção: `https://<seu-dominio>.vercel.app`
   - Desenvolvimento local: `http://localhost:3000`
2. **Redirect URLs** (adicione todas as URLs permitidas):
   - `http://localhost:3000/auth/callback`
   - `http://localhost:3000/auth/callback?next=/senha/nova`
   - `https://<seu-dominio>.vercel.app/auth/callback`
   - `https://<seu-dominio>.vercel.app/auth/callback?next=/senha/nova`
   - `https://*-<seu-usuario>.vercel.app/auth/callback` (opcional para previews da Vercel)
3. Em **Authentication → Providers → Email**:
   - Mantenha **Email** habilitado.
   - Em desenvolvimento, você pode opcionalmente desativar *Confirm email* para logins instantâneos em novos cadastros; em produção, mantenha ativado.

---

## 5. Verificar os Buckets de Storage

A migration `20261113000300_storage_buckets_and_policies.sql` cria automaticamente os 3 buckets privados e suas políticas RLS em `storage.objects`:

| Bucket | Público | Limite | MIME types permitidos | Padrão de caminho |
|---|---|---|---|---|
| `exam-reports` | Não (privado) | 10 MB | `application/pdf`, `image/jpeg`, `image/png`, `image/webp` | `<pet_id>/<exam_order_id>/<arquivo>` |
| `clinical-attachments` | Não (privado) | 10 MB | `application/pdf`, `image/jpeg`, `image/png`, `image/webp` | `<pet_id>/<appointment_id>/<arquivo>` |
| `pet-avatars` | Não (privado) | 5 MB | `image/jpeg`, `image/png`, `image/webp` | `<owner_id>/<pet_id>/<arquivo>` |

Confira em **Storage → Buckets** no painel se os 3 buckets aparecem após executar a migration. Caso o projeto utilize restrições extras de SQL Editor para o schema `storage`, crie os 3 buckets manualmente com os mesmos nomes acima (`Public bucket = OFF`) e execute apenas as políticas `create policy ... on storage.objects`.

---

## 6. Publicar as Edge Functions (opcional / financeiro)

As funções server-side ficam em `supabase/functions/`:
- `request-anticipation`: valida saldo disponível e registra solicitação de antecipação via RPC.
- `payment-webhook`: recebe webhooks do gateway (Asaas / Mercado Pago) validando `x-webhook-secret` e atualizando `commission_ledger` usando `SUPABASE_SERVICE_ROLE_KEY` exclusivamente no servidor.

```bash
# Definir segredo do webhook nas Edge Functions
supabase secrets set PAYMENT_WEBHOOK_SECRET=<seu-segredo-forte>

# Publicar funções
supabase functions deploy request-anticipation
supabase functions deploy payment-webhook --no-verify-jwt
```

---

## 7. Variáveis de ambiente no Vercel

No painel da Vercel (**Project → Settings → Environment Variables**), cadastre para *Production*, *Preview* e *Development*:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<seu-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<sua-anon-key>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<opcional-se-usar-publishable-key>
```

Após salvar as variáveis, dispare um **Redeploy** na Vercel.
