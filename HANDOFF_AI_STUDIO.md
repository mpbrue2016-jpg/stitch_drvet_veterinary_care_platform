# Handoff para Google AI Studio — DrVet (Frontend → Supabase Backend)

Este documento reúne todas as informações necessárias para conectar o frontend **DrVet** ao backend **Supabase** no Google AI Studio.

---

## a) Lista de telas e rotas

### Rotas implementadas no frontend (`app/`)

| Rota | Arquivo | Descrição |
|---|---|---|
| `/` | `app/page.tsx` | Landing page pública DrVet com etapas do cuidado e especialidades |
| `/login` | `app/login/page.tsx` | Login, cadastro de conta e solicitação de recuperação de senha |
| `/senha/nova` | `app/senha/nova/page.tsx` | Definição de nova senha após callback de recuperação |
| `/auth/callback` | `app/auth/callback/route.ts` | Callback de troca de código OAuth / recuperação de senha |
| `/agenda` | `app/agenda/page.tsx` | Grade semanal do veterinário, métricas, organização e bloqueio/liberação de horários |
| `/agendamento` | `app/agendamento/page.tsx` | Lista de agendamentos com confirmação, conclusão e cancelamento |
| `/agendamento/edit` | `app/agendamento/edit/page.tsx` | Fluxo de solicitação de consulta + cadastro rápido de pet + escolha de data/horário |
| `/prontuarios` | `app/prontuarios/page.tsx` | Índice de prontuários clínicos SOAP |
| `/prontuarios/[appointmentId]` | `app/prontuarios/[appointmentId]/page.tsx` | Edição/visualização do prontuário SOAP e sinais vitais |
| `/carteira/vacinas` | `app/carteira/vacinas/page.tsx` | Histórico vacinal e registro de novas vacinas após atendimento |
| `/exames` | `app/exames/page.tsx` | Solicitação de exames laboratoriais/imagem e registro de resultados |
| `/receitas` | `app/receitas/page.tsx` | Rascunhos de prescrição veterinária vinculados ao atendimento |
| `/comissoes` | `app/comissoes/page.tsx` | Extrato financeiro, filtros de comissões e solicitação de antecipação |

### Telas futuras mapeadas dos protótipos Stitch (ver `docs/TELAS.md`)

Os 110 protótipos HTML originais estão inventariados em `docs/TELAS.md` e apontam futuras expansões de produto: `/teleconsulta` (sala LiveKit), `/pets/novo`, `/assinaturas` (Clube DrVet), `/parceiros` (Pet Shops / Farmácias), `/anuncios` (DrVet Ads) e `/admin` (painel master e integrações Asaas/Mercado Pago/ERP).

---

## b) Entidades e campos sugeridos (`src/types/entities.ts`)

1. **`profiles` (`UserProfile`)**: `id` (uuid PK -> auth.users), `display_name`, `email`, `phone`, `role` (`tutor | veterinarian | partner | admin`), `created_at`, `updated_at`.
2. **`organizations` (`Organization`)**: `id` (uuid PK), `name`, `created_by` (uuid), `created_at`.
3. **`organization_memberships`**: `organization_id` (uuid FK), `user_id` (uuid FK), `role` (`owner | admin | veterinarian | staff | billing`), `created_at`.
4. **`veterinarian_profiles` (`VeterinarianProfile`)**: `organization_id` (uuid FK), `user_id` (uuid FK), `registration_number` (CRMV), `registration_region` (UF), `specialty`, `status` (`pending | approved | suspended`), `created_at`.
5. **`pets` (`Pet`)**: `id` (uuid PK), `owner_id` (uuid FK -> profiles), `name`, `species`, `breed`, `birth_date`, `sex` (`female | male | unknown`), `notes`, `created_at`, `updated_at`.
6. **`professional_availability` (`AvailabilitySlot`)**: `id` (uuid PK), `organization_id`, `veterinarian_id`, `starts_at`, `ends_at`, `is_available`, `is_blocked`, `blocked_at`, `block_reason`, `created_at`.
7. **`appointments` (`Appointment`)**: `id` (uuid PK), `availability_id` (FK), `organization_id`, `pet_id` (FK), `tutor_id` (FK), `veterinarian_id` (FK), `kind` (`teleconsultation | in_person`), `status` (`pending | confirmed | cancelled | completed`), `reason`, `starts_at`, `ends_at`, `created_at`, `updated_at`.
8. **`clinical_records` (`ClinicalRecord`)**: `id` (uuid PK), `appointment_id` (FK único), `organization_id`, `pet_id`, `veterinarian_id`, `subjective`, `objective`, `assessment`, `plan`, `vitals` (jsonb: peso, temperatura, FC, FR, mucosas, TPC), `status` (`draft | finalized`), `finalized_at`, `created_at`, `updated_at`.
9. **`vaccination_records` (`VaccinationRecord`)**: `id` (uuid PK), `appointment_id`, `organization_id`, `pet_id`, `veterinarian_id`, `vaccine_name`, `administered_on`, `batch_number`, `manufacturer`, `next_due_on`, `notes`, `created_at`.
10. **`exam_orders` (`ExamOrder`)**: `id` (uuid PK), `appointment_id`, `organization_id`, `pet_id`, `veterinarian_id`, `modality` (`laboratory | imaging`), `exam_name`, `clinical_indication`, `instructions`, `status` (`requested | resulted`), `result_summary`, `laboratory_name`, `performed_at`, `requested_at`, `resulted_at`, `created_at`.
11. **`prescription_drafts` (`PrescriptionDraft`)**: `id` (uuid PK), `appointment_id` (FK), `organization_id`, `pet_id`, `veterinarian_id`, `items` (jsonb array de `PrescriptionItem`), `updated_by`, `created_at`, `updated_at`.
12. **`commission_ledger` (`CommissionEntry` — a criar)**: `id` (uuid PK), `organization_id`, `veterinarian_id`, `reference`, `tutor_name`, `pet_name`, `origin` (`teleconsultation | in_person | pharmacy_split | partner_plan`), `gross_amount_cents`, `net_amount_cents`, `status` (`available | pending | paid`), `occurred_at`.

---

## c) Operações por tela

- **`/login` e `/senha/nova`**: Login, cadastro de usuário, envio de e-mail de recuperação de senha e atualização autenticada da senha.
- **`/agenda`**:
  - Listar consultas da semana por intervalo (`from`/`to`) e calcular KPIs.
  - Criar organização; registrar e aprovar veterinário na equipe.
  - Criar horários de disponibilidade; bloquear/liberar horários futuros sem consulta ativa.
- **`/agendamento`**:
  - Listar consultas do usuário (tutor ou veterinário).
  - Atualizar status (`pending` → `confirmed` / `cancelled`, `confirmed` → `completed`).
- **`/agendamento/edit`**:
  - Listar pets do tutor; criar novo pet; listar horários disponíveis; criar solicitação de agendamento.
- **`/prontuarios` e `/prontuarios/[appointmentId]`**:
  - Listar prontuários; buscar prontuário por `appointment_id`; salvar rascunho SOAP + sinais vitais; finalizar prontuário (imutável).
- **`/carteira/vacinas`**:
  - Listar vacinas por pet/usuário; registrar nova vacina vinculada a atendimento concluído (imutável).
- **`/exames`**:
  - Listar pedidos (com filtro opcional por `appointmentId`); criar pedido laboratorial/imagem; registrar resultado textual (imutável); futuro upload de PDF/laudo no Storage.
- **`/receitas`**:
  - Listar rascunhos de receita; buscar por atendimento; salvar/atualizar itens da prescrição em rascunho; futuro fluxo de assinatura ICP-Brasil.
- **`/comissoes`**:
  - Buscar resumo financeiro; listar lançamentos com busca textual e filtros (`origin`, `status`); solicitar antecipação de recebíveis.

---

## d) Onde ficam os mocks a substituir

Toda a camada de acesso a dados do frontend está isolada em `src/services/`, marcada com `// TODO(AI Studio): trocar por chamada Supabase`:

- `src/services/mock-db.ts` — Massa de dados local em memória (remover após migração completa).
- `src/services/appointments.service.ts` — CRUD e transição de status de agendamentos.
- `src/services/availability.service.ts` — Horários publicados e bloqueio/liberação.
- `src/services/pets.service.ts` — CRUD de pets.
- `src/services/organizations.service.ts` — Organizações e aprovação de veterinários.
- `src/services/clinical-records.service.ts` — Prontuário SOAP.
- `src/services/vaccinations.service.ts` — Carteira de vacinas.
- `src/services/exam-orders.service.ts` — Pedidos e resultados de exames.
- `src/services/prescriptions.service.ts` — Rascunhos de receita.
- `src/services/commissions.service.ts` — Resumo financeiro, extrato e antecipações.
- `src/lib/supabase.ts` — Cliente browser Supabase pronto para ser usado dentro de `src/services/`.

---

## e) Requisitos de autenticação e perfis de usuário

1. **Tutor**: autentica via Supabase Auth; gerencia seus próprios pets, solicita agendamentos, visualiza prontuários finalizados, vacinas e resultados de exames dos seus pets.
2. **Médico-Veterinário (aprovado)**: gerencia sua disponibilidade, confirma/conclui atendimentos designados, preenche e finaliza SOAP, registra vacinas, solicita exames/registra resultados e edita rascunhos de receita.
3. **Owner / Admin de Organização**: cria organização, cadastra e aprova médicos-veterinários (validação CRMV), acompanha visão financeira/repasses.
4. **Parceiros / Admin Master (futuro)**: portais B2B de pet shops, farmácias, anúncios e auditoria global.

---

## f) Tarefas do backend para o Google AI Studio

1. **Revisar e aplicar migrations SQL**: validar os rascunhos em `supabase/migrations/` contra o projeto Supabase de destino e criar as tabelas faltantes (`commission_ledger`, anexos clínicos, parceiros/assinaturas conforme prioridade).
2. **Configurar RLS (Row Level Security)**: garantir isolamento estrito por `auth.uid()` (tutor vê apenas seus pets/atendimentos; veterinário aprovado vê apenas atendimentos da organização/designados; registros finalizados e vacinas/resultados permanecem imutáveis).
3. **Configurar Supabase Auth**: habilitar provedor e-mail/senha, configurar Redirect URL `${origin}/auth/callback?next=/senha/nova` e trigger de criação automática em `profiles`.
4. **Configurar Storage**: criar buckets privados para laudos de exames (PDF/imagens), anexos clínicos e avatares de pets com políticas RLS via signed URLs.
5. **RPCs e Edge Functions**: implementar/validar RPCs transacionais (prevenção de conflito de horário, transição de status, finalização imutável) e Edge Functions futuras para webhooks Asaas/Mercado Pago, emissão ICP-Brasil e salas LiveKit.
6. **Seeds de desenvolvimento**: popular organização exemplo, veterinário aprovado, horários de teste e pets iniciais para homologação.
7. **Ligar `src/services/*` ao Supabase**: substituir os mocks em `src/services/*.ts` por chamadas usando `src/lib/supabase.ts` (ou route handlers autenticados em `app/api/*`) e reativar a obrigatoriedade de login no `middleware.ts`.

---

## g) Variáveis de ambiente necessárias

Configure no `.env.local` (desenvolvimento) e nas Environment Variables da Vercel:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

*(As variáveis de gateways de pagamento, WebRTC ou assinatura digital deverão ficar exclusivamente no servidor — nunca com prefixo `NEXT_PUBLIC_`.)*
