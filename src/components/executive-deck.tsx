'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge, Button, Card, PageHeader } from '@/components/ui';

interface Slide {
  id: number;
  tag: string;
  title: string;
  subtitle: string;
  bullets: string[];
  metrics: Array<{ label: string; value: string }>;
  ctaHref: string;
  ctaLabel: string;
}

const slides: Slide[] = [
  {
    id: 1,
    tag: 'Visão Executiva • DrVets 2026',
    title: 'Ecossistema Completo de Telemedicina Veterinária 24h',
    subtitle:
      'Conectando tutores, médicos-veterinários com CRMV verificado e Pet Shops/Farmácias em uma única plataforma Supabase + Next.js.',
    bullets: [
      'Pronto atendimento por vídeo criptografado e triagem guiada em segundos.',
      'Prontuário SOAP estruturado, carteira digital de vacinas e pedidos de exames.',
      'Monetização B2C (Clube DrVet + Consultas) e B2B (Pet Shops Parceiros + DrVet Ads).',
    ],
    metrics: [
      { label: 'Disponibilidade clínica', value: '24/7' },
      { label: 'Conformidade legal', value: 'CFMV 1.465/2022' },
      { label: 'Isolamento de dados', value: 'RLS + LGPD' },
    ],
    ctaHref: '/',
    ctaLabel: 'Abrir Landing Pública',
  },
  {
    id: 2,
    tag: 'Jornada do Tutor & Paciente',
    title: 'Da Triagem na Home até a Receita Digital no Celular',
    subtitle:
      'Experiência fluida desenhada para reduzir o estresse do pet no transporte e acelerar o cuidado clínico.',
    bullets: [
      'Onboarding via QR Code (/cadastro) com vínculo automático de cupom do Pet Shop parceiro.',
      'Gestão completa de pacientes em /pets com upload seguro em bucket privado pet-avatars.',
      'Agendamento inteligente (/agendamento/edit) ligado diretamente às janelas publicadas.',
    ],
    metrics: [
      { label: 'Carteira preventiva', value: 'Vacinas & Exames' },
      { label: 'Assinaturas recorrentes', value: 'Clube DrVet' },
      { label: 'Checkout integrado', value: 'PIX / Cartão / Voucher' },
    ],
    ctaHref: '/agendamento/edit',
    ctaLabel: 'Testar fluxo de agendamento',
  },
  {
    id: 3,
    tag: 'Empoderamento Médico-Veterinário',
    title: 'Consultório Virtual com Segurança Jurídica e Agenda Sob Controle',
    subtitle:
      'Ferramentas pensadas para o dia a dia do veterinário clinicar de qualquer lugar com autonomia de agenda e honorários.',
    bullets: [
      'Grade semanal com bloqueio e publicação instantânea (/agenda).',
      'Sala de teleconsulta ao vivo (/teleconsulta) sincronizada via Supabase Realtime.',
      'Prontuário SOAP imutável após finalização e rascunhos de receita (/prontuarios e /receitas).',
    ],
    metrics: [
      { label: 'Auditoria profissional', value: 'CRMV Regional' },
      { label: 'Sinais vitais', value: 'Peso, T°, FC, FR, TPC' },
      { label: 'Repasses financeiros', value: 'D+1 & Antecipação' },
    ],
    ctaHref: '/painel/veterinario',
    ctaLabel: 'Abrir Painel Veterinário',
  },
  {
    id: 4,
    tag: 'Motor de Crescimento B2B',
    title: 'Pet Shops Parceiros, Farmácias e DrVet Ads',
    subtitle:
      'Transformando lojas físicas em hubs de saúde animal com receita recorrente e mídia contextual ética.',
    bullets: [
      'Credenciamento rápido (/parceiros) com geração automática de link QR promocional.',
      'Divisão transparente de repasses entre consulta, clínica e farmácia dispensadora.',
      'Rede DrVet Ads (/anuncios) com métricas de orçamento, posicionamento e cliques reais.',
    ],
    metrics: [
      { label: 'Canal de aquisição', value: 'QR Code no Balcão' },
      { label: 'Portal comercial', value: '/painel/parceiro' },
      { label: 'Conciliação ERP', value: 'CSV & OFX + Bling/Omie' },
    ],
    ctaHref: '/painel/parceiro',
    ctaLabel: 'Ver Painel Parceiro B2B',
  },
  {
    id: 5,
    tag: 'Arquitetura & Governança Master',
    title: 'Infraestrutura Escalável no Supabase com RBAC e Integrações',
    subtitle:
      'Banco PostgreSQL com políticas granulares por papel, auditoria administrativa e integrações configuráveis.',
    bullets: [
      'Autenticação Supabase SSR com middleware de proteção por papel (tutor, vet, partner, admin).',
      'Assistente de integrações (/admin/integracoes) para Asaas, Mercado Pago, LiveKit, Bling e Omie.',
      'Exportação contábil direta e repositório de contratos digitais em /painel.',
    ],
    metrics: [
      { label: 'Painel Admin Master', value: '/admin' },
      { label: 'Health Check SQL & CDC', value: 'Realtime WebSockets' },
      { label: 'Exportação bancária', value: 'CSV / OFX 1.02' },
    ],
    ctaHref: '/admin/integracoes',
    ctaLabel: 'Abrir Integrações Master',
  },
];

const routeDirectory = [
  { href: '/', label: 'Home Pública' },
  { href: '/cadastro', label: 'Cadastro QR' },
  { href: '/pets', label: 'Meus Pets' },
  { href: '/agendamento/edit', label: 'Novo Agendamento' },
  { href: '/teleconsulta', label: 'Sala Teleconsulta' },
  { href: '/agenda', label: 'Agenda Médica' },
  { href: '/painel/veterinario', label: 'Painel Veterinário' },
  { href: '/prontuarios', label: 'Prontuários SOAP' },
  { href: '/receitas', label: 'Receitas' },
  { href: '/exames', label: 'Exames' },
  { href: '/carteira/vacinas', label: 'Vacinas' },
  { href: '/assinaturas', label: 'Clube DrVet' },
  { href: '/pagamentos', label: 'Checkout' },
  { href: '/parceiros', label: 'Parceiros B2B' },
  { href: '/painel/parceiro', label: 'Painel Parceiro' },
  { href: '/anuncios', label: 'DrVet Ads' },
  { href: '/comissoes', label: 'Repasses' },
  { href: '/painel', label: 'Central & OFX' },
  { href: '/admin', label: 'Admin Master' },
  { href: '/admin/integracoes', label: 'Integrações' },
];

export function ExecutiveDeck() {
  const [index, setIndex] = useState(0);
  const current = slides[index] ?? slides[0];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        action={
          <div className="flex items-center gap-2">
            <Button
              disabled={index === 0}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              type="button"
              variant="outline"
            >
              ← Anterior
            </Button>
            <Button
              disabled={index === slides.length - 1}
              onClick={() => setIndex((i) => Math.min(slides.length - 1, i + 1))}
              type="button"
              variant="secondary"
            >
              Próximo slide →
            </Button>
          </div>
        }
        description="Apresentação executiva interativa cobrindo arquitetura, jornada clínica, modelo B2B e mapa navegável de rotas."
        title="Apresentação Executiva DrVet"
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {slides.map((slide, idx) => (
          <button
            className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
              idx === index
                ? 'bg-brand-navy text-white shadow-sm'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-brand-ice'
            }`}
            key={slide.id}
            onClick={() => setIndex(idx)}
            type="button"
          >
            Slide 0{slide.id}
          </button>
        ))}
      </div>

      <section className="rounded-3xl border border-slate-800 bg-gradient-to-br from-[#0C2D48] via-[#153B50] to-[#0A2333] p-7 text-white shadow-xl sm:p-10">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge className="bg-emerald-500/20 text-emerald-300" variant="info">
            {current.tag}
          </Badge>
          <span className="text-xs font-bold text-slate-300">
            {index + 1} / {slides.length}
          </span>
        </div>

        <h2 className="mt-4 text-2xl font-extrabold leading-tight sm:text-4xl">{current.title}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-300 sm:text-base">
          {current.subtitle}
        </p>

        <ul className="mt-6 grid gap-3">
          {current.bullets.map((item) => (
            <li
              className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100"
              key={item}
            >
              <span className="font-bold text-[#32D77D]">✓</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {current.metrics.map((metric) => (
            <div
              className="rounded-2xl border border-white/10 bg-white/10 p-4"
              key={metric.label}
            >
              <p className="text-[11px] font-bold uppercase tracking-wider text-cyan-300">
                {metric.label}
              </p>
              <p className="mt-1 text-lg font-extrabold text-white">{metric.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-5">
          <span className="text-xs text-slate-300">
            Navegue para o módulo real desta etapa da apresentação:
          </span>
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-brand-green px-6 text-sm font-bold text-white hover:bg-[#0f8a72]"
            href={current.ctaHref}
          >
            {current.ctaLabel} →
          </Link>
        </div>
      </section>

      <div className="mt-6">
        <Card
          description="Acesso direto a todos os módulos implementados no aplicativo Next.js."
          title="Mapa Completo de Rotas DrVet"
        >
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-5">
            {routeDirectory.map((route) => (
              <Link
                className="rounded-xl border border-slate-200 bg-[#F9FBFC] px-3 py-2.5 text-xs font-bold text-brand-navy transition hover:border-brand-green hover:bg-brand-ice"
                href={route.href}
                key={route.href}
              >
                <span className="block truncate">{route.label}</span>
                <span className="mt-0.5 block font-mono text-[10px] font-normal text-slate-500">
                  {route.href}
                </span>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
