# Configuração de Variáveis de Ambiente — DrVet

Este documento lista todas as variáveis necessárias para rodar o projeto localmente e em produção.

---

## 📋 Variáveis Obrigatórias

| Variável | Descrição | Onde obter |
|----------|-----------|------------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase (ex: `https://xyz.supabase.co`) | Supabase Dashboard → Settings → API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Chave pública (anon key) do Supabase | Supabase Dashboard → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | **SECRETA** — Chave de serviço (server-only) para operações admin | Supabase Dashboard → Settings → API → `service_role` |

> ⚠️ **NUNCA** commite `SUPABASE_SERVICE_ROLE_KEY` no repositório. Use apenas no servidor (ex: Vercel Environment Variables, `.env.local` apenas local).

---

## 🔐 Variáveis de Autenticação (OAuth / Email)

| Variável | Descrição | Onde obter |
|----------|-----------|------------|
| `NEXT_PUBLIC_SITE_URL` | URL base do site (ex: `http://localhost:3000` ou `https://drvet.com.br`) | Configuração local/produção |
| `EMAIL_RESEND_API_KEY` | Chave da API Resend para envio de e-mails transacionais | Resend.com → API Keys |
| `EMAIL_FROM` | Endereço remetente verificado no Resend (ex: `noreply@drvet.com.br`) | Resend → Domains |

---

## 💳 Variáveis de Pagamento (Asaas / Mercado Pago)

| Variável | Descrição | Onde obter |
|----------|-----------|------------|
| `ASAAS_API_KEY` | Chave da API Asaas (produção ou sandbox) | Asaas → Minha Conta → API |
| `ASAAS_WEBHOOK_SECRET` | Secret para validar webhooks Asaas | Asaas → Configurações → Webhooks |
| `MERCADO_PAGO_ACCESS_TOKEN` | Access token do Mercado Pago | Mercado Pago Developers → Suas integrações |
| `MERCADO_PAGO_WEBHOOK_SECRET` | Secret para webhooks MP | Mercado Pago → Configurações de notificação |

---

## 🎥 Variáveis de Teleconsulta (LiveKit)

| Variável | Descrição | Onde obter |
|----------|-----------|------------|
| `LIVEKIT_API_KEY` | API Key do LiveKit Cloud | LiveKit Cloud → Settings → API Keys |
| `LIVEKIT_API_SECRET` | **SECRETA** — API Secret do LiveKit | LiveKit Cloud → Settings → API Keys |
| `NEXT_PUBLIC_LIVEKIT_URL` | URL do servidor LiveKit (ex: `wss://drvet.livekit.cloud`) | LiveKit Cloud → Settings |

---

## 📦 Exemplo de `.env.local` (desenvolvimento)

```bash
# Supabase (obrigatório)
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Site URL (obrigatório para redirect OAuth)
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# E-mail (opcional em dev, obrigatório em prod)
EMAIL_RESEND_API_KEY=re_...
EMAIL_FROM=noreply@localhost

# Pagamento (opcional em dev)
ASAAS_API_KEY=...
ASAAS_WEBHOOK_SECRET=...
MERCADO_PAGO_ACCESS_TOKEN=...
MERCADO_PAGO_WEBHOOK_SECRET=...

# Teleconsulta (opcional em dev)
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
NEXT_PUBLIC_LIVEKIT_URL=wss://...
```

---

## ✅ Checklist de Configuração no Supabase Dashboard

1. **Authentication → URL Configuration**
   - Site URL: `http://localhost:3000` (dev) / `https://drvet.com.br` (prod)
   - Redirect URLs: adicione `http://localhost:3000/auth/callback` e `http://localhost:3000/api/auth/callback`
   - Email templates: personalize "Confirm signup", "Reset password"

2. **Authentication → Providers**
   - Habilite providers desejados (Email, Google, Apple, etc.)

3. **Database → Migrations**
   - Execute as 6 migrations em `supabase/migrations/` em ordem cronológica

4. **Storage**
   - Crie bucket `clinical-attachments` (privado) para laudos/imagens
   - Crie bucket `avatars` (público) para fotos de perfil

5. **Realtime**
   - Habilite Realtime nas tabelas: `appointments`, `professional_availability`, `clinical_records`, `exam_orders`, `vaccination_records`, `prescription_drafts`

6. **Edge Functions (opcional)**
   - Deploy functions para webhooks Asaas/MP, geração de PDF receita, etc.

---

## 🚀 Deploy na Vercel

1. Conecte o repositório GitHub na Vercel
2. Em **Settings → Environment Variables**, adicione todas as variáveis acima
3. **NÃO** marque `SUPABASE_SERVICE_ROLE_KEY`, `ASAAS_API_KEY`, `LIVEKIT_API_SECRET`, `EMAIL_RESEND_API_KEY` como "Preview" — apenas Production
4. Configure `NEXT_PUBLIC_SITE_URL` com a URL de produção da Vercel
5. Atualize Redirect URLs no Supabase Auth com a URL de produção

---

## 🔒 Segurança

- **NUNCA** exponha `SUPABASE_SERVICE_ROLE_KEY`, `ASAAS_API_KEY`, `LIVEKIT_API_SECRET`, `EMAIL_RESEND_API_KEY`, `MERCADO_PAGO_ACCESS_TOKEN` no frontend (sem prefixo `NEXT_PUBLIC_`).
- Use `NEXT_PUBLIC_` apenas para variáveis que **precisam** estar no bundle do navegador.
- Rotacione chaves periodicamente.
- Revogue chaves comprometidas imediatamente.