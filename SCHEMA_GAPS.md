# SCHEMA_GAPS.md — auditoria local do Supabase

## Estado observado

- Foi criada a migration local `supabase/migrations/20261112210000_initial_drvet_backend.sql` com schema inicial para perfis, organizações, membros, veterinários, pets, disponibilidade e agendamentos. Ela ainda não foi aplicada nem testada contra PostgreSQL.
- A migration `supabase/migrations/20261112213000_clinical_records.sql` adiciona prontuários SOAP por agendamento, sinais vitais, rascunho/finalização e políticas de leitura. Também não foi executada nem testada contra PostgreSQL.
- A migration `supabase/migrations/20261112214000_vaccination_records.sql` adiciona carteira de vacinação imutável, RPC para registro pelo veterinário responsável e leitura controlada para tutor/veterinário. Também não foi executada nem testada contra PostgreSQL.
- A migration `supabase/migrations/20261112215000_exam_orders.sql` adiciona solicitações e resultados de exames laboratoriais/imagem, com RLS e RPCs. Também não foi executada nem testada contra PostgreSQL.
- A migration `supabase/migrations/20261112216000_availability_blocks.sql` adiciona bloqueio de horários futuros, impede bloqueio com agendamento ativo e preserva o estado bloqueado ao cancelar consultas. Ainda não foi executada nem testada contra PostgreSQL.
- A migration `supabase/migrations/20261112217000_prescription_drafts.sql` adiciona rascunhos editáveis de receita vinculados a atendimento, com escrita por RPC para o veterinário aprovado designado. Não inclui emissão, assinatura ou catálogo e ainda não foi executada nem testada contra PostgreSQL.
- O código inclui clientes Supabase de navegador/servidor tipados, login/cadastro, middleware, APIs e telas conectadas para pets e agendamentos.
- O formulário derivado do export Stitch `agendamento_da_1_teleconsulta_com_15_off_drvet` usa as tabelas existentes `pets`, `professional_availability` e `appointments`; não foi necessária outra migration para persistir pedido, modalidade, motivo, paciente e horário. Valores, cupom, crédito de loja, pagamento, vídeo e certificação mostrados no HTML são protótipo e não são gravados nem cobrados.
- `@supabase/supabase-js` e `@supabase/ssr` estão declarados em `package.json`.
- Não existe `.env.local` no projeto. Nenhum valor de chave foi lido.
- As telas Stitch mencionam Supabase em nomes e conteúdo, mas isso não comprova que as tabelas, colunas ou políticas existam no projeto remoto.

**Conclusão:** os primeiros fluxos estão implementados no código e em migrations locais, mas não foi possível conectar ou validar o banco remoto porque não há `.env.local` nem credenciais. O usuário informou que o banco está vazio, informação ainda não verificada por conexão. As migrations continuam não aplicadas.

## Domínios sugeridos pelas telas (não são schema confirmado)

| Domínio indicado pelos exports | Exemplos de telas | Situação local |
|---|---|---|
| Usuários, perfis, credenciamento e tenant | Cadastro de tutor, veterinário e parceiro; RBAC; aprovação | Migration cobre Auth/profile, organização, papéis e aprovação básica de veterinário; convites e RBAC completo pendentes |
| Pets e responsáveis | Cadastro de pet, dados do tutor, QR Code | Migration/API cobre cadastro e leitura de pets próprios; compartilhamento, QR e responsáveis pendentes |
| Agenda e consultas | Agendamento, agenda semanal, teleconsulta | Migrations/API cobrem horários, solicitação, confirmação, conclusão, cancelamento e bloqueio/liberação manual de horários futuros; recorrência, bloqueios em lote, teleconsulta e notificações pendentes |
| Prontuário e documentos clínicos | SOAP, atestados, receitas, exames e laudos | SOAP, vacinação, pedidos/resultados textuais de exames e rascunhos de receita têm tabelas, RPCs e políticas locais; emissão/assinatura de receita, documentos/anexos, auditoria clínica e atestados pendentes |
| Vacinas e carteira de saúde | Cadastro de vacinação e carteira digital | Tabela imutável, RPC de registro e leitura por tutor/veterinário implementadas localmente; execução e teste RLS pendentes |
| Parceiros e catálogo | Pet shops, farmácias, planos, balcão e vouchers | Sem tabelas ou políticas locais |
| Pagamentos e finanças | Checkout, comissões, repasses, carteira e conciliação | Sem tabelas ou políticas locais |
| Anúncios e campanhas | Banners, Ads, orçamento e QR Codes | Sem tabelas ou políticas locais |
| Integrações e auditoria | Asaas, Mercado Pago, ERP, webhooks, logs e Realtime | Sem tabelas ou políticas locais |

As migrations aqui descritas são propostas locais, não uma confirmação do schema remoto. Tabelas, colunas, chaves estrangeiras, funções e políticas RLS precisam ser revisadas contra o projeto Supabase de destino antes da aplicação.

## RLS e isolamento multi-tenant

As migrations locais habilitam RLS nas tabelas implementadas. O prontuário só pode ser salvo pelo veterinário aprovado designado para consulta confirmada/concluída; tutor pode ler registro finalizado e equipe owner/admin pode ler registros da organização. A vacinação só pode ser incluída pelo veterinário aprovado designado após o término do atendimento, sem grants de edição/exclusão; tutor e veterinário designado podem ler o histórico. Pedidos e resultados de exames ficam ligados ao atendimento; somente o veterinário designado cria pedido/resultado, e resultado salvo é imutável. Tutor, veterinário designado e owner/admin da organização podem ler. Rascunhos de receita são legíveis somente pelo veterinário aprovado designado e salvos/atualizados por RPC transacional após o início do atendimento; não existe endpoint de emissão ou assinatura. O bloqueio/liberação é feito por RPC transacional, restrito ao próprio veterinário aprovado, e rejeita horários iniciados/passados ou com agendamento ativo. As políticas ainda precisam de testes de isolamento com múltiplos usuários no Postgres/Supabase. Não é possível confirmar o estado do RLS no banco remoto.

## Próximos passos antes de uma migration

1. Configurar localmente em `.env.local` a URL e a chave pública (`NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`); nunca expor `service_role` no navegador nem no chat.
2. Instalar/autenticar a Supabase CLI localmente e vincular o projeto/ambiente correto; esses requisitos não estão disponíveis neste ambiente.
3. Confirmar o destino e verificar que o banco está vazio, depois executar as migrations primeiro em staging/local, revisar SQL e testar RLS com usuários/organizações diferentes.
4. Não alterar nem remover dados, tabelas ou colunas sem aprovação.
