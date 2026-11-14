# DrVet — Plataforma de Telemedicina Veterinária

Plataforma **DrVet** construída em **Next.js 14 (App Router) + React 18 + TypeScript + Tailwind CSS**, totalmente integrada ao **Supabase** (PostgreSQL, Row Level Security, Auth, Storage e Edge Functions) e pronta para deploy na **Vercel**.

---

## Como rodar localmente

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente do Supabase
cp .env.example .env.local
# Preencha NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY (ou NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)

# 3. Rodar o servidor de desenvolvimento (porta 3000)
npm run dev

# 4. Validar checagem de tipos, lint e build de produção
npm run typecheck
npm run lint
npm run build
```

> Para configurar o projeto Supabase do zero (migrations, seed, Auth, Storage e Edge Functions), siga o passo a passo completo em [`SETUP_SUPABASE.md`](./SETUP_SUPABASE.md).

---

## Variáveis de ambiente (`.env.local` e Vercel)

| Variável | Obrigatória | Descrição |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Sim | URL do projeto Supabase (`https://<ref>.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sim* | Chave pública `anon` do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Opcional* | Chave `publishable` alternativa (se usar o formato novo do Supabase) |

*\* Configure `NEXT_PUBLIC_SUPABASE_ANON_KEY` ou `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. A `service_role` key nunca deve ser exposta no frontend nem cadastrada como `NEXT_PUBLIC_`.*

---

## Estrutura de pastas

```text
├── app/                        # Rotas Next.js App Router (27 páginas + APIs + Auth callback)
│   ├── page.tsx                # Landing pública DrVets (WebP otimizado + triagem interativa)
│   ├── admin/                  # Painel Master Admin, RBAC e /integracoes (restrita a admin)
│   ├── agenda/                 # Agenda semanal do médico-veterinário (protegida por perfil)
│   ├── agendamento/            # Lista e fluxo de novo agendamento (/edit com pré-triagem)
│   ├── anuncios/               # Gestão dedicada de campanhas DrVet Ads
│   ├── apresentacao/           # Apresentação executiva interativa e mapa completo de rotas
│   ├── assinaturas/            # Clube DrVet (assinaturas preventivas)
│   ├── auth/callback/          # Troca de código PKCE do Supabase Auth por sessão
│   ├── cadastro/               # Onboarding QR Code de tutor e cadastro do primeiro pet
│   ├── carteira/vacinas/       # Carteira de vacinação digital
│   ├── comissoes/              # Faturamento, comissões e repasses (protegida por perfil)
│   ├── exames/                 # Pedidos, resultados e upload de laudos (Storage)
│   ├── login/                  # Autenticação, cadastro e recuperação de senha
│   ├── pagamentos/             # Checkout de consultas, cupons e comprovantes
│   ├── painel/                 # Central Operacional CSV/OFX/Contratos, /veterinario e /parceiro
│   ├── parceiros/              # Portal B2B de farmácias/pet shops e DrVet Ads
│   ├── perfil/                 # Dados da conta, perfil RBAC e atalhos do usuário
│   ├── pets/                   # Meus Pets, upload de foto (Storage) e cadastro (/novo)
│   ├── prontuarios/            # Lista, SOAP (/[appointmentId]) e anexos clínicos (Storage)
│   ├── receitas/               # Rascunhos de prescrição veterinária (protegida por perfil)
│   ├── senha/nova/             # Redefinição de senha após recuperação
│   └── teleconsulta/           # Sala de teleconsulta com chat em tempo real (Realtime)
├── src/
│   ├── assets/                 # Metadados e referências de marca/imagens
│   ├── components/             # Componentes reutilizáveis e módulos de tela
│   ├── lib/
│   │   ├── supabase.ts         # Cliente Supabase singleton para a camada de serviços
│   │   ├── supabase/           # Factories SSR/Browser e validação de configuração
│   │   └── validations.ts      # Schemas Zod para validação client-side
│   ├── services/               # Camada de integração real com Supabase (Auth, DB, Storage, Functions)
│   ├── styles/                 # Tokens CSS do design system DrVet
│   └── types/                  # Tipagens TypeScript alinhadas ao schema PostgreSQL
├── supabase/
│   ├── migrations/             # Migrations SQL ordenadas (schema, triggers, RLS, Storage e finanças)
│   ├── functions/              # Edge Functions (request-anticipation e payment-webhook)
│   └── seed.sql                # Massa de dados inicial e contas de teste
├── docs/                       # Documentação de design e auditoria (DESIGN.md, TELAS.md)
├── SETUP_SUPABASE.md           # Guia passo a passo para configurar o Supabase e Vercel
├── HANDOFF_AI_STUDIO.md        # Arquitetura de entidades, rotas e operações
├── vercel.json                 # Configuração de build/deploy na Vercel
└── .env.example                # Modelo das variáveis de ambiente
```
