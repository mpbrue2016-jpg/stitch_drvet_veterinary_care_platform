# Auditoria do backend DrVet

## Resumo executivo

O repositório continha uma interface Next.js e exports Stitch sem backend. Foram implementados fluxos verticais locais para autenticação, organizações, cadastro de veterinários, pets, agendamentos, prontuário SOAP, carteira de vacinação e solicitações/resultados de exames. Isso não equivale ao backend completo de todos os 110 exports.

Não é possível conectar nem validar o banco remoto neste ambiente: não há `.env.local` nem credenciais locais. O usuário informou que o banco está vazio; isso ainda não foi verificado tecnicamente. As migrations permanecem locais e não aplicadas. Nenhuma alteração foi feita no banco remoto.

## Evidências locais

| Área | Estado encontrado |
|---|---|
| Interface | Rotas Next.js para tutor, agenda semanal conectada à API de atendimentos, autenticação/recuperação de senha, prontuário SOAP, `/carteira/vacinas` e `/exames`. |
| Protótipos Stitch | 110 exports `code.html`; o inventário e o mapeamento inferido estão em [TELAS.md](./TELAS.md). |
| Persistência | Pets, organizações, horários, agendamentos, prontuários SOAP, vacinação, exames e rascunhos de receita usam Route Handlers Supabase. O formulário de agendamento baseado no Stitch consulta pets/horários reais e cria solicitações na tabela existente de atendimentos. Bloqueio e liberação de horários futuros do próprio veterinário também estão ligados à API. Realtime, Storage e anexos clínicos ainda não existem. |
| Supabase | Migrations locais criam perfis, organizações, papéis, veterinários, pets, disponibilidade, bloqueios, agendamentos, SOAP, vacinação, exames e rascunhos de receita com RLS/RPCs. Não há migrações para os demais domínios. |
| Configuração | `.env.local` não existe; o `.env.example` contém apenas nomes de variáveis, sem segredos. |
| Clientes Supabase | Factories de navegador/servidor tipadas, atualizadas para SSR compatível e middleware de renovação/proteção de sessão. |
| Identidade e acesso | Login, cadastro, callback, recuperação de senha, logout e proteção das rotas profissionais estão implementados. Convites por e-mail ainda não. |
| API e lógica de negócio | Route Handlers autenticados e validados para pets, organizações, profissionais, disponibilidade, agendamentos, SOAP, vacinação e exames. |
| Funcionalidades | Tutor cadastra pet e solicita horário; profissional consulta a agenda semanal, gerencia consulta, bloqueia/libera horário futuro sem agendamento ativo, salva/finaliza SOAP, registra vacinação, solicita exames/registra resultados e salva rascunhos de receita após o início do atendimento; leitura é filtrada pelas relações autorizadas. A solicitação não cobra, confirma consulta ou ativa ofertas comerciais. |
| Testes | Lint, TypeScript, build e `git diff --check` passam. Não há testes automatizados de API/RLS; as migrations não foram executadas porque não há Supabase CLI, Postgres local, Docker ativo nem credenciais do projeto. |
| Serviços externos | Nenhuma credencial ou integração funcional para pagamentos, vídeo, assinatura digital, mensagens ou ERP foi encontrada. |

As contagens por domínio abaixo classificam os títulos dos exports por palavras-chave e podem se sobrepor funcionalmente; não representam uma especificação aprovada:

| Domínio indicado pelas telas | Exports classificados | Situação do backend |
|---|---:|---|
| Tutores e pets | 23 | Cadastro básico conectado; responsáveis autorizados, copropriedade e fluxo completo ainda pendentes. |
| Agenda e consultas | 20 | Horários, solicitações básicas, bloqueio/liberação manual e agenda semanal conectados localmente; recorrência, notificações e no-show pendentes. |
| Clínico | 26 | SOAP com sinais vitais, carteira vacinal, pedidos/resultados textuais de exames e rascunhos de receita implementados localmente; emissão oficial, anexos e assinatura pendentes. |
| Financeiro | 10 | Sem cobrança, ledger, comissão, split, conciliação ou repasse. |
| Parceiros | 4 | Sem credenciamento, tenant, catálogo ou operação de parceiro. |
| Marketing | 3 | Sem campanhas, orçamento, banners, QR codes ou métricas. |
| Administração e integrações | 8 | Sem RBAC, auditoria, configuração de integrações ou webhooks. |
| Outros | 16 | Requer classificação funcional detalhada antes de desenvolver. |

## Lacunas por construir

### 1. Plataforma, identidade e segurança (parcial)

- Migration inicial define organizações, papéis, associação de profissional e RLS para o primeiro fluxo; o modelo ainda precisa ser confrontado com o schema remoto e as regras reais.
- Login, cadastro, confirmação de e-mail via callback, recuperação de senha por e-mail, redefinição autenticada, sessões e logout foram implementados. MFA, convite seguro de membros e encerramento de outras sessões estão pendentes.
- RLS protege os recursos incluídos na migration; não há ainda testes negativos/positivos entre organizações e papéis.
- Trilha de auditoria, gestão completa de papéis e permissões granulares continuam pendentes.
- Proteção de segredos, validação de entrada, rate limiting, logs sem conteúdo clínico e estratégia de backups/retention.

### 2. Operação clínica (parcial)

- Cadastro do tutor por Auth e cadastro de pets com RLS de proprietário foram implementados. Responsáveis autorizados, copropriedade e compartilhamento de pets continuam pendentes.
- Horários e estados básicos de agendamento, exclusão de conflito por veterinário, cancelamento transacional e bloqueio/liberação manual de horários futuros foram implementados. A migration impede bloquear slots com agendamento ativo e evita que o cancelamento reabra um slot bloqueado. Recorrência, bloqueios em lote/folgas, fusos de clínica, lembretes e políticas de no-show continuam pendentes.
- A criação da organização, inclusão e aprovação manual de veterinário existem. Convite automatizado, verificação de credenciais e configurações clínicas ainda não.
- Evolução SOAP básica vinculada a agendamento, com dados vitais, gravação de rascunho e finalização imutável; histórico auditável de edições de rascunho, retornos e encaminhamentos ainda pendentes.
- Carteira de vacinação imutável, vinculada ao pet e atendimento; somente o veterinário aprovado designado pode registrar após o fim do atendimento, e tutor/veterinário podem ler conforme RLS.
- Pedidos de exames laboratoriais/de imagem e resultado textual imutável, vinculados ao atendimento; somente o veterinário aprovado designado cria pedido e registra resultado. Arquivos/laudos anexos e integração laboratorial pendentes.
- Rascunho de receita vinculado ao atendimento, editável pelo veterinário aprovado designado e sem catálogo/recomendação de medicamentos. Emissão oficial, assinatura, regras de controle especial, PDFs e validação jurídica/regulatória continuam pendentes.
- Atestados e arquivos com acesso controlado.
- Regras para assinatura digital e validade de documentos; não podem ser simuladas por uma assinatura visual.

### 3. Parceiros, comércio e finanças

- Credenciamento, organizações parceiras, catálogo e permissões de acesso.
- Pedidos, pagamentos, reembolsos, comissões, ledger contábil, repasses e conciliação.
- Integrações de pagamento e webhooks idempotentes, verificação de assinatura e registro de eventos.
- Campanhas, anúncios, cupons e QR codes, se esses fluxos forem parte do escopo de produção.

### 4. Serviços externos e operação

As referências Stitch citam Asaas, Mercado Pago, LiveKit/WebRTC, ICP-Brasil, WhatsApp, Bling/Omie e serviços laboratoriais. Os nomes nos protótipos não confirmam contratos, credenciais, contas de teste, permissões nem requisitos de produção. Cada integração exige escolha do fornecedor, chaves secretas no servidor, webhooks, tratamento de falhas e testes próprios.

## Sequência recomendada de implementação

1. **Confirmar o banco**: verificar se o projeto remoto está vazio. Se tiver dados/schema, revisar conflitos e preparar migration de adaptação antes de aplicar esta migration inicial.
2. **Conectar e validar**: configurar `.env.local`, aplicar em banco local/staging, gerar tipos com CLI e testar Auth/RLS com usuários isolados.
3. **Completar o primeiro fluxo**: convite de equipe, horários recorrentes/bloqueios em lote, notificações e validação de autorização.
4. **Prontuário e documentos clínicos**: validar as migrations em staging; acrescentar histórico auditável, anexos privados, receitas e assinaturas somente com serviços válidos.
5. **Financeiro e parceiros**: ledger e integrações sandbox; só liberar produção após conciliação e idempotência verificadas.
6. **Demais módulos dos exports**: administração, marketing, comunicação, teleconsulta, integrações e relatórios conforme prioridades de produto confirmadas.
7. **Validação para produção**: testes unitários, RLS com usuários de diferentes papéis/organizações, integração, fluxos de erro, observabilidade, backups e deploy configurado.

## Bloqueios para concluir ou testar a conexão real

- Para conectar a aplicação, configurar localmente `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (ou `NEXT_PUBLIC_SUPABASE_ANON_KEY`) em `.env.local`. Nunca usar `service_role` no navegador nem enviar chaves no chat.
- Para aplicar as migrations, também é necessário instalar/configurar a Supabase CLI, autenticar localmente e vincular o projeto correto. Esses requisitos não estão disponíveis neste ambiente.
- A URL `${origin}/auth/callback?next=/senha/nova` precisa estar autorizada na lista de Redirect URLs do Supabase Auth para o fluxo de recuperação.
- O usuário informou que o projeto remoto está vazio; a informação não foi verificada por conexão. As migrations **não foram aplicadas** e devem ser revisadas antes do uso.
- Priorizar os fluxos e confirmar os provedores de pagamentos, teleconsulta e assinatura digital. As telas exportadas não bastam para inferir regras transacionais ou contratos de integração.

## Conclusão

O backend completo continua **inacabado**. Estão implementados localmente a base de autenticação, o fluxo inicial de tutor/pet/agendamento, bloqueio/liberação de horários, SOAP, carteira de vacinação, solicitações/resultados textuais de exames e rascunhos de receita. Não há conexão real enquanto o Supabase não for configurado e as migrations não forem aplicadas e testadas. Emissão oficial de receitas, pagamentos, parceiros e demais domínios ainda precisam de implementação e aprovação de requisitos.
