# Supabase — DrVet

Esta pasta contém todo o backend SQL e Edge Functions do projeto DrVet:

- `migrations/`: scripts SQL versionados em ordem cronológica (tabelas, triggers `updated_at`, funções RPC, políticas de RLS por perfil e buckets/políticas de Storage).
- `seed.sql`: dados iniciais e contas de demonstração para homologação.
- `functions/`: Edge Functions (`request-anticipation` e `payment-webhook`).

Consulte [`../SETUP_SUPABASE.md`](../SETUP_SUPABASE.md) para a ordem exata de aplicação no Supabase.
