# TELAS.md - Stitch Screens × Next.js Integration Map (Phase 1 Audit)

Generated during Phase 1 – Audit (read-only).

## Source of truth

- **Product name (per instruction):** `stitch_drvet_veterinary_care_platform` (screen exports use token `drvet`).
- **Brand:** DrVet — paleta: Azul profundo #153B50, Verde veterinário #13A88A, Turquesa #35C6B0, Azul claro #EAF5F8, Fundo #F5F8FA, Branco #FFFFFF, Texto principal #183344, Texto secundário #718096, Sucesso #16A36A, Atenção #F2A93B, Erro #DC4545.
- **Fontes:** Plus Jakarta Sans, Material Symbols Outlined.

## Tabela: Tela do Stitch → Rota Next.js → Perfil → Tabelas Supabase → Ação → Status

### 1. Home / Telemedicina (Público / Tutor / Veterinário)

| Tela (Stitch) | Arquivo origem | Rota Next.js (alvo) | Perfil | Tabelas Supabase usadas | Ação | Status |
|---|---|---|---|---|---|---|
| Home DrVet Telemedicina | `home_drvet_telemedicina_veterin_ria/code.html` | `/` (landing) ou `/home` | Público, Tutor, Veterinário | `profiles`, `veterinarios`, `teleconsultas`, `mensagens`, `audit_logs` | ler / atualizar | falta |
| Home DrVet Telemedicina Desktop 1 | `home_desktop_drvet_telemedicina_veterin_ria_1/code.html` | `/home` | Público, Tutor, Veterinário | `profiles`, `veterinarios`, `teleconsultas` | ler / editar | falta |
| Home DrVet Telemedicina Desktop 2 | `home_desktop_drvet_telemedicina_veterin_ria_2/code.html` | `/home` | Público, Tutor, Veterinário | `profiles`, `veterinarios`, `teleconsultas` | ler / editar | falta |

### 2. Autenticação / Cadastro

| Tela (Stitch) | Arquivo origem | Rota Next.js (alvo) | Perfil | Tabelas Supabase usadas | Ação | Status |
|---|---|---|---|---|---|---|
| Cadastro tutor mobile + QR Code pet shop | `cadastro_do_tutor_mobile_com_qr_code_do_pet_shop_parceiro_drvet/code.html` | `/cadastro` | Tutor | `profiles`, `pets`, `pet_shops`, `tenants` | criar | falta |
| Cadastro e credenciamento parceiros (Pet Shop / Farm) | `cadastro_e_credenciamento_de_empresas_parceiras_drvet/code.html` | `/admin/pet-shop/credenciamento` | Admin Master | `profiles`, `pet_shops`, `tenants` | criar / aprovar | falta |
| Credenciamento veterinários (com split bancário) | `cadastro_e_credenciamento_de_m_dicos_veterin_rios_com_split_dados_banc_rios/code.html` | `/admin/veterinarios/credenciamento` | Admin Master | `profiles`, `veterinarios`, `tenants` | criar / aprovar | falta |

### 3. Agendamento / Agenda

| Tela (Stitch) | Arquivo origem | Rota Next.js (alvo) | Perfil | Tabelas Supabase usadas | Ação | Status |
|---|---|---|---|---|---|---|
| Agendamento Teleconsulta +15% off | `agendamento_da_1_teleconsulta_com_15_off_drvet/code.html` | `/agendamento/:petId` | Tutor, Veterinário | `pets`, `teleconsultas`, `agenda` | criar / atualizar | falta |
| Agendamento Teleconsulta Preventiva | `agendamento_da_1_teleconsulta_preventiva_drvet/code.html` | `/agendamento/:petId` | Tutor, Veterinário | `pets`, `teleconsultas`, `agenda` | criar / editar | falta |
| Agenda completa veterinário semanal mensal | `agenda_completa_do_m_dico_veterin_rio_semanal_mensal_drvet/code.html` | `/agenda` | Veterinário | `agenda`, `consultas`, `teleconsultas` | ler / editar | falta |
| Modal novo agendamento ou bloqueio na agenda | `modal_novo_agendamento_ou_bloqueio_na_agenda_drvet/code.html` | `/agenda/:veterinarioId` | Veterinário | `agenda`, `consultas` | criar / editar | falta |