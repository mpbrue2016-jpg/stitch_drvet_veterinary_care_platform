# Procedimento Seguro de Aplicação das Migrations (Dev / Staging)

As migrations do DrVet residem em `supabase/migrations/` em ordem cronológica estrita (`20261112210000` até `20261125000100`).

> **Regra de segurança:** nunca aplique migrations diretamente em produção sem aprovação prévia, backup/snapshot e validação prévia em desenvolvimento ou staging.

## Pré-requisitos
1. Supabase CLI instalado (`npx supabase --version`) ou acesso autenticado ao SQL Editor do projeto alvo de **desenvolvimento/staging**.
2. Variáveis configuradas em `.env.local` (nunca versionadas no Git):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` ou `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (somente servidor)

## Ordem de Execução
1. `20261112210000_initial_drvet_backend.sql`
2. `20261112213000_clinical_records.sql`
3. `20261112214000_vaccination_records.sql`
4. `20261112215000_exam_orders.sql`
5. `20261112216000_availability_blocks.sql`
6. `20261112217000_prescription_drafts.sql`
7. `20261113000100_profiles_roles_and_updated_at.sql`
8. `20261113000200_commissions_and_payouts.sql`
9. `20261113000300_storage_buckets_and_policies.sql`
10. `20261113000400_teleconsulta_subscriptions_partners.sql`
11. `20261113000500_admin_integrations_and_checkout.sql`
12. `20261113000600_push_notifications.sql`
13. `20261123000100_production_repairs_and_features.sql`
14. `20261124000100_security_indexes_and_audit_logs.sql`
15. `20261124000200_mvp_architecture_readiness.sql`
16. `20261125000100_vet_photo_and_facial_biometrics.sql`

## Passo a passo em Desenvolvimento / Staging (via Supabase CLI)
```bash
# 1. Autenticar no CLI e vincular ao projeto de staging/dev
npx supabase login
npx supabase link --project-ref <SEU_PROJECT_REF_STAGING>

# 2. Conferir plano de execução antes de aplicar
npx supabase db push --dry-run

# 3. Aplicar em staging/dev
npx supabase db push

# 4. Verificar saúde via API ou painel administrativo
```

## Passo a passo alternativo (SQL Editor do Painel Supabase — Dev/Staging)
Se não houver `SUPABASE_ACCESS_TOKEN` ou `DATABASE_URL` no terminal:
1. Abra o **SQL Editor** do projeto de desenvolvimento/staging no painel do Supabase.
2. Execute cada arquivo de `supabase/migrations/` na ordem numérica acima (`1` a `16`), aguardando conclusão sem erros em cada etapa.
3. Verifique no **Table Editor** se todas as tabelas de `DRVET_ALL_TABLES` foram criadas.
4. Verifique no **Authentication -> Providers / Email** se a confirmação de e-mail (`Confirm email`) está habilitada conforme a política do ambiente.
