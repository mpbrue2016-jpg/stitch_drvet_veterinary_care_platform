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

**Erros atuais de lint, build e TypeScript: nenhum nas verificações acima.** Isso não significa que a aplicação esteja funcional de ponta a ponta: as páginas ainda contêm conteúdo de demonstração e controles sem ação, e não há integração Supabase implementada. Consulte [TELAS.md](./TELAS.md) e [SCHEMA_GAPS.md](./SCHEMA_GAPS.md).

## Preparação Git

- Branch local: `feature/frontend-stitch-backend`.
- Backup local criado antes da auditoria: `d442e3c` (`chore: backup project before audit`).
- O repositório está isolado na pasta do projeto. Nenhum remoto GitHub está configurado.
