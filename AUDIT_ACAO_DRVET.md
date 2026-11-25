# AUDIT_ACAO_DRVET.md — Plano de Ação Técnico (Fases 1 a 6)

**Data da auditoria e execução:** 2026-11-24  
**Escopo atualizado:** FASES 1 e 2 (concluídas), FASE 3 (configuração segura do Supabase e auditoria de migrations), FASE 4 (suite de testes de segurança e qualidade), FASE 5 (paginação, busca, filtros, rate-limit, auditoria, breadcrumbs, erro global e acessibilidade) e FASE 6 (análise técnica de preparação do MVP — sem implementação simulada).  
**Regra de execução:** Projeto DrVet preservado sobre a arquitetura existente (Next.js 14 App Router, TypeScript, Supabase, Tailwind CSS), sem reconstrução do zero, sem simulação de pagamentos/webhooks, sem credenciais inventadas e **sem aplicação automática de migrations em produção**.

---

## 1. Resumo Executivo

| Etapa | Estado | Observação Principal |
| :--- | :--- | :--- |
| FASE 1.1 — Isolamento e autorização em `/api/pets` | Concluído e testado | Autorização por escopo (`mine`, `patients`, `all`), anti-spoofing e bloqueio de e-mail não confirmado |
| FASE 1.2 — RBAC em `AppShell`, `OperationsHub` e `middleware.ts` | Concluído e testado | Separação estrita entre `tutor`, `veterinarian`, `partner` e `admin` + `organization_roles` |
| FASE 1.3 — Autenticação, callback OAuth/OTP e confirmação de e-mail | Concluído e testado | Bloqueio efetivo de usuários não confirmados no middleware, callback e todas as APIs protegidas |
| FASE 2.1 — Rota `/pets/novo` e fluxo completo | Concluído e compilado | Nome, espécie, raça, sexo, nascimento ou idade estimada, peso, foto e redirecionamento para `/pets` ou `/agendamento/edit` |
| FASE 2.2 — Correção de links, fluxos e feedback | Concluído e compilado | Correção de links quebrados e banners de acesso negado |
| FASE 3 — Configuração do Supabase e Migrations | Concluído com bloqueio remoto registrado | `.env.example` saneado, 15 migrations auditadas + `README_MIGRATIONS.md`. Projeto remoto `waevrpxnuztvgwvvxwne.supabase.co` responde Auth 200, porém está com **0/32 tabelas criadas (`404 PGRST205`)** |
| FASE 4 — Testes de Segurança e Qualidade | Concluído e executado | **30/30 testes** aprovados em `node --test`, `typecheck`, `lint` e `build` sem erros |
| FASE 5 — Melhorias de Funcionalidade | Concluído e compilado | Paginação real, busca textual, filtros por período, rate limiting, logs de auditoria sanitizados, erro global, breadcrumbs e acessibilidade |
| FASE 6 — Preparação do MVP | Análise técnica + Etapas 1, 2 e 3 concluídas | Webhooks idempotentes + HMAC Mercado Pago + audit_logs persistente, consentimento bilateral LGPD/CFMV, upload com magic bytes, CSV seguro + regra de split e fila `notification_outbox` integrada |

---

## 2. Detalhamento — FASES 1 e 2 (Correções Críticas e Fluxos)

### 2.1 Vazamento potencial de dados e ausência de autorização no servidor em `/api/pets`
- **Problema identificado:** `GET /api/pets` consultava `public.pets` sem filtro explícito de `owner_id` ou vínculo clínico; `src/services/pets.service.ts` lia direto do cliente; faltavam `PATCH`/`DELETE` em `/api/pets` e validação de e-mail confirmado.
- **Causa confirmada:** Ausência de camada de autorização de servidor e dependência exclusiva de RLS no banco.
- **Correção aplicada:** Criado `src/lib/pets/server-pets.ts` com validação de sessão (`401`), e-mail confirmado (`403 EMAIL_NOT_CONFIRMED`), escopos explícitos (`mine`, `patients`, `all`), bloqueio de mutação cruzada e filtro defensivo adicional. Atualizados `app/api/pets/route.ts`, `src/services/pets.service.ts` e `src/lib/validations.ts`.
- **Arquivos modificados/criados:** `src/lib/pets/server-pets.ts`, `app/api/pets/route.ts`, `src/services/pets.service.ts`, `src/lib/validations.ts`, `tests/pets-authorization.test.ts`.
- **Testes executados & resultado:** `tests/pets-authorization.test.ts` — 8/8 cenários aprovados.

### 2.2 Controle de permissões por perfil (`AppShell`, `OperationsHub` e `middleware.ts`)
- **Problema identificado:** `AppShell` exibia todos os itens do menu para qualquer usuário; `middleware.ts` misturava rotas de veterinário e parceiro sob `hasOrgMembership`.
- **Causa confirmada:** Ausência de matriz centralizada baseada nos enums reais (`public.user_role` e `public.organization_role`).
- **Correção aplicada:** Criado `src/lib/auth/guards.ts` (`APP_NAVIGATION`, `getAuthorizedNavItems`, `getRouteAccessDenial`, `canAccessPath`, `getRoleLabel`). Atualizados `src/components/app-shell.tsx`, `src/components/header.tsx`, `src/components/operations-hub.tsx` e `middleware.ts`.
- **Testes executados & resultado:** `tests/rbac-and-auth.test.ts` — 6/6 cenários aprovados.

### 2.3 Autenticação, callback e confirmação de e-mail
- **Problema identificado:** Middleware e APIs não validavam `email_confirmed_at`/`confirmed_at`; callback não tratava `token_hash`/`verifyOtp`; `/login` e `/senha/nova` precisavam tratar confirmação pendente e sessão de recuperação.
- **Causa confirmada:** Ausência de helpers compartilhados `isEmailConfirmedUser`, `sanitizeNextPath` e `requireConfirmedApiUser`.
- **Correção aplicada:** Criado `src/lib/auth/server-auth.ts` e aplicado em todas as rotas protegidas de `app/api/*`; atualizados `middleware.ts`, `app/auth/callback/route.ts`, `src/services/auth.service.ts`, `app/login/page.tsx` e `app/senha/nova/page.tsx`.

### 2.4 Rota `/pets/novo` e correção de navegação (FASE 2)
- **Problema identificado:** `/pets/novo` não incluía peso/idade estimada nem redirecionamento pós-cadastro; links na home (`/agenda`) e em assinaturas (`/pets/novo`) quebravam o fluxo esperado para tutores.
- **Causa confirmada:** `PetsManager` validava apenas um subconjunto de campos e a coluna `notes` precisava estruturar peso/idade estimada sem criar tabelas duplicadas.
- **Correção aplicada:** Atualizados `src/components/pets-manager.tsx`, `src/components/booking-flow.tsx`, `src/components/subscriptions-club.tsx`, `src/components/home-landing.tsx` e `src/components/appointments-list.tsx`.

---

## 3. Detalhamento — FASE 3 (Configuração do Supabase e Migrations)

### 3.1 Variáveis de ambiente (`.env.example` e config)
- **Problema identificado:** `.env.example` continha chaves de serviços não implementados (`ASAAS_API_KEY`, `ASAAS_BASE_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`) e omitia `NEXT_PUBLIC_APP_URL`.
- **Causa confirmada:** Divergência entre `.env.example` e as variáveis efetivamente lidas via `process.env` em `app/` e `src/`.
- **Correção aplicada:**
  - `.env.example` atualizado somente com as 13 variáveis reais usadas no código (sem valores secretos):
    - Públicas: `NEXT_PUBLIC_SUPABASE_URL=`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=`, `NEXT_PUBLIC_APP_URL=`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY=`
    - Exclusivas do servidor: `SUPABASE_SERVICE_ROLE_KEY=`, `VAPID_PRIVATE_KEY=`, `VAPID_SUBJECT=`, `PAYMENT_WEBHOOK_SECRET=`, `MERCADO_PAGO_ACCESS_TOKEN=`, `PIX_MERCHANT_KEY=`, `PIX_MERCHANT_NAME=`, `PIX_MERCHANT_CITY=`
  - `src/lib/supabase/config.ts` atualizado com `getAppBaseUrl(fallbackOrigin)` lendo `process.env.NEXT_PUBLIC_APP_URL`.
- **Arquivos modificados:** `.env.example`, `src/lib/supabase/config.ts`.

### 3.2 Auditoria de migrations e migration incremental #14
- **Problema identificado:** Necessidade de validar ordem cronológica, dependências, RLS, triggers, RPCs e índices das 13 migrations existentes, além de reforçar `grant select` em `public.pets` e criar índices compostos para paginação/filtros e tabela persistente de auditoria.
- **Causa confirmada:** Consultas paginadas por tutor, veterinário, período e organização requerem índices compostos para escala; logs persistentes de auditoria administrativa não possuíam tabela própria.
- **Correção aplicada (sem alterar migrations antigas):**
  - Auditadas todas as 13 migrations anteriores (`20261112210000` até `20261123000100`).
  - Criada migration incremental #14 `supabase/migrations/20261124000100_security_indexes_and_audit_logs.sql` com:
    - `grant select on table public.pets to authenticated;` (idempotente)
    - 5 índices compostos (`pets_owner_name_idx`, `appointments_tutor_status_starts_idx`, `appointments_vet_status_starts_idx`, `vaccination_records_org_administered_idx`, `exam_orders_org_status_requested_idx`)
    - Tabela `public.audit_logs` com RLS estrito (leitura apenas por `public.is_admin()`, sem `grant insert/update/delete` para `anon`/`authenticated`)
    - `notify pgrst, 'reload schema';`
  - Atualizados `src/lib/supabase/schema-registry.ts` (29 tabelas no total) e `src/types/database.ts`.
  - Criado guia seguro de aplicação em desenvolvimento/staging: `supabase/README_MIGRATIONS.md`.
- **Arquivos modificados/criados:** `supabase/migrations/20261124000100_security_indexes_and_audit_logs.sql`, `supabase/README_MIGRATIONS.md`, `src/lib/supabase/schema-registry.ts`, `src/types/database.ts`.

### 3.3 Validação real de conexão (Bloqueio registrado)
- **Verificação executada (somente leitura) contra `.env.local`:**
  - Host: `waevrpxnuztvgwvvxwne.supabase.co`
  - Endpoint Auth (`/auth/v1/settings`): **HTTP 200** (projeto acessível e chave publicável reconhecida)
  - Endpoint REST (`/rest/v1/*`): **0/29 tabelas localizadas (`404 PGRST205`)**
- **Bloqueio confirmado:** As migrations ainda **não foram aplicadas** no projeto Supabase remoto (`0` tabelas existentes) e `DATABASE_URL` / `SUPABASE_ACCESS_TOKEN` não estão configurados localmente para CLI automática (além da diretriz de não aplicar migrations em produção sem autorização expressa). Portanto, **o banco de dados remoto não está operacional para persistência** até a execução controlada descrita em `supabase/README_MIGRATIONS.md`.

---

## 4. Detalhamento — FASE 4 (Testes de Segurança e Qualidade)

- **Problema identificado:** Cobertura inicial restrita a pets e RBAC, sem testes automatizados cobrindo isolamento entre organizações, agendamentos, prontuário SOAP, carteira de vacinação, rate limiting, logs de auditoria e paginação/busca.
- **Correção aplicada:**
  - Criado `src/lib/clinical/server-flows.ts` com regras puras verificáveis no servidor para isolamento de organizações (`canAccessOrganizationResource`), agendamentos (`canAccessAppointment`, `evaluateAppointmentTransition`), prontuário (`canReadClinicalRecord`, `evaluateClinicalRecordWrite`) e vacinação (`canReadVaccinationRecord`, `evaluateVaccinationWrite`).
  - Atualizado `tsconfig.test.json` para incluir `src/lib/clinical/server-flows.ts`, `src/lib/logging/audit.ts`, `src/lib/pagination.ts` e `src/lib/security/rate-limit.ts`.
  - Criados `tests/clinical-and-orgs.test.ts` e `tests/security-and-pagination.test.ts`, e ampliado `tests/pets-authorization.test.ts`.
- **Arquivos modificados/criados:** `tsconfig.test.json`, `src/lib/clinical/server-flows.ts`, `tests/pets-authorization.test.ts`, `tests/clinical-and-orgs.test.ts`, `tests/security-and-pagination.test.ts`.
- **Resultados reais executados:**
  - `npm run typecheck`: passou sem erros.
  - `npm test`: **23/23 testes aprovados** (0 falhas, 0 pulados).
  - `npm run lint`: passou sem erros nem warnings.
  - `npm run build`: build de produção Next.js 14 concluído com sucesso.

---

## 5. Detalhamento — FASE 5 (Melhorias de Funcionalidade)

- **Problema identificado:** Ausência de paginação real, busca textual e filtros por período nas listagens principais; ausência de rate limiting nas APIs; ausência de logs estruturados sanitizados; falta de `global-error.tsx`, breadcrumbs e skip link de acessibilidade; 3 rotas de push (`push/dispatch-appointment`, `push/subscriptions`, `push/test`) ainda não usavam `requireConfirmedApiUser`.
- **Correções aplicadas:**
  1. **Paginação, busca e filtros por período:**
     - Criado `src/lib/pagination.ts` (`parseListFilterParams`, `paginateItems`, `matchesTextQuery` sem acento, `matchesPeriodFilter`) e componente `<PaginationControls />` em `src/components/ui.tsx`.
     - Endpoints atualizados: `/api/pets`, `/api/appointments`, `/api/vaccinations`, `/api/exam-orders`.
     - Serviços e telas atualizados: `src/services/{pets,appointments,vaccinations,exam-orders}.service.ts` e `src/components/{pets-manager,appointments-list,vaccination-wallet,exam-orders}.tsx` (mantendo compatibilidade com a grade semanal `/agenda` e com a seleção completa de atendimentos elegíveis para vacinas/exames).
  2. **Rate Limiting nas APIs e Guard Unificado:**
     - Criados `src/lib/security/rate-limit.ts` (`SlidingWindowRateLimiter`, headers `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`) e `src/lib/security/api-guard.ts` (`requireProtectedApiContext`, `checkRequestRateLimit`, `applyRateLimitHeadersToResponse`).
     - Aplicado em todas as 17 rotas protegidas + webhook de pagamento em `app/api/*/route.ts`, corrigindo também a exigência de e-mail confirmado em `/api/push/{dispatch-appointment,subscriptions,test}`.
     - *Nota operacional:* O limiter atual usa memória por instância Node (`Map` com janela deslizante), sendo suficiente para desenvolvimento e instância única; em ambiente serverless multi-instância (MVP), recomenda-se substituir o store por Redis/Upstash sem alterar a interface.
  3. **Logs Estruturados de Auditoria:**
     - Criado `src/lib/logging/audit.ts` com `sanitizeAuditMetadata` (redige automaticamente `password`, `senha`, `token`, `secret`, `key`, `authorization`, `cookie`, `pix_payload`, `subjective`, `objective`, `assessment`, `plan`, `clinical`, `notes`, `phone`, `email`, `cpf`, `cnpj`) e saída JSON estruturada em `app/api/*`.
  4. **Tratamento Global de Erros, Breadcrumbs e Acessibilidade:**
     - Criados `app/global-error.tsx` (boundary raiz) e `src/components/breadcrumbs.tsx` (`<nav aria-label="Breadcrumb">`).
     - Atualizado `src/components/app-shell.tsx` com skip link `"Ir para o conteúdo principal"`, `#main-content` focável e exibição automática de `<Breadcrumbs />` nas rotas internas.
     - Atualizado `src/components/ui.tsx` com `aria-live` em `<Toast />`.

---

## 6. FASE 6 — Análise Técnica para Preparação do MVP (Sem Implementação Simulada)

Conforme determinado, **nenhuma integração externa paga ou webhook fictício foi simulado**. Abaixo está a análise técnica prévia das 10 capacidades necessárias para evolução ao MVP de produção:

### 6.1 Pagamentos (Asaas ou Mercado Pago)
- **Dependências:** SDK ou cliente REST oficial (`mercadopago` ou API REST Asaas v3) exclusivamente em rotas servidor (`app/api/payments/*`); credenciais `MERCADO_PAGO_ACCESS_TOKEN` ou `ASAAS_API_KEY` + `ASAAS_WEBHOOK_TOKEN`.
- **Custos estimados:** Sem mensalidade fixa; tarifas por transação variam tipicamente entre ~0,99%–1,99% (PIX, ou taxa fixa Asaas por PIX liquidado) e ~2,99%–4,99% + taxa fixa por cartão/parcelamento, além de eventual custo por transferência/saque ou subconta.
- **Segurança & LGPD:** Nunca enviar chaves privadas ou tokens de checkout para o browser; validar valor da cobrança no servidor a partir de `appointments` / `veterinarian_profiles.consultation_fee_cents` (nunca confiar em `amount_cents` enviado pelo cliente); mascarar CPF/CNPJ em logs.
- **Impacto no banco:** Requer vínculo em `payments` com `provider_payment_id` (unique), `idempotency_key`, `status_detail`, `external_reference`, e tabela de histórico/conciliação antes de liberar confirmação automática de consulta.

### 6.2 Teleconsulta com LiveKit ou WebRTC
- **Dependências:** `livekit-server-sdk` (servidor para geração de JWT de sala por participante) + `@livekit/components-react` / `livekit-client` (cliente), servidor LiveKit Cloud ou self-hosted com TURN/STUN; variáveis `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
- **Custos estimados:** LiveKit Cloud possui camada gratuita inicial limitada por minutos de participante/largura de banda; em produção cobra por participante-minuto de áudio/vídeo e tráfego TURN/egress (gravação/transcodificação gera custo extra relevante por minuto).
- **Segurança, Consentimento e Gravação (Crítico):**
  - Tokens de sala com TTL curto (ex.: 15–30 min), gerados somente após validar no servidor que o usuário é o `tutor_id` ou `veterinarian_id` da consulta (`confirmed`) e que o horário está na janela permitida.
  - **Gravação de consultas NÃO deve ser habilitada** sem: (1) termo de consentimento explícito e registrado com timestamp e IP/usuário de tutor e veterinário antes do início (`teleconsultation_consents`), (2) aviso visual/sonoro contínuo durante a gravação, (3) política de retenção e descarte conforme LGPD (dados sensíveis/imagem) e resoluções do CFMV, e (4) armazenamento criptografado em bucket privado sem URL pública permanente.
- **Impacto no banco:** Colunas/tabelas para `teleconsultation_sessions` (room_name, status, started_at, ended_at), `teleconsultation_consents` (recording_consent_tutor, recording_consent_vet, consented_at) e `recording_storage_path` (nulo por padrão).

### 6.3 Webhooks Financeiros
- **Dependências:** Verificação criptográfica nativa de assinatura HMAC (`x-signature` Mercado Pago ou `asaas-access-token` + validação de payload consultando a API do provedor) em `/api/payments/webhook`.
- **Custos:** Sem custo direto adicional além do processamento/infraestrutura de API.
- **Segurança:** Validação obrigatória em tempo constante (`crypto.timingSafeEqual`), proteção contra replay (verificar timestamp/janela + idempotência por `provider_event_id`), rate limiting dedicado e rejeição imediata (401/403) quando segredo não estiver configurado — **proibido fallback simulado**.
- **Impacto no banco:** Tabela `webhook_events` (`provider`, `event_id` unique, `event_type`, `payload_hash`, `processed_at`, `status`) para garantir processamento idempotente exatamente uma vez.

### 6.4 Split de Comissões
- **Dependências:** Subcontas/carteiras gerenciadas no gateway escolhido (Asaas Split ou Mercado Pago Marketplace Split) + regra de cálculo servidor-autoridade.
- **Custos:** Gateways podem cobrar taxa de manutenção por subconta ativa ou tarifa por repasse/TED/PIX automatizado.
- **Segurança:** Taxa da plataforma (`platform_fee_bps`), desconto do Clube DrVet e repasse líquido (`net_payout_cents`) devem ser calculados exclusivamente no servidor/PostgreSQL em centavos inteiros; alterações de chave PIX ou conta de repasse exigem auditoria em `audit_logs` e verificação do titular.
- **Impacto no banco:** Evolução de `commission_ledger` / `payout_requests` com `split_rule_snapshot`, `gateway_transfer_id`, `settlement_date`, `reversal_reference_id` (para estornos/chargebacks).

### 6.5 Notificações por E-mail e WhatsApp
- **Dependências:** Provedor transacional de e-mail (`resend` ou `@aws-sdk/client-ses`, com SPF/DKIM/DMARC configurados no domínio) e API oficial WhatsApp Business Cloud (Meta) ou provedor BSP homologado; filas assíncronas com retry.
- **Custos:** E-mail transacional possui free tier baixo e cobrança por milhar após cota; WhatsApp Business Cloud cobra por conversa/template aprovado na Meta por categoria (`utility` para lembretes de consulta, com tarifas em USD/BRL por mensagem iniciada).
- **Segurança & LGPD:** Templates aprovados sem expor conteúdo clínico sensível no corpo de notificações push/WhatsApp (ex.: enviar apenas lembrete de horário e link autenticado); controle de opt-in/opt-out do tutor; nunca enviar segredos em logs.
- **Impacto no banco:** Tabela `notification_outbox` / `notification_deliveries` (`channel`, `template_key`, `recipient_user_id`, `status`, `provider_message_id`, `attempts`, `consent_verified`).

### 6.6 Receita Digital
- **Dependências:** Biblioteca de geração de PDF determinístico no servidor (ex.: `@react-pdf/renderer` ou `pdf-lib`) + QR Code apontando para `/receitas/verificar/[code]`.
- **Custos:** Custo mínimo de computação/armazenamento em bucket privado.
- **Segurança & Conformidade CFMV:** Emissão exclusiva por `veterinarian` com `status = 'approved'` e `CRMV` ativo vinculado à consulta iniciada/concluída; após finalização, receita e código verificador são imutáveis; endpoint público `/receitas/verificar` deve expor apenas o mínimo necessário para conferência de autenticidade (sem vazar dados pessoais excessivos do tutor).
- **Impacto no banco:** Tabela `prescriptions` (separada de `prescription_drafts`), `verification_code` único indexado, `pdf_storage_path`, `issued_at`, `revoked_at` (se anulada).

### 6.7 Upload de Exames e Documentos
- **Dependências:** Supabase Storage com buckets privados (`exam-reports`, `pet-avatars`) + validação estrita de MIME real (magic bytes), limite de tamanho (5–10 MB) e sanitização de nome de arquivo.
- **Custos:** Cobrança por GB armazenado e egress no Supabase Storage.
- **Segurança:** Nunca usar URLs públicas permanentes; gerar sempre Signed URLs de curta duração (ex.: 5–10 minutos) após validar vínculo via RLS; considerar scanner antivírus/sanitização em pipeline assíncrono para PDFs enviados por terceiros antes do MVP público.
- **Impacto no banco:** Tabela de metadados `clinical_attachments` (`bucket`, `object_path`, `uploaded_by`, `mime_type`, `byte_size`, `sha256`, `exam_order_id`, `appointment_id`) com RLS alinhado ao paciente/atendimento.

### 6.8 Assinatura Digital (ICP-Brasil / CFMV)
- **Dependências:** Integração com provedor homologado ICP-Brasil em nuvem (ex.: BirdID/VaultID, Vidaas/Valid, Soluti, Certisign ou Bry) via fluxo OAuth/assinatura remota de hash SHA-256 do PDF (padrão PAdES).
- **Custos:** Licença/contrato B2B com Autoridade Certificadora ou taxa por assinatura em nuvem + custo do certificado e-CPF A3/nuvem pago pelo médico-veterinário.
- **Segurança:** A aplicação **não deve armazenar chave privada ou senha do certificado do veterinário**; envia apenas o digest/documento ao provedor autorizado pelo profissional, armazena o PDF assinado com carimbo de tempo e valida a cadeia ICP-Brasil na verificação pública.
- **Impacto no banco:** Colunas em `prescriptions` / `clinical_records`: `signature_provider`, `certificate_subject_cpf_hash`, `certificate_serial`, `document_sha256`, `signed_pdf_path`, `signed_at`.

### 6.9 Portal de Parceiros (B2B)
- **Dependências:** Fluxo formal de onboarding/KYC de clínicas, laboratórios e empresas parceiras (CNPJ, razão social, contrato/termos), gestão de equipe via `organization_memberships` e módulos de anúncios/campanhas.
- **Custos:** Sem custo direto de SDK; eventual custo de API de consulta cadastral/KYC (ex.: ReceitaWS/Serpro/BigDataCorp) se houver validação automática de CNPJ.
- **Segurança:** Isolamento multi-tenant rigoroso por `organization_id` em todas as queries e políticas RLS; convite de membros por token assinado de uso único; parceiros nunca acessam prontuários clínicos individuais de tutores sem vínculo assistencial autorizado.
- **Impacto no banco:** Tabelas de `organization_invitations`, `partner_contracts`, métricas agregadas/anonimizadas e auditoria de alterações cadastrais/bancárias.

### 6.10 Painel Administrativo
- **Dependências:** Rotas e APIs dedicadas sob `role === 'admin'` (com verificação em camada servidor e `public.is_admin()`), consumo paginado de `public.audit_logs`, aprovação/suspensão de veterinários (CRMV) e parceiros, conciliação financeira e moderação de anúncios.
- **Custos:** Recomenda-se MFA obrigatório para contas `admin` (nativo no Supabase Auth) sem custo adicional relevante.
- **Segurança:** Separação absoluta de privilégios (`admin` nunca atribuído via cadastro público), trilha obrigatória em `audit_logs` para toda aprovação/reprovação/ajuste financeiro, e verificação de integridade sem expor segredos de ambiente na UI.
- **Impacto no banco:** Utilização imediata da tabela `public.audit_logs` (já incluída na migration #14) + views/RPCs administrativas paginadas com `security invoker` / validação `is_admin()`.

### 6.11 Execução — FASE 6 Etapa 1 (Arquitetura Segura de Pagamentos, Webhooks Idempotentes e Consentimento Bilateral LGPD/CFMV)
- **Problema identificado:**
  1. `app/api/payments/webhook/route.ts` aceitava eventos sem registro de idempotência (`webhook_events`) nem checagem anti-replay por timestamp, e `checkout` não informava explicitamente o modo operacional real (`mercado_pago_pix` vs. `static_pix_brcode`).
  2. `src/components/teleconsulta-room.tsx` permitia que apenas o veterinário alternasse `recording_consent` diretamente em `teleconsultation_sessions` sem anuência explícita do tutor nem verificação de armazenamento privado criptografado.
  3. Faltavam tabelas base no schema incremental para idempotência de webhooks, trilha bilateral de consentimento LGPD/CFMV e fila desacoplada de notificações (`notification_outbox`).
- **Causa confirmada:** Ausência de helpers criptográficos puros para verificação de assinatura/split, tabela `webhook_events`, tabela/RPC `teleconsultation_consents` / `record_teleconsultation_consent` e endpoint dedicado de consentimento.
- **Correção aplicada (sem simular pagamentos ou habilitar gravação sem bucket privado):**
  - Criado `src/lib/payments/architecture.ts` (`checkPaymentGatewayReadiness`, `verifySharedWebhookSecret`, `verifyHmacSha256Hex`, `isWithinReplayWindow`, `verifyMercadoPagoSignature`, `computePayloadSha256`, `calculateCommissionSplitCents`).
  - Atualizados `app/api/payments/webhook/route.ts` (validação constante de segredo, proteção anti-replay com `x-webhook-timestamp`, hash SHA-256 do payload e deduplicação em `webhook_events` com compatibilidade graciosa se migration #15 ainda não estiver aplicada) e `app/api/payments/checkout/route.ts` (retorno explícito de `gatewayMode` e `gatewayConfigured`).
  - Criado `src/lib/teleconsultation/consent.ts` (`TELECONSULTATION_RECORDING_POLICY`, `hasActivePartyConsent`, `canActorSignConsent`, `evaluateRecordingReadiness` exigindo consentimento bilateral + sessão ativa + `storageBucketProvisioned: true`).
  - Criado `app/api/teleconsultation/consent/route.ts` (`GET`/`POST` autenticados via `requireProtectedApiContext`, logs estruturados e execução da RPC `record_teleconsultation_consent` mantendo `storageBucketProvisioned: false` até provisionamento real do bucket privado criptografado).
  - Atualizados `src/services/teleconsultations.service.ts` (remoção de `recording_consent` de `atualizarSessaoTeleconsulta` e inclusão de `buscarConsentimentoTeleconsulta` / `registrarConsentimentoTeleconsulta`) e `src/components/teleconsulta-room.tsx` (painel de **Consentimento Bilateral LGPD & CFMV** com status separado de Tutor, Veterinário, Gravação desativada por política e ação exclusiva da parte autenticada).
  - Criada migration incremental #15 `supabase/migrations/20261124000200_mvp_architecture_readiness.sql` (`webhook_events`, `teleconsultation_consents`, `record_teleconsultation_consent`, `notification_outbox`) e atualizados `src/lib/supabase/schema-registry.ts` (32 tabelas), `src/types/database.ts` e `supabase/README_MIGRATIONS.md`.
  - Adicionados testes unitários em `tests/mvp-architecture.test.ts` (incluídos em `tsconfig.test.json`).
- **Arquivos criados/modificados na Etapa 1:** `src/lib/payments/architecture.ts`, `src/lib/teleconsultation/consent.ts`, `supabase/migrations/20261124000200_mvp_architecture_readiness.sql`, `app/api/teleconsultation/consent/route.ts`, `app/api/payments/webhook/route.ts`, `app/api/payments/checkout/route.ts`, `src/services/teleconsultations.service.ts`, `src/components/teleconsulta-room.tsx`, `src/lib/supabase/schema-registry.ts`, `src/types/database.ts`, `supabase/README_MIGRATIONS.md`, `tsconfig.test.json`, `tests/mvp-architecture.test.ts`.
- **Pendências externas para ativação em produção:**
  - Aplicar sequencialmente as 15 migrations em desenvolvimento/staging conforme `supabase/README_MIGRATIONS.md` (projeto remoto `waevrpxnuztvgwvvxwne.supabase.co` permanece em `0/32` tabelas até autorização).
  - Provisionar bucket privado criptografado `teleconsultation-recordings` (e pipeline LiveKit/Egress, se aplicável) antes de alterar `storageBucketProvisioned` para `true`.
  - Configurar `MERCADO_PAGO_ACCESS_TOKEN` / `ASAAS_API_KEY` e `PAYMENT_WEBHOOK_SECRET` no servidor para processamento real de cobranças e webhooks.

### 6.12 Execução — FASE 6 Etapa 2 (Upload com Magic Bytes, Transparência de Checkout PIX e Painel Admin de Prontidão/Auditoria)
- **Problema identificado:**
  1. `src/services/storage.service.ts` validava uploads (`exam-reports`, `clinical-attachments`, `pet-avatars`) apenas pelo `file.type` informado pelo navegador, sem inspecionar assinatura binária real (magic bytes).
  2. `src/components/payments-checkout.tsx` e `src/services/subscriptions.service.ts` ainda não exibiam o `gatewayMode` (`mercado_pago_pix` vs. `static_pix_brcode`) retornado por `/api/payments/checkout`.
  3. O painel `/admin` (`src/components/admin-console.tsx`) não possuía endpoint servidor nem aba dedicada para inspecionar prontidão real de gateways/canais, `audit_logs`, `webhook_events` e `notification_outbox` sem expor segredos.
- **Correção aplicada:**
  - Criado `src/lib/security/file-signature.ts` (`detectBinaryFileSignature` e `validateBinaryUploadSignature`) validando cabeçalhos reais PDF (`%PDF-`), JPEG (`FF D8 FF`), PNG (`89 50 4E 47`) e WEBP (`RIFF....WEBP`) e bloqueando discrepâncias de MIME.
  - Atualizado `src/services/storage.service.ts` com `validarArquivoMagicBytes` aplicado antes do envio em `uploadArquivoStorage`.
  - Atualizados `src/services/subscriptions.service.ts` e `src/components/payments-checkout.tsx` para exibir claramente quando a cobrança usa gateway Mercado Pago ou modo BR-Code EMVCo local (sem baixa automática).
  - Criado `app/api/admin/mvp-readiness/route.ts` (restrito a `role === 'admin'`, sem expor segredos de ambiente, com degradação segura quando migrations #14/#15 não foram aplicadas) e adicionada a aba **Prontidão MVP & Auditoria** em `src/components/admin-console.tsx` + `buscarProntidaoMvpAdmin` em `src/services/admin.service.ts`.
  - Adicionados testes unitários em `tests/mvp-architecture.test.ts` (`src/lib/security/file-signature.ts` incluído em `tsconfig.test.json`).

### 6.13 Execução — FASE 6 Etapa 3 (Exportação CSV Segura, Transparência de Split, Fila Outbox e Auditoria Persistente de Webhook)
- **Problema identificado:**
  1. `src/components/commissions-view.tsx` exportava CSV sem neutralizar fórmulas iniciadas por `=`, `+`, `-`, `@` ou `\t`, e não exibia a regra de split de comissão da plataforma.
  2. `app/api/push/dispatch-appointment/route.ts` disparava apenas Web Push sem registrar itens na fila `public.notification_outbox` para entrega de e-mail transacional e trilha de envio.
  3. `app/api/payments/webhook/route.ts` aceitava apenas `x-webhook-secret`, sem suportar cabeçalho nativo `x-signature` do Mercado Pago nem persistir eventos críticos em `public.audit_logs`.
- **Correção aplicada:**
  - Criado `src/lib/payments/split.ts` (puro e compatível com browser) e re-exportado em `src/lib/payments/architecture.ts`.
  - Criado `src/lib/security/csv.ts` (`sanitizeCsvCell` e `buildUtf8Csv`) aplicado em `src/components/commissions-view.tsx` junto ao bloco **Regra de Split no Servidor** na aba `Conciliação & Split`.
  - Criado `src/lib/notifications/outbox.ts` (`persistServerAuditLog` e `recordAppointmentNotificationOutbox`, com degradação segura se `SUPABASE_SERVICE_ROLE_KEY` ou migrations #14/#15 ainda não estiverem presentes) integrado a `app/api/push/dispatch-appointment/route.ts` e `app/api/payments/webhook/route.ts` (que agora também verifica assinatura `x-signature` via `verifyMercadoPagoSignature`, validando segredo antes do parse do payload).
  - Adicionados testes unitários de sanitização CSV em `tests/mvp-architecture.test.ts`.

### 6.14 Execução — FASE 6 Etapa 4 (Receita Digital SHA-256 / Prontidão ICP-Brasil, Hardening B2B `/api/partners` & Visibilidade Outbox)
- **Problema identificado:**
  1. A emissão oficial de receita (`emitirReceitaOficial`) chamava `supabase.rpc('issue_prescription')` diretamente do navegador, sem endpoint servidor com rate limiting, trilha persistente em `audit_logs`, enfileiramento de notificação por e-mail em `notification_outbox` nem geração de manifesto/digest SHA-256 verificável para futura assinatura remota PAdES (ICP-Brasil).
  2. O Portal de Parceiros B2B e DrVet Ads (`src/services/partners.service.ts` e `src/components/partners-portal.tsx`) realizava mutações diretas via Supabase Browser Client sem API servidor dedicada com validação Zod, checagem explícita de papel + vínculo na organização (`canManagePartnerOrganization`), auditoria nem paginação/busca textual na listagem.
  3. A Central de Notificações (`GET /api/push/notifications` e `src/components/notification-center.tsx`) ainda não exibia o resumo da fila multicanal `notification_outbox` (migration #15).
- **Correção aplicada (sem simular assinatura ICP-Brasil nem armazenar chaves privadas):**
  - Criado `src/lib/clinical/prescription-digest.ts` (`buildCanonicalPrescriptionManifest`, `computePrescriptionDigestHex`, `evaluateDigitalSignatureReadiness`) gerando hash canônico `SHA-256` (`drvet-rx-v1`) determinístico e documentando prontidão para provedores em nuvem homologados (Vidaas, BirdID, Soluti, Certisign) sem armazenamento de chave privada na aplicação.
  - Criado `app/api/prescription-drafts/issue/route.ts` (`POST` autenticado via `requireProtectedApiContext`, validação Zod `issuePrescriptionSchema`, chamada à RPC `issue_prescription`, cálculo do digest `SHA-256`, registro em `audit_logs` via `persistServerAuditLog` e fila de e-mail `prescription_issued` em `notification_outbox` via `recordPrescriptionNotificationOutbox`), conectado a `src/services/prescriptions.service.ts` e exibido em `src/components/prescription-drafts.tsx`.
  - Atualizados `app/api/admin/mvp-readiness/route.ts`, `src/services/admin.service.ts` e `src/components/admin-console.tsx` para exibir o status real de **Receita Digital & Assinatura ICP-Brasil** no painel administrativo.
  - Criado `app/api/partners/route.ts` (`GET` com busca textual `q`, filtro por categoria `kind` e paginação `paginateItems`; `POST` e `PATCH` protegidos por `requireProtectedApiContext`, schemas Zod em `src/lib/validations.ts` e verificação explícita `canManagePartnerOrganization` em `src/lib/auth/guards.ts` com trilha em `audit_logs`), integrado a `src/services/partners.service.ts` e `src/components/partners-portal.tsx`.
  - Atualizados `app/api/push/notifications/route.ts`, `src/services/push.service.ts`, `src/hooks/use-push-notifications.ts` e `src/components/notification-center.tsx` para expor com segurança o resumo por usuário da fila `notification_outbox` (com degradação segura se migration #15 ainda não estiver aplicada).
  - Adicionados testes unitários em `tests/mvp-architecture.test.ts` cobrindo digest SHA-256 determinístico e detecção de adulteração, prontidão ICP-Brasil sem chave privada, autorização `canManagePartnerOrganization` e schemas Zod B2B/receita.

### 6.15 Execução — FASE 6 Etapa 5 (Hardening Administrativo `/api/admin/actions`, Governança Financeira `/api/commissions`, Proteção de URLs Externas e Mascaramento PIX no Servidor)
- **Problema identificado:**
  1. `src/services/admin.service.ts` executava mutações críticas (`atualizarRoleUsuarioAdmin`, `avaliarSolicitacaoPerfil`, `salvarIntegracao`) diretamente pelo cliente navegador contra RPCs/tabelas sem camada API dedicada com rate limiting, validação Zod estrita, bloqueio de auto-rebaixamento de administrador, validação de endpoint externo ao salvar integrações, trilha persistente em `audit_logs` nem enfileiramento de notificação ao aprovar/recusar credenciamento.
  2. `src/services/commissions.service.ts` chamava `request_commission_anticipation` e `upsert_my_payout_account` diretamente no navegador, realizando mascaramento de chave PIX apenas no cliente antes do envio.
- **Correção aplicada:**
  - Criado `src/lib/payments/pix-mask.ts` (`maskPixKeyForDisplay`) para mascarar chaves PIX exclusivamente no servidor antes da persistência e sem registrar o valor bruto em logs.
  - Adicionados schemas Zod estritos em `src/lib/validations.ts` (`saveIntegrationConfigSchema`, `adminUpdateUserRoleSchema`, `adminReviewRoleApplicationSchema`, `strictPayoutAccountSchema`) e método `recordRoleApplicationNotificationOutbox` em `src/lib/notifications/outbox.ts`.
  - Criado `app/api/admin/actions/route.ts` (`POST` restrito a `role === 'admin'` via `requireProtectedApiContext`, impedindo remoção do próprio acesso administrativo, validando URLs de `integration_configs` via `validateSafeExternalUrl` de `src/lib/security/ssrf.ts` com escopo por `organization_id`, registrando eventos em `audit_logs` e enfileirando notificação de credenciamento em `notification_outbox`).
  - Criado `app/api/commissions/route.ts` (`POST` protegido por `requireProtectedApiContext` e autorização financeira por papel/vínculo organizacional, mascarando chave PIX no servidor via `maskPixKeyForDisplay`, executando `upsert_my_payout_account` / `request_commission_anticipation` e auditando operações em `audit_logs` sem expor a chave PIX completa).
  - Atualizados `src/services/admin.service.ts` e `src/services/commissions.service.ts` para rotear as mutações administrativas e financeiras por `/api/admin/actions` e `/api/commissions`.
  - Adicionados testes unitários em `tests/mvp-architecture.test.ts` (com inclusão de `src/lib/payments/pix-mask.ts` e `src/lib/security/ssrf.ts` em `tsconfig.test.json`) cobrindo mascaramento de chave PIX, bloqueio de IPs privados/locais/metadados em URLs externas e validação dos schemas administrativos e financeiros.

### 6.16 Execução — FASE 6 Etapa 6 (Governança Fiscal NFSe, Organizações/CRMV no Servidor, Credenciamento `/api/role-applications` e Impressão da Receita Verificada)
- **Problema identificado:**
  1. `src/services/commissions.service.ts` ainda executava `request_fiscal_invoice` e `update_fiscal_invoice_status` diretamente pelo navegador, sem passar por `/api/commissions` nem gerar trilha persistente em `audit_logs` com mascaramento de `tax_id`.
  2. `src/services/organizations.service.ts` (`criarOrganizacao`, `registrarVeterinario`, `aprovarVeterinario`, `atualizarMeuPerfilVeterinario`) e `src/services/operations.service.ts` (`enviarSolicitacaoPerfil`) ainda chamavam RPCs diretamente do cliente em vez de rotas API com rate limiting, validação Zod estrita, auditoria persistente e notificação.
  3. O validador público `app/receitas/verificar/page.tsx` não possuía ação de impressão amigável no card de resultado validado, e o `AppShell` ainda imprimia barra lateral, cabeçalho, breadcrumbs e rodapé.
- **Correção aplicada:**
  - Adicionados `updateFiscalInvoiceStatusSchema` e `strictRoleApplicationSchema` em `src/lib/validations.ts` e `recordRoleApplicationSubmittedOutbox` em `src/lib/notifications/outbox.ts`.
  - Estendido `app/api/commissions/route.ts` com ações `request_fiscal_invoice` e `update_fiscal_invoice_status` (mascarando CPF/CNPJ em logs via `maskPixKeyForDisplay` e persistindo em `audit_logs`), conectando `solicitarNotaFiscal` e `atualizarStatusNotaFiscal` em `src/services/commissions.service.ts`.
  - Endurecidos `app/api/organizations/route.ts` e `app/api/organizations/veterinarians/route.ts` (incluindo novo handler `PUT` para `update_my_vet_profile` e persistência em `audit_logs`), conectando `src/services/organizations.service.ts`.
  - Criado `app/api/role-applications/route.ts` (`POST` autenticado com rate limiting, validação `strictRoleApplicationSchema`, chamada à RPC `submit_role_application`, registro em `audit_logs` e enfileiramento de confirmação em `notification_outbox`), conectado a `src/services/operations.service.ts`.
  - Adicionado botão **Imprimir receita** no card de resultado validado em `app/receitas/verificar/page.tsx` com layout dedicado para impressão (`@media print` em `app/globals.css` e ocultação do chrome de navegação em `src/components/app-shell.tsx`, `header.tsx`, `breadcrumbs.tsx` e `footer.tsx`).
  - Adicionado teste unitário em `tests/mvp-architecture.test.ts` cobrindo `fiscalInvoiceSchema`, `updateFiscalInvoiceStatusSchema`, `vetProfileSettingsSchema` e `strictRoleApplicationSchema`.

### 6.17 Execução — FASE 6 Etapa 7 (Hardening de Assinaturas, Sessões de Teleconsulta, Disponibilidade/Receitas e Cache Local de Validação)
- **Problema identificado:**
  1. `src/services/subscriptions.service.ts` (`assinarPlanoParaPet`, `atualizarStatusAssinatura`) e `src/services/teleconsultations.service.ts` (`abrirSalaTeleconsulta`, `atualizarSessaoTeleconsulta`) executavam mutações diretamente via Supabase Browser Client sem API servidor com rate limiting, validação estrita de payload nem trilha em `audit_logs`.
  2. `src/services/availability.service.ts` (`criarHorarioDisponivel`, `alternarBloqueioHorario`, `excluirHorarioDisponivel`) e `src/services/prescriptions.service.ts` (`salvarRascunhoReceita`) ainda não roteavam por `/api/availability` e `/api/prescription-drafts`, e ambos os endpoints ainda não persistiam eventos em `public.audit_logs`.
  3. A página pública `app/receitas/verificar/page.tsx` ainda não possuía acesso rápido aos últimos códigos validados no navegador.
- **Correção aplicada:**
  - Adicionados guardas puros em `src/lib/clinical/server-flows.ts` (`canTransitionTeleconsultationStatus`, `canManageSubscriptionStatus`, `canManageTeleconsultationSession`), schemas Zod estritos em `src/lib/validations.ts` (`subscribePetPlanSchema`, `updateSubscriptionStatusSchema`, `openTeleconsultationSessionSchema`, `updateTeleconsultationSessionSchema`, `deleteAvailabilitySchema`) e helper `recordSubscriptionNotificationOutbox` em `src/lib/notifications/outbox.ts`.
  - Criado `app/api/subscriptions/route.ts` (`POST` e `PATCH` protegidos por `requireProtectedApiContext`, validação Zod estrita, verificação de titularidade, trilha em `audit_logs` e fila `notification_outbox`) e conectado a `src/services/subscriptions.service.ts`.
  - Criado `app/api/teleconsultation/sessions/route.ts` (`POST` para `open_teleconsultation_session` e `PATCH` com bloqueio de retrocesso de sessão encerrada e schema `.strict()` impedindo alteração de `recording_consent`) e conectado a `src/services/teleconsultations.service.ts`.
  - Atualizados `app/api/availability/route.ts` (incluindo novo handler `DELETE` com checagem de titularidade e `persistServerAuditLog`) e `app/api/prescription-drafts/route.ts` (adicionando `persistServerAuditLog`), conectando `src/services/availability.service.ts` e `src/services/prescriptions.service.ts`.
  - Criado `src/lib/clinical/recent-prescription-codes.ts` (armazenamento local seguro dos últimos 5 códigos validados, deduplicação e validação estrita) integrado a `app/receitas/verificar/page.tsx`.
  - Adicionados testes unitários em `tests/mvp-architecture.test.ts` cobrindo cache de validação (`5` itens), schemas estritos e transições/propriedade de teleconsulta e assinatura.

### 6.18 Execução — FASE 6 Etapa 8 (Consolidação Completa de Mutações no Servidor + Leitor QR Code via MediaDevices)
- **Problema identificado:**
  1. Os serviços de agendamentos (`criarAgendamento`, `atualizarStatusAgendamento`), prontuário (`salvarProntuario`), exames (`criarPedidoExame`, `registrarResultadoExame`) e vacinas (`criarRegistroVacina`) ainda chamavam o Supabase diretamente no navegador apesar de já existirem endpoints `/api/*`, e esses endpoints ainda não persistiam eventos na tabela `public.audit_logs`.
  2. Envio de mensagens no chat de teleconsulta (`enviarMensagemTeleconsulta`), atualização do próprio perfil (`atualizarPerfilAtual`), aceite de documentos legais (`registrarCienciaLegal`) e vinculação de cupom de parceiro (`registrarAtribuicaoParceiro`) ainda ocorriam sem API dedicada com rate limiting, validação Zod estrita nem trilha persistente em `audit_logs`.
  3. O validador público `app/receitas/verificar/page.tsx` ainda não possuía botão de leitura direta de QR Code pela câmera em dispositivos móveis.
- **Correção aplicada:**
  - Adicionados `canPostTeleconsultationMessage` em `src/lib/clinical/server-flows.ts` e schemas `sendTeleconsultationMessageSchema`, `legalAcknowledgementSchema` e `recordPartnerAttributionSchema` em `src/lib/validations.ts`.
  - Endurecidos `app/api/appointments/route.ts` (validação de `is_blocked = false`, enriquecimento com resumo do pet, `persistServerAuditLog` e fila `notification_outbox` no servidor), `app/api/clinical-records/route.ts`, `app/api/exam-orders/route.ts` e `app/api/vaccinations/route.ts` (com `persistServerAuditLog`), conectando `src/services/appointments.service.ts`, `clinical-records.service.ts`, `exam-orders.service.ts` e `vaccinations.service.ts`.
  - Criados `app/api/teleconsultation/messages/route.ts` (impedindo mensagens em salas encerradas ou de não participantes), `app/api/profile/route.ts` (schema estrito bloqueando escalação de `role`) e `app/api/legal-acknowledgements/route.ts`, além do handler `PUT` em `app/api/partners/route.ts`, conectando `teleconsultations.service.ts`, `auth.service.ts`, `operations.service.ts` e `partners.service.ts`.
  - Adicionado botão **Ler QR Code** na barra de ações de `app/receitas/verificar/page.tsx` com componente `src/components/prescription-qr-scanner.tsx` (`navigator.mediaDevices.getUserMedia` + `BarcodeDetector` e fallback `jsqr`, extração segura em `extractPrescriptionCodeFromQrValue`).
  - Adicionados testes unitários em `tests/mvp-architecture.test.ts` cobrindo extração de QR Code, guarda de chat da teleconsulta e schemas estritos (`42/42`).

---

## 7. Comandos Executados na Verificação Final

| Comando | Resultado | Observação |
| :--- | :--- | :--- |
| `npm run typecheck` | Passou (exit 0) | `tsc --noEmit` sem erros |
| `npm test` | Passou (42/42) | `pets-authorization.test.ts` (8), `rbac-and-auth.test.ts` (6), `clinical-and-orgs.test.ts` (5), `security-and-pagination.test.ts` (4), `mvp-architecture.test.ts` (19) |
| `npm run lint` | Passou (exit 0) | Verificação ESLint concluída |
| `npm run build` | Passou (exit 0) | Build App Router concluído |
| Sonda read-only Supabase (`.env.local`) | Auth 200 / Schema 0 de 32 (`404 PGRST205`) | Banco remoto ainda aguarda aplicação controlada das 15 migrations em desenvolvimento/staging |

