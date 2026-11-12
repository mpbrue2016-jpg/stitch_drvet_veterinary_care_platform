# SCHEMA_GAPS.md - Supabase Schema vs Stitch Requirements (Phase 1 Audit)

Generated during Phase 1 – Audit (read-only).

## 1. Current state of /supabase (source of truth)

The `/supabase` folder does NOT exist yet. It must be created from scratch per Rule 2 (new migration only).
- Expected location: `/supabase/migrations/` + config.
- Existing references found in HTML files:
  - `conex_o_com_banco_de_dados_supabase_postgresql_realtime_drvet_empresas/code.html`
  - `inser_o_de_exames_laboratoriais_no_supabase_drvet/code.html`
  - `link_de_conex_o_restabelecido_flush_buffer_200_ok_supabase_drvet/code.html`
  - `credenciamento_conclu_do_com_sucesso_no_supabase_drvet/code.html`

## 2. Tables referenced by Stitch screens (extracted from filenames & content)

| Screen category | Table(s) implied |
|---|---|
| Prontuário / Receita / Exames | `prontuarios`, `receitas`, `exames`, `laboratoriais`, `laudos`, `soap` |
| Comissões / Repasses | `comissoes`, `repasses`, `extratos`, `pagamentos`, `balc` |
| Pagamentos / Checkout | `pedidos`, `metodos_pagamento`, `vouchers`, `cupons`, `pix`, `seguro` |
| Anúncios / Campanhas | `campanhas`, `anuncios`, `banners`, `qr_codes`, `promocao` |
| Pet Shop / Parceiros | `pet_shops`, `parceiros`, `farms`, `cia`, `balcão`, `voucher` |
| Veterinários | `veterinarios`, `profiles`, `tenants`, `m_dicos` |
| Farm/CIA | `farm_cias`, `farm_cia`, `parceiras` |
| Dashboard Global | `dashboard`, `global`, `operacional` |
| Auditoria / CFMV | `audit_logs`, `icp_brasil`, `logs_seguranca` |

## 3. Missing RLS policies (per Rule 3)

All tables require RLS with tenant_id and profile columns. Specific missing policies:

### Tabelas prováveis (from screen actions):
- `pets` → RLS por tenant e perfil
- `tutores` → RLS por tenant e perfil
- `consultas` → RLS por tenant e perfil
- `agenda` → RLS por tenant e perfil
- `prontuarios` → RLS por tenant e perfil
- `receitas` → RLS por tenant e perfil
- `exames` → RLS por tenant e perfil
- `comissoes` → RLS por tenant e perfil
- `pagamentos` → RLS por tenant e perfil
- `campanhas` → RLS por tenant e perfil
- `anuncios` → RLS por tenant e perfil
- `partners/shops` → RLS por tenant e perfil
- `realtime` → RLS por tenant e perfil

## 4. Chaves estrangeiras (FK) esperadas

- `pets.pet_id` → `tutores.tutor_id`, `veterinarios.vet_id`, `pet_shops.petShopId`
- `consultas.consulta_id` → `tutores.tutor_id`, `veterinarios.vet_id`
- `agenda.agenda_id` → `tutores.tutor_id`, `veterinarios.vet_id`, `pet_shops.petShopId`
- `prontuarios.prontoId` → `pets.petId`, `tutores.tutorId`, `veterinarios.vetId`, `pet_shops.petShopId`
- `receitas.receitaId` → `pets.petId`, `tutores.tutorId`, `veterinarios.vetId`, `pet_shops.petShopId`
- `exames.exameId` → `pets.petId`, `tutores.tutorId`, `veterinarios.vetId`, `pet_shops.petShopId`
- `comissoes.comissãoId` → `pet_shops.petShopId`, `veterinarios.vetId`, `adminMaster.id`
- `pagamentos.pagamentoId` → `pets.petId`, `tutores.tutorId`, `veterinarios.vetId`, `pet_shops.petShopId`

## 5. Índices recomendados

- `pets.pet_id` (PK)
- `tutores.tutor_id` (PK)
- `veterinarios.vet_id` (PK)
- `pet_shops.petShop_id` (PK)
- `agendas.agenda_id` (PK)
- `prontuarios.pronto_id` (PK)
- `receitas.receita_id` (PK)
- `exames.exame_id` (PK)
- `comissoes.comission_id` (PK)
- `pagamentos.pagamento_id` (PK)
- `campanhas.campana_id` (PK)
- `audit_logs.log_id` (PK)

## 6. Políticas RLS (per tenant + perfil)

Exemplo de política para tabela `pets`:
```sql
CREATE POLICY pet_tenant_perfils ON pets USING (tenant_id = current_tenant() AND profile = 'tutor' OR profile = 'veterinario' OR profile = 'shop');
```

## 7. Necessidades de migração (nova migration)

Antes de aplicar qualquer alteração:
1. Execute `SUPABASE_RUN_READ_ONLY_QUERY` para obter metadados autoritativos.
2. Use `SUPABASE_SELECT_FROM_TABLE` para validar colunas/typos.
3. Não apague tabelas/colunas sem aprovação.

## 8. Links de Supabase (no frontend)

- NEXT_PUBLIC_SUPABASE_URL (env var)
- NEXT_PUBLIC_SUPABASE_ANON_KEY (anon/publishable key — NEVER service_role)
- Service role ONLY on server (route handlers, Edge Functions).

---
*Este arquivo é o resultado da FASE 1 – AUDITORIA (leitura).*