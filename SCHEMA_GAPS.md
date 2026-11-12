# SCHEMA_GAPS.md — auditoria local do Supabase

## Estado observado

- A pasta raiz `supabase/` existe, mas está vazia: não há `config.toml`, diretório `migrations/`, tipos gerados ou seeds.
- Não foi encontrado cliente Supabase, chamada `.from(...)`, autenticação Supabase ou variável `NEXT_PUBLIC_SUPABASE_*` no código da aplicação.
- `@supabase/supabase-js` e `@supabase/ssr` estão declarados em `package.json`, mas a aplicação não os utiliza.
- Não existe `.env.local` no projeto. Nenhum valor de chave foi lido.
- As telas Stitch mencionam Supabase em nomes e conteúdo, mas isso não comprova que as tabelas, colunas ou políticas existam no projeto remoto.

**Conclusão:** não há schema local para comparar, portanto não é possível afirmar quais tabelas, colunas, índices, funções ou políticas estão faltando no banco remoto. O estado remoto permanece desconhecido; não foi feita nenhuma alteração ou consulta ao banco.

## Domínios sugeridos pelas telas (não são schema confirmado)

| Domínio indicado pelos exports | Exemplos de telas | Situação local |
|---|---|---|
| Usuários, perfis, credenciamento e tenant | Cadastro de tutor, veterinário e parceiro; RBAC; aprovação | Sem tabelas ou políticas locais |
| Pets e responsáveis | Cadastro de pet, dados do tutor, QR Code | Sem tabelas ou políticas locais |
| Agenda e consultas | Agendamento, agenda semanal, teleconsulta | Sem tabelas ou políticas locais |
| Prontuário e documentos clínicos | SOAP, atestados, receitas, exames e laudos | Sem tabelas ou políticas locais |
| Vacinas e carteira de saúde | Cadastro de vacinação e carteira digital | Sem tabelas ou políticas locais |
| Parceiros e catálogo | Pet shops, farmácias, planos, balcão e vouchers | Sem tabelas ou políticas locais |
| Pagamentos e finanças | Checkout, comissões, repasses, carteira e conciliação | Sem tabelas ou políticas locais |
| Anúncios e campanhas | Banners, Ads, orçamento e QR Codes | Sem tabelas ou políticas locais |
| Integrações e auditoria | Asaas, Mercado Pago, ERP, webhooks, logs e Realtime | Sem tabelas ou políticas locais |

Os nomes de tabelas anteriormente sugeridos em documentos ou inferidos de telas não devem ser usados como fonte de verdade. Colunas, chaves estrangeiras, índices, funções e políticas RLS também não podem ser especificados com segurança antes de obter o schema autoritativo.

## RLS e isolamento multi-tenant

Não há migrations locais que habilitem RLS ou definam políticas. Não é possível confirmar o estado de RLS no banco remoto. Requisitos de tenant, papéis, relacionamentos e permissões devem ser validados com o schema real antes de propor uma migration.

## Próximos passos antes de uma migration

1. Conectar o projeto Supabase ao repositório e disponibilizar acesso de leitura ao schema remoto por ferramenta autorizada, sem enviar chaves no chat.
2. Salvar localmente as variáveis de ambiente necessárias para o cliente público (`NEXT_PUBLIC_SUPABASE_URL` e chave anon/publishable). Nunca expor `service_role` no navegador.
3. Comparar o schema remoto com os domínios confirmados e atualizar este relatório.
4. Propor o SQL de uma nova migration para aprovação antes de criá-la ou aplicá-la. Não alterar nem remover dados, tabelas ou colunas sem aprovação.
