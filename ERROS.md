# Erros e pendências do projeto

## Validação do frontend

Na última validação, os comandos abaixo foram executados com sucesso:

| Comando | Resultado |
|---|---|
| `npm run lint` | Sem avisos ou erros do ESLint |
| `npm run typecheck` | Sem erros de TypeScript |
| `npm run build` | Build de produção concluído; 6 rotas da aplicação geradas |

Para permitir essas verificações:

- Foi criado `.eslintrc.json` com as configurações recomendadas pelo Next.js.
- O `tsconfig.json` foi ajustado para incluir os arquivos TypeScript e TSX do projeto.

## Pendências de backend

Estas pendências não impedem a compilação do frontend, mas precisam ser resolvidas antes de considerar a integração com Supabase concluída:

- Criar e validar as migrações, o esquema do banco e as políticas RLS com base no esquema real do projeto.
- Configurar as variáveis de ambiente do Supabase e validar a conexão com um projeto.

Os nomes de tabelas e relações em [SCHEMA_GAPS.md](./SCHEMA_GAPS.md) são hipóteses extraídas das telas Stitch; não devem ser tratados como esquema confirmado.
