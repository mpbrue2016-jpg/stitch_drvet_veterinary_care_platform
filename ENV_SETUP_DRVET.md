# Guia Técnico de Configuração Segura (`.env.local` e Supabase) — DrVet

Este guia descreve como configurar o arquivo `.env.local` do **DrVet** com base nas variáveis reais utilizadas pelo código-fonte (`.env.example`), nas **15 migrations** em `supabase/migrations/` (32 tabelas) e nas diretrizes de segurança registradas em `AUDIT_ACAO_DRVET.md`.

> **Regra de ouro de segurança:** nunca comite `.env`, `.env.local` ou chaves reais no GitHub, em logs ou em código frontend. O arquivo `.gitignore` do projeto já bloqueia `.env`, `.env.*` (exceto `.env.example`), `*.pem`, `*.key`, `*.p12`, `*.pfx` e `service-account*.json`.

---

## 1. Pré-requisitos e Criação do `.env.local`

1. Copie o template oficial sem alterar `.env.example`:
   ```bash
   cp .env.example .env.local
   ```
2. Confirme que `.env.local` está ignorado pelo Git antes de inserir qualquer chave:
   ```bash
   git check-ignore -v .env.local
   ```
   A saída esperada deve apontar para a regra `.env.*` em `.gitignore`.

---

## 2. Inventário Completo de Variáveis (`.env.example`)

O DrVet utiliza **13 variáveis** reais no runtime atual, divididas em **variáveis públicas** (`NEXT_PUBLIC_*`, enviadas ao bundle do navegador) e **variáveis exclusivas de servidor** (acessíveis apenas em Route Handlers `app/api/*`, Server Components e `middleware.ts`).

### 2.1 Variáveis Públicas (Browser + Servidor)

| Variável | Obrigatória | Onde é obtida / Formato | Uso no Código & Migrations |
| :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | **Sim** | Painel Supabase → **Project Settings → Data API / API** (`https://<project-ref>.supabase.co`). Deve usar `https://` (apenas `http://localhost` é aceito em desenvolvimento local). | `src/lib/supabase/config.ts`, `src/lib/supabase.ts`. Conecta Auth, PostgREST, Realtime WebRTC (`teleconsultation_messages`) e Storage (`exam-reports`, `clinical-attachments`, `pet-avatars`). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Sim** (ou Publishable Key) | Painel Supabase → **Project Settings → API Keys** (`anon` / JWT legado). | `src/lib/supabase/config.ts`. Chave pública sujeita integralmente às políticas **RLS** definidas nas migrations `1` a `15`. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Opcional (alternativa moderna à `ANON_KEY`) | Painel Supabase → **Project Settings → API Keys** (`sb_publishable_...`). Se ambas existirem, `config.ts` prioriza `PUBLISHABLE_KEY` e `src/lib/supabase.ts` prioriza `ANON_KEY`; recomenda-se preencher com a chave compatível ou apenas a correspondente ao projeto. | `src/lib/supabase/config.ts`, `src/lib/supabase.ts`, `app/api/supabase/schema-status/route.ts`. |
| `NEXT_PUBLIC_APP_URL` | **Sim em Staging/Prod** | URL canônica pública da aplicação sem barra final (ex.: `http://localhost:3000` em dev ou `https://app.seudominio.com.br` em produção). | `src/lib/supabase/config.ts` (`getAppBaseUrl`). Usada na montagem de callbacks `/auth/callback`, redirecionamentos OAuth e links de verificação pública de receitas (`/receitas/verificar`). |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Recomendada (obrigatória para Push persistente) | Chave pública VAPID em Base64URL gerada em par com `VAPID_PRIVATE_KEY` (via `npx web-push generate-vapid-keys`). | `src/lib/push/vapid.ts`, `app/api/push/config/route.ts`, `app/api/admin/mvp-readiness/route.ts`. Sem ela, o servidor gera chaves efêmeras em memória e assinaturas da tabela `push_subscriptions` (migration `12`) invalidam ao reiniciar o processo. |

> **Atenção:** nunca copie `SUPABASE_SERVICE_ROLE_KEY`, `PAYMENT_WEBHOOK_SECRET`, `MERCADO_PAGO_ACCESS_TOKEN` ou `VAPID_PRIVATE_KEY` para variáveis com prefixo `NEXT_PUBLIC_`.

---

### 2.2 Variáveis Exclusivas de Servidor (Nunca Expor no Frontend)

| Variável | Obrigatória | Onde obter / Como gerar | Uso no Código & Impacto nas Migrations |
| :--- | :--- | :--- | :--- |
| `SUPABASE_SERVICE_ROLE_KEY` | **Sim para Webhooks, Outbox, Auditoria e Push em background** | Painel Supabase → **Project Settings → API Keys → Secret / `service_role`**. **Bypassa RLS**; manter estritamente no servidor. | `app/api/payments/webhook/route.ts` (RPC `settle_payment_order` e tabela `webhook_events`), `src/lib/notifications/outbox.ts` (`audit_logs` e `notification_outbox` das migrations `14` e `15`) e `src/lib/push/server-dispatch.ts` (`push_subscriptions`). |
| `PAYMENT_WEBHOOK_SECRET` | **Sim para `/api/payments/webhook`** | Segredo criptográfico aleatório (mínimo 32 bytes em hex/base64, ex.: `openssl rand -hex 32`) ou segredo de assinatura de webhook do provedor (Mercado Pago / Asaas). | `app/api/payments/webhook/route.ts`, `src/lib/payments/architecture.ts`. Exigida na validação em tempo constante (`x-webhook-secret`) e HMAC-SHA256 (`x-signature`). Se ausente, o endpoint recusa liquidações com HTTP `401`. |
| `MERCADO_PAGO_ACCESS_TOKEN` | Opcional em Dev; **Obrigatória para checkout gateway real** | Painel Mercado Pago Developers → **Suas integrações → Credenciais de Teste (Sandbox) ou Produção** (`APP_USR-...`). | `app/api/payments/checkout/route.ts`, `src/lib/payments/architecture.ts`. Quando configurada, gera cobrança PIX real via API Mercado Pago (`gatewayMode: 'mercado_pago_pix'`); quando ausente, o checkout gera apenas BR-Code EMVCo estático (`static_pix_brcode`) sem baixa automática de gateway. |
| `PIX_MERCHANT_KEY` | Recomendada (fallback BR-Code estático) | Chave PIX recebedora da clínica/plataforma (CNPJ, EVP aleatória, e-mail ou telefone em E.164 `+55...`). | `src/lib/payments/pix.ts`. Utilizada na geração do EMVCo BR-Code quando `MERCADO_PAGO_ACCESS_TOKEN` não estiver ativo ou indisponível. |
| `PIX_MERCHANT_NAME` | Opcional | Nome do recebedor (ASCII, máximo 25 caracteres, padrão `DrVets Telemedicina`). | `src/lib/payments/pix.ts`. |
| `PIX_MERCHANT_CITY` | Opcional | Cidade do recebedor sem acentos (máximo 15 caracteres, padrão `Sao Paulo`). | `src/lib/payments/pix.ts`. |
| `VAPID_PRIVATE_KEY` | Recomendada (em par com `NEXT_PUBLIC_VAPID_PUBLIC_KEY`) | Chave privada gerada junto com a chave pública via `npx web-push generate-vapid-keys`. | `src/lib/push/vapid.ts`, `src/lib/push/server-dispatch.ts`. Assina notificações Web Push para a tabela `push_subscriptions` (migration `12`). |
| `VAPID_SUBJECT` | Recomendada | URI de contato administrativo no formato `mailto:contato@seudominio.com.br` ou `https://seudominio.com.br`. | `src/lib/push/vapid.ts`. Exigido pelo protocolo Web Push (RFC 8292). |

---

## 3. Dependências entre `.env.local` e as 15 Migrations (`supabase/migrations/`)

As **32 tabelas** do projeto exigem que o schema e a configuração do painel Supabase estejam alinhados às variáveis de ambiente:

1. **Autenticação e Confirmação de E-mail (Migrations `01`, `07`, `13`)**
   - `profiles`, `user_role`, `organization_memberships`, `role_applications`.
   - No painel Supabase (**Authentication → URL Configuration**), configure:
     - **Site URL:** exatamente igual a `NEXT_PUBLIC_APP_URL`.
     - **Redirect URLs:** `<NEXT_PUBLIC_APP_URL>/auth/callback` e `<NEXT_PUBLIC_APP_URL>/senha/nova`.
   - Em **Authentication → Providers → Email**, mantenha **Confirm email** habilitado em produção (o `middleware.ts` e `src/lib/auth/server-auth.ts` bloqueiam usuários sem `email_confirmed_at`).

2. **Storage Privado de Laudos e Avatares (Migration `09`)**
   - Buckets esperados: `exam-reports`, `clinical-attachments` e `pet-avatars` (RLS por organização/tutor e validação binária de *magic bytes* em `src/services/storage.service.ts`).
   - O bucket `teleconsultation-recordings` (política LGPD/CFMV da migration `15`) permanece **desativado por política** (`storageBucketProvisioned: false` em `app/api/teleconsultation/consent/route.ts`) até provisionamento dedicado de bucket privado criptografado e retenção de 1825 dias.

3. **Pagamentos, Webhooks Idempotentes e Auditoria (Migrations `08`, `10`, `11`, `14`, `15`)**
   - `payment_orders`, `commission_ledger`, `webhook_events`, `audit_logs`, `notification_outbox`.
   - Todas as inserções em `webhook_events`, `audit_logs` e `notification_outbox` no servidor dependem exclusivamente de `SUPABASE_SERVICE_ROLE_KEY` (as políticas RLS proíbem `insert/update/delete` direto pelos clientes `anon` e `authenticated`).

4. **Web Push (Migration `12`)**
   - `push_subscriptions` e `in_app_notifications` requerem par fixo `NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT` + `SUPABASE_SERVICE_ROLE_KEY` para disparos em segundo plano via `/api/push/dispatch-appointment`.

---

## 4. Exemplo Estrutural de `.env.local` (Apenas Placeholders)

Preencha **somente no seu `.env.local` local** ou no gerenciador de segredos da hospedagem (Vercel / Cloud Run / Docker Secrets):

```dotenv
# === Supabase (Público) ===
NEXT_PUBLIC_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<SUPABASE_ANON_KEY>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<SUPABASE_PUBLISHABLE_KEY_OU_VAZIO>
NEXT_PUBLIC_APP_URL=http://localhost:3000

# === Web Push VAPID ===
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<VAPID_PUBLIC_KEY>
VAPID_PRIVATE_KEY=<VAPID_PRIVATE_KEY>
VAPID_SUBJECT=mailto:suporte@seudominio.com.br

# === Servidor Supabase (SECRETO - nunca usar NEXT_PUBLIC_) ===
SUPABASE_SERVICE_ROLE_KEY=<SUPABASE_SERVICE_ROLE_KEY>

# === Pagamentos & Webhooks (SECRETO - nunca usar NEXT_PUBLIC_) ===
PAYMENT_WEBHOOK_SECRET=<GERAR_COM_OPENSSL_RAND_HEX_32>
MERCADO_PAGO_ACCESS_TOKEN=<MP_ACCESS_TOKEN_SANDBOX_OU_PROD>
PIX_MERCHANT_KEY=<CHAVE_PIX_RECEBEDORA>
PIX_MERCHANT_NAME=DrVets Telemedicina
PIX_MERCHANT_CITY=Sao Paulo
```

> **Nota sobre variáveis futuras (ainda não implementadas no código):** credenciais como `ASAAS_API_KEY`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `RESEND_API_KEY` ou `WHATSAPP_ACCESS_TOKEN` **não devem** ser adicionadas a `.env.example` antes da implementação dos respectivos adaptadores, conforme regra da FASE 3 em `AUDIT_ACAO_DRVET.md`. Atualmente, `src/lib/payments/architecture.ts` checa `ASAAS_API_KEY` apenas como diagnóstico informativo no painel Admin (`Prontidão MVP & Auditoria`).

---

## 5. Checklist de Validação Pós-Configuração

1. **Aplicar as migrations em Dev/Staging:** siga estritamente a ordem de `1` a `15` em `supabase/README_MIGRATIONS.md` (não execute automaticamente em produção sem autorização e backup).
2. **Validar schema sem expor segredos:**
   - Acesse `/api/supabase/schema-status` (ou aba **Prontidão MVP & Auditoria** em `/admin` logado como `admin`).
   - Confirme `authOk: true` e `locatedTablesCount: 32` (`totalTables: 32`).
3. **Validar prontidão de gateways e canais (somente Admin):**
   - No painel `/admin` → **Prontidão MVP & Auditoria**, confirme que Mercado Pago / Webhook HMAC / Web Push exibem `Pronto no servidor` / `VAPID ativo` (sem exibir nenhuma chave na tela).
4. **Conferir higiene do repositório antes de qualquer `git commit`:**
   ```bash
   git status --short
   ```
   Garanta que `.env.local` **nunca** apareça listado como arquivo rastreado ou preparado para commit.
