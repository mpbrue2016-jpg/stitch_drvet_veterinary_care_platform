# ERROS.md — preparação e validação

## Fase 0: verificações executadas

| Comando | Resultado |
|---|---|
| `npm install --no-audit --no-fund` | Concluído; dependências já estavam atualizadas. |
| `npm run lint` | Concluído sem avisos ou erros do ESLint. |
| `npm run build` | Concluído; build de produção e geração das rotas passaram. |
| `npx tsc --noEmit` | Concluído sem erros quando executado isoladamente após o build. |

Uma execução de `tsc` em paralelo com `next build` encontrou arquivos temporários `.next/types` sendo recriados pelo build (`TS6053`). A execução isolada posterior passou; não é um erro reproduzível do código.

## Problemas de configuração corrigidos

- Criado `.eslintrc.json` para que `next lint` use a configuração do Next.js sem iniciar um assistente interativo.
- Ajustado `tsconfig.json` para incluir os arquivos TypeScript/TSX do projeto. Antes, a configuração apontava para `next/src/**/*`, que não corresponde ao código da aplicação, e podia deixar arquivos sem verificação.
- Adicionado `*.tsbuildinfo` ao `.gitignore` para não versionar o cache incremental do TypeScript.

## Resultado

**Erros atuais de lint, build e TypeScript: nenhum nas verificações acima.** Parte das páginas ainda contém conteúdo de demonstração. A base Supabase e alguns fluxos estão implementados localmente, mas o banco remoto não está conectado. Consulte [TELAS.md](./TELAS.md) e [SCHEMA_GAPS.md](./SCHEMA_GAPS.md).

## Fase 2: correção e revisão

- Reexecutados, em sequência, `npm run lint`, `npm run build` e `npm run typecheck`; todos passaram sem avisos ou erros.
- Revisados os arquivos TypeScript/TSX da aplicação: não foram encontrados imports não usados, diretivas `@ts-ignore`/`eslint-disable`, usos de `any`, nem logs `console` ou marcações `TODO`/`FIXME`.
- As dependências Supabase e Zod foram mantidas: são necessárias para as fases futuras de integração e validação de dados descritas no escopo; removê-las agora causaria reinstalação sem resolver um problema atual.
- Registros demonstrativos e botões sem comportamento nas páginas foram identificados na auditoria. A substituição por fluxos reais pertence às fases de backend e integração das telas, não pode ser resolvida com segurança nesta fase sem schema e serviços configurados.

## Fase 3: design system e layout

- Definidos tokens de cor, tipografia, foco e sombra; criado o shell responsivo com marca DrVet, navegação desktop e menu móvel para as rotas existentes.
- Criados componentes reutilizáveis de botão, campo de texto, seleção, cartão, cabeçalho de página, tabela, badge, estado vazio, skeleton, abas, modal e toast.
- Aplicado o design às páginas atuais. Os dados fictícios estão identificados como demonstrativos e as ações que dependem de backend ficam explicitamente desativadas até a integração.
- Corrigida a ausência de configuração PostCSS: agora o build inclui as utilidades Tailwind e os estilos responsivos.
- Padronizada a rota de comissões como `/comissoes` (sem acento), pois o caminho Unicode retornava 404 no navegador.
- Testes no navegador de produção: as seis rotas existentes retornaram HTTP 200; em 375 px não há overflow horizontal na página e tabelas largas rolam dentro do próprio quadro; em 1440 px a barra lateral aparece.
- Navegação específica por perfil ainda não é exibida: depende da autenticação e autorização da Fase 4. A logo oficial também não foi fornecida; o símbolo geométrico usado no shell é apenas decorativo.

## Alinhamento visual com as referencias Stitch

- Reorganizada a home como landing publica e aproximadas agenda, agendamentos, receitas e comissoes das respectivas referencias Stitch.
- Mantidos estados vazios e acoes desativadas quando dependem de backend; nao foram incluidos dados clinicos, consultas ou valores financeiros ficticios.
- Validacao no navegador de producao: as seis rotas existentes retornaram HTTP 200; em viewport de 375 px nenhuma apresentou overflow horizontal; em 1440 px a sidebar profissional foi exibida; o menu movel abriu e mostrou as cinco rotas.
- `npm run lint`, `npm run typecheck` e `npm run build` passaram apos as alteracoes.

## Correções atuais

- Removido `baseUrl` depreciado do TypeScript e ajustado o alias `@/*` para caminho relativo.
- Incluída declaração para imports de CSS global reconhecidos pelo editor.
- A imagem do hero foi substituída pela ilustração/foto da exportação Stitch e salva localmente em `public/stitch-vet-hero.webp`.
- Adicionados clientes Supabase de navegador/servidor e `.env.example`. A conexão real e consultas permanecem pendentes: não há `.env.local` nem schema conhecido.
- Auditoria inicial do backend em `BACKEND_AUDIT.md`: identificou que autenticação, RLS, migrations, operações de dados e integrações não existiam antes desta fatia.
- Implementada a primeira fatia do backend: login/cadastro/callback/logout, middleware de sessão, APIs autenticadas de organização/profissional/pet/horário/agendamento, migration local com RLS e bloqueio concorrente de horários; telas de agenda e agendamento conectadas às APIs.
- Migration ainda não aplicada: `.env.local` e schema remoto não foram fornecidos. A tentativa de validar SQL em PostgreSQL ficou bloqueada porque não há Supabase CLI/PostgreSQL instalado nem Docker ativo. API retorna HTTP 503 sem Supabase; área profissional redireciona ao login.
- Adicionado o fluxo clínico SOAP por agendamento, com sinais vitais, rascunho e finalização bloqueada para edição. RLS/RPC restringem gravação ao veterinário aprovado designado; tutor lê apenas registros finalizados. Não equivale a assinatura digital ou prescrição.
- Adicionada a carteira de vacinação: tutor/veterinário autorizado consulta registros; somente o veterinário aprovado designado registra vacina após o atendimento. Os registros não podem ser editados/excluídos pela API.
- Ordenadas as migrations locais por timestamp na sequência: schema inicial, SOAP e vacinação. Nenhuma delas foi aplicada ao Supabase.
- Adicionado o fluxo de exames (pedido laboratorial/imagem e resultado textual); pedidos/resultados são protegidos por RLS e ficam vinculados ao atendimento. Resultado salvo é imutável pela API; anexos e integração de laboratório permanecem pendentes.
- Tentativa de preparar a execução remota das migrations bloqueada: não há Supabase CLI instalado, `.env.local` nem variáveis de projeto no ambiente. Nenhum valor secreto foi solicitado ou exibido, e nenhum SQL foi enviado ao banco.
- Após a implementação dos exames, `npm run lint`, `npm run typecheck`, `npm run build` e `git diff --check` passaram. A rota protegida redireciona ao login e `/api/exam-orders` responde HTTP 503 sem Supabase.
- Adicionada recuperação de senha por e-mail com mensagem que não revela se a conta existe, callback com destino interno validado e rota protegida para definir a nova senha. O login e a redefinição agora usam página pública sem navegação profissional.
- O Redirect URL `${origin}/auth/callback?next=/senha/nova` precisa ser incluído na lista autorizada do Supabase Auth; sem Supabase configurado, o envio e a confirmação do e-mail não podem ser testados aqui.
- Verificação local de produção: login e formulário de recuperação renderizam sem menu profissional; alternância recuperar/voltar mantém o login e o campo de senha; rota `/senha/nova` sem sessão redireciona para `/login?setup=required`. Build, lint e typecheck isolado passaram.
- Atualizado `@supabase/ssr` para versão compatível com o `@supabase/supabase-js` instalado.
- Sem credenciais, as APIs protegidas respondem HTTP 503 com mensagem clara e as páginas profissionais redirecionam para `/login?setup=required`; isso confirma configuração ausente, não uma conexão Supabase bem-sucedida.
- Após a fatia SOAP: `npm run lint`, `npm run typecheck`, `npm run build` e `git diff --check` passaram. A API clínica sem configuração responde 503 e a rota SOAP protegida redireciona ao login. Testes automatizados de RLS/API e execução SQL em PostgreSQL ainda precisam ser feitos.
- Adicionado bloqueio/liberação de horários futuros na agenda profissional. A migration valida o veterinário aprovado, rejeita slots iniciados ou com agendamento ativo e mantém bloqueios após cancelamentos; a API oferece leitura dos horários próprios e atualização por RPC.
- Validação da fatia de agenda: `npm run lint`, `npm run typecheck`, `npm run build` e `git diff --check` passaram. A migration continua local e não foi executada no Supabase/PostgreSQL; concorrência e RLS precisam de testes de integração com banco configurado.
- Implementados rascunhos de receita vinculados ao atendimento. Apenas o veterinário aprovado designado pode salvar/atualizar itens manuais após o início do atendimento; não há catálogo, recomendação de dose, assinatura, emissão oficial ou PDF.
- Validação dos rascunhos: lint, typecheck e `git diff --check` passaram. A migration `20261112217000_prescription_drafts.sql` ainda precisa de execução e testes de integração/RLS em PostgreSQL/Supabase configurado.
- Build de produção passou; sem configuração, `/api/prescription-drafts` responde HTTP 503 e `/receitas` redireciona para `/login?setup=required`, conforme proteção atual das rotas profissionais.
- Revisão de acabamento do formulário: seleção inicial automática de atendimento elegível, confirmação ao descartar alterações, bloqueio dos campos durante salvamento, botão de nova tentativa em erro e rótulos acessíveis; o menu agora identifica a tela como rascunho e não sugere integração ICP-Brasil.
- Conectada a agenda semanal da referência Stitch à API de atendimentos: navegação por semana, filtros por profissional autenticado, indicadores sem valores financeiros inventados, consultas por dia/horário e próximo atendimento. A API agora aceita intervalos ISO validados e mantém o comportamento anterior quando não há intervalo.
- `npm run lint`, `npm run typecheck`, `git diff --check` e diagnósticos do VS Code passaram para a agenda/API. A exibição com dados reais ainda depende de configurar Supabase e aplicar as migrations no projeto correto.
- A tela `/agendamento/edit` foi alinhada ao export Stitch `agendamento_da_1_teleconsulta_com_15_off_drvet` e conectada às APIs existentes de pets, horários e agendamentos. Inclui escolha dinâmica de datas/horas publicadas, cadastro vinculado de pet, modalidade, motivo e confirmação de protocolo pendente; não exibe como reais o cupom de 15%, crédito de R$ 30,00, preço, pagamento, gravação ou promessa de assinatura do HTML.
- A migration inicial já persiste o conteúdo operacional desta solicitação em `appointments`; não foi criada tabela redundante. Ativar promoções/pagamentos exige confirmação dos termos comerciais e provedor/ambiente de pagamento.
- Refinado o layout da tela para se aproximar do Stitch, incluindo seletor horizontal de datas, horários e CTA fixo responsivo. `npm run lint`, `npm run typecheck`, `npm run build`, `git diff --check` e diagnósticos do VS Code passaram após os ajustes. A conferência visual autenticada e o teste ponta a ponta ainda dependem de configurar o Supabase.

## Preparação Git

- Branch local: `feature/frontend-stitch-backend`.
- Backup local criado antes da auditoria: `d442e3c` (`chore: backup project before audit`).
- O repositório está isolado na pasta do projeto. Nenhum remoto GitHub está configurado.
- Fase 1 registrada em `335b69f` (`docs: complete phase one audit`).
