# Handoff & Arquitetura — DrVet (Next.js App Router + Supabase)

Este documento resume a arquitetura implementada do **DrVet / DrVets**, cobrindo todas as rotas, entidades do banco PostgreSQL, serviços client-side, políticas RBAC/RLS e variáveis necessárias para deploy (GitHub + Supabase + Vercel).

---

## a) Rotas ativas no App Router (`app/` — 27 páginas + APIs)

| Rota | Arquivo | Perfil / Acesso | Descrição |
|---|---|---|---|
| `/` | `app/page.tsx` | Público | Landing page DrVets fiel ao Stitch com ativos WebP em `public/home/*.webp` e triagem rápida para `/agendamento/edit` |
| `/cadastro` | `app/cadastro/page.tsx` | Público | Onboarding via QR Code do Pet Shop (`?cupom=&parceiro=`), cadastro/login e cadastro do 1º pet |
| `/apresentacao` | `app/apresentacao/page.tsx` | Público | Apresentação executiva interativa e mapa navegável de rotas |
| `/login` | `app/login/page.tsx` | Público | Login, criação de conta e solicitação de recuperação de senha (preserva `?next=`) |
| `/auth/callback` | `app/auth/callback/route.ts` | Público (PKCE) | Troca de código do Supabase Auth por sessão |
| `/senha/nova` | `app/senha/nova/page.tsx` | Autenticado | Redefinição de senha após callback de recuperação |
| `/pets` | `app/pets/page.tsx` | Autenticado | CRUD de pets do tutor, avatar no Storage (`pet-avatars`), vacinas e status no Clube DrVet |
| `/pets/novo` | `app/pets/novo/page.tsx` | Autenticado | Cadastro dedicado de novo paciente |
| `/perfil` | `app/perfil/page.tsx` | Autenticado | Dados da conta, edição de nome/telefone, selo RBAC e atalhos |
| `/agendamento` | `app/agendamento/page.tsx` | Autenticado | Lista de consultas, confirmação/conclusão/cancelamento via RPC `transition_appointment` |
| `/agendamento/edit` | `app/agendamento/edit/page.tsx` | Autenticado | Solicitação de consulta com suporte a `?species=&need=&timing=&vet=&cupom=` |
| `/teleconsulta` | `app/teleconsulta/page.tsx` | Autenticado | Sala de atendimento remoto, consentimento de gravação e chat em tempo real (Realtime) |
| `/prontuarios` | `app/prontuarios/page.tsx` | Autenticado | Índice geral de prontuários SOAP |
| `/prontuarios/[appointmentId]` | `app/prontuarios/[appointmentId]/page.tsx` | Autenticado | Edição SOAP pelo veterinário designado, anexos clínicos e leitura pelo tutor após finalizado |
| `/carteira/vacinas` | `app/carteira/vacinas/page.tsx` | Autenticado | Carteira digital de vacinação e registro imutável pós-atendimento |
| `/exames` | `app/exames/page.tsx` | Autenticado | Pedidos de exames laboratoriais/imagem, registro de resultados e upload de laudos (`exam-reports`) |
| `/assinaturas` | `app/assinaturas/page.tsx` | Autenticado | Planos preventivos Clube DrVet (`subscription_plans` e `pet_subscriptions`) |
| `/pagamentos` | `app/pagamentos/page.tsx` | Autenticado | Checkout de teleconsultas via Pix/cartão/voucher, cupons e comprovantes (`payment_orders`) |
| `/parceiros` | `app/parceiros/page.tsx` | Autenticado | Portal B2B de farmácias/pet shops credenciados e gestão de campanhas |
| `/anuncios` | `app/anuncios/page.tsx` | Autenticado | Gestão dedicada de campanhas DrVet Ads (`ad_campaigns`) |
| `/painel` | `app/painel/page.tsx` | Autenticado | Central Operacional: busca de especialistas aprovados, exportação `.csv`/`.ofx` e termos digitais |
| `/agenda` | `app/agenda/page.tsx` | Profissional / Org | Grade semanal, métricas, organização e publicação/bloqueio de horários |
| `/receitas` | `app/receitas/page.tsx` | Profissional / Org | Rascunhos estruturados de prescrição vinculados ao atendimento |
| `/comissoes` | `app/comissoes/page.tsx` | Profissional / Org | Extrato `commission_ledger`, conta de repasse e solicitação de antecipação |
| `/painel/veterinario` | `app/painel/veterinario/page.tsx` | Profissional / Org | Cockpit do médico-veterinário (fila de consultas, CRMV, horários e saldo) |
| `/painel/parceiro` | `app/painel/parceiro/page.tsx` | Profissional / Org | Cockpit comercial B2B com gerador de link QR de balcão, splits e campanhas |
| `/admin` e `/admin/integracoes` | `app/admin/page.tsx` | Admin Master | Governança RBAC (`admin_list_users`, `admin_update_user_role`), aprovação de CRMV e teste PostgreSQL/Realtime |

---

## b) Camada de Serviços (`src/services/`) — 100% Supabase

Não há camada de mocks em memória (`mock-db` foi removido). Toda a persistência ocorre diretamente via `@supabase/supabase-js` respeitando RLS e RPCs em `src/services/`:

- `auth.service.ts` — Login, cadastro, recuperação de senha, atualização e leitura/edição de `profiles`.
- `organizations.service.ts` — Organizações, vínculo/aprovação CRMV e `listarVeterinariosAprovados()`.
- `pets.service.ts` — CRUD de `pets`.
- `availability.service.ts` — Consulta pública autenticada de slots livres e bloqueio via `set_availability_block`.
- `appointments.service.ts` — Agendamentos e transições seguras via `transition_appointment`.
- `clinical-records.service.ts` — Prontuário SOAP via `save_clinical_record`.
- `vaccinations.service.ts` — Vacinas via `create_vaccination_record`.
- `exam-orders.service.ts` — Pedidos e resultados via `create_exam_order` e `record_exam_result`.
- `prescriptions.service.ts` — Rascunhos via `save_prescription_draft`.
- `commissions.service.ts` — Resumo financeiro, extrato e antecipação via Edge Function `request-anticipation` (com fallback para RPC `request_commission_anticipation`).
- `teleconsultations.service.ts` — Sala via `open_teleconsultation_session` e chat Realtime em `teleconsultation_messages`.
- `subscriptions.service.ts` — Clube DrVet (`subscribe_pet_to_plan`), checkout (`create_teleconsultation_payment`) e comprovantes.
- `partners.service.ts` — `partner_listings` e campanhas `ad_campaigns`.
- `admin.service.ts` — RPCs administrativas (`admin_list_users`, `admin_update_user_role`) e `integration_configs`.
- `storage.service.ts` — Upload/listagem/URLs assinadas nos buckets privados `pet-avatars`, `exam-reports` e `clinical-attachments`.

---

## c) Banco, Storage e Edge Functions (`supabase/`)

- **Migrations (`supabase/migrations/`)**: 11 arquivos SQL em ordem cronológica (`20261112210000` até `20261113000500`), incluindo exclusão temporal (`btree_gist`), triggers `updated_at`, funções `SECURITY DEFINER`, RLS por perfil/organização e buckets de Storage.
- **Seed (`supabase/seed.sql`)**: massa de homologação idempotente com 4 contas de teste (`admin@drvet.local`, `camila.vet@drvet.local`, `rafael.vet@drvet.local`, `mariana.tutor@drvet.local`, senha `DrVet@2026`).
- **Edge Functions (`supabase/functions/`)**:
  - `request-anticipation` — Validação server-side e protocolo de antecipação.
  - `payment-webhook` — Conciliação de status no `commission_ledger` validada por `x-webhook-secret` e `SUPABASE_SERVICE_ROLE_KEY`.

---

## d) Variáveis de ambiente (`.env.local` e Vercel)

```env
NEXT_PUBLIC_SUPABASE_URL=https://<seu-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<sua-anon-key>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<opcional-se-usar-publishable-key>
```

Consulte [`SETUP_SUPABASE.md`](./SETUP_SUPABASE.md) para a ordem completa de provisionamento.
