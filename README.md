# DrVet — Plataforma de Telemedicina Veterinária

Frontend em **Next.js 14 (App Router) + React 18 + TypeScript + Tailwind CSS** para a plataforma de cuidado veterinário **DrVet**, preparado para:
1. Publicação imediata do frontend na **Vercel** (em modo demonstração com dados mock locais).
2. Integração completa de backend, autenticação, banco PostgreSQL, RLS e Storage com **Supabase** no **Google AI Studio**.

---

## Como rodar localmente

```bash
# 1. Instalar dependências
npm install

# 2. (Opcional) Copiar variáveis de ambiente para conectar ao Supabase
cp .env.example .env.local

# 3. Rodar servidor de desenvolvimento (porta 3000)
npm run dev

# 4. Validar checagem de tipos, lint e build de produção
npm run typecheck
npm run lint
npm run build
```

Sem `.env.local` configurado, o frontend opera automaticamente em **modo demonstração** usando os dados mock locais em `src/services/`.

---

## Estrutura de pastas

```text
├── app/                        # Rotas Next.js App Router (páginas e layouts)
│   ├── agenda/                 # Agenda semanal do médico-veterinário
│   ├── agendamento/            # Lista e fluxo de novo agendamento (/edit)
│   ├── carteira/vacinas/       # Carteira de vacinação digital
│   ├── comissoes/              # Faturamento, comissões e repasses
│   ├── exames/                 # Pedidos e resultados de exames
│   ├── login/                  # Autenticação, cadastro e recuperação de senha
│   ├── prontuarios/            # Lista e edição de prontuário SOAP (/[appointmentId])
│   ├── receitas/               # Rascunhos de prescrição veterinária
│   └── senha/nova/             # Redefinição de senha
├── src/
│   ├── assets/                 # Metadados e referências de marca/imagens
│   ├── components/             # Componentes reutilizáveis e módulos de tela
│   ├── lib/
│   │   ├── supabase.ts         # Cliente Supabase preparado para o AI Studio
│   │   ├── supabase/           # Factories SSR/Browser e config de ambiente
│   │   └── validations.ts      # Schemas Zod para validação client-side
│   ├── services/               # Camada de serviços (atualmente mock local com TODOs)
│   ├── styles/                 # Tokens CSS do design system DrVet
│   └── types/                  # Tipagens TypeScript de entidades e banco
├── docs/                       # Documentação de referência e design (DESIGN.md, TELAS.md)
├── public/                     # Assets estáticos servidos pelo Next.js
├── supabase/                   # README e rascunhos de migrations SQL para o AI Studio
├── HANDOFF_AI_STUDIO.md        # Guia completo de handoff para backend Supabase
├── vercel.json                 # Configuração de deploy na Vercel
└── .env.example                # Variáveis de ambiente necessárias
```
