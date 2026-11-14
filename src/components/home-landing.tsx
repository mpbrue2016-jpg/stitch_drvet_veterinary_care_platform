'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent } from 'react';

interface Specialist {
  name: string;
  crmv: string;
  statusLabel: string;
  isOnline: boolean;
  rating: string;
  reviews: number;
  tags: Array<{ label: string; tone: string }>;
  bio: string;
  priceLabel: string;
  price: string;
  ctaLabel: string;
  ctaPrimary: boolean;
  avatarSrc: string;
  borderTone: string;
}

const specialists: Specialist[] = [
  {
    name: 'Dra. Juliana Mendes',
    crmv: 'CRMV-SP 42.189 • Clínica Geral',
    statusLabel: 'Plantão Online Agora',
    isOnline: true,
    rating: '4.9',
    reviews: 342,
    tags: [
      { label: 'Pronto Atendimento', tone: 'bg-slate-100 text-slate-700' },
      { label: 'Cães e Gatos', tone: 'bg-slate-100 text-slate-700' },
      { label: 'Triagem Aguda', tone: 'bg-blue-50 text-blue-700' },
    ],
    bio: 'Especialista em pronto socorro e diagnósticos rápidos de vômitos, tosse, indisposição e ingestão acidental.',
    priceLabel: 'Consulta Online',
    price: 'R$ 89,90',
    ctaLabel: 'Consultar Agora',
    ctaPrimary: true,
    avatarSrc: '/home/vet-juliana.webp',
    borderTone: 'border-emerald-400',
  },
  {
    name: 'Dr. Ricardo Antunes',
    crmv: 'CRMV-RJ 28.940 • Dermatologia',
    statusLabel: 'Próximo às 14:30',
    isOnline: false,
    rating: '5.0',
    reviews: 518,
    tags: [
      { label: 'Dermatite Atópica', tone: 'bg-amber-50 text-amber-800' },
      { label: 'Alergias & Coceira', tone: 'bg-slate-100 text-slate-700' },
      { label: 'Otites Crônicas', tone: 'bg-slate-100 text-slate-700' },
    ],
    bio: 'Mestre em Dermatologia Comparada pela USP. Diagnóstico de infecções fúngicas, queda de pelo e citologia prévia.',
    priceLabel: 'Especialidade',
    price: 'R$ 139,00',
    ctaLabel: 'Ver Agenda',
    ctaPrimary: false,
    avatarSrc: '/home/vet-ricardo.webp',
    borderTone: 'border-blue-400',
  },
  {
    name: 'Dra. Letícia Carvalho',
    crmv: 'CRMV-MG 31.752 • Medicina Felina',
    statusLabel: 'Online Agora',
    isOnline: true,
    rating: '4.9',
    reviews: 274,
    tags: [
      { label: 'Cat Friendly Certified', tone: 'bg-purple-50 text-purple-800' },
      { label: 'Renal Felino', tone: 'bg-slate-100 text-slate-700' },
      { label: 'FIV / FeLV', tone: 'bg-slate-100 text-slate-700' },
    ],
    bio: 'Atendimento sem estresse para gatos que odeiam sair de casa. Manejo comportamental e doenças do trato urinário.',
    priceLabel: 'Especialidade Felina',
    price: 'R$ 139,00',
    ctaLabel: 'Consultar Agora',
    ctaPrimary: true,
    avatarSrc: '/home/vet-leticia.webp',
    borderTone: 'border-purple-400',
  },
  {
    name: 'Dr. Marcos Vinicius',
    crmv: 'CRMV-PR 19.804 • Nutrologia Animal',
    statusLabel: 'Próximo às 16:00',
    isOnline: false,
    rating: '4.9',
    reviews: 195,
    tags: [
      { label: 'Alimentação Natural', tone: 'bg-green-50 text-green-800' },
      { label: 'Controle de Peso', tone: 'bg-slate-100 text-slate-700' },
      { label: 'Suplementação', tone: 'bg-slate-100 text-slate-700' },
    ],
    bio: 'Prescrição de dietas personalizadas para pets obesos, com sensibilidade alimentar ou idosos com cardiopatia.',
    priceLabel: 'Consulta Nutrológica',
    price: 'R$ 159,00',
    ctaLabel: 'Ver Agenda',
    ctaPrimary: false,
    avatarSrc: '/home/vet-marcos.webp',
    borderTone: 'border-emerald-400',
  },
  {
    name: 'Dra. Beatriz Fontana',
    crmv: 'CRMV-RS 22.451 • Cardiologia',
    statusLabel: 'Online Agora',
    isOnline: true,
    rating: '5.0',
    reviews: 403,
    tags: [
      { label: 'Tosse Cardíaca', tone: 'bg-rose-50 text-rose-800' },
      { label: 'Pets Idosos', tone: 'bg-slate-100 text-slate-700' },
      { label: 'Ajuste de Doses', tone: 'bg-slate-100 text-slate-700' },
    ],
    bio: 'Monitoramento de sopros, arritmias e orientação imediata para animais que cansam rápido em passeios.',
    priceLabel: 'Consulta Cardiológica',
    price: 'R$ 165,00',
    ctaLabel: 'Consultar Agora',
    ctaPrimary: true,
    avatarSrc: '/home/vet-beatriz.webp',
    borderTone: 'border-rose-400',
  },
  {
    name: 'Dr. Fernando Neves',
    crmv: 'CRMV-SC 14.309 • Comportamento',
    statusLabel: 'Hoje às 17:30',
    isOnline: false,
    rating: '4.8',
    reviews: 182,
    tags: [
      { label: 'Ansiedade Separação', tone: 'bg-indigo-50 text-indigo-800' },
      { label: 'Medo de Barulhos', tone: 'bg-slate-100 text-slate-700' },
      { label: 'Agressividade Leve', tone: 'bg-slate-100 text-slate-700' },
    ],
    bio: 'Terapia comportamental positiva com análise do ambiente residencial em vídeo para resolução de hábitos destrutivos.',
    priceLabel: 'Consulta Comportamental',
    price: 'R$ 149,00',
    ctaLabel: 'Ver Agenda',
    ctaPrimary: false,
    avatarSrc: '/home/vet-fernando.webp',
    borderTone: 'border-indigo-400',
  },
];

const testimonials = [
  {
    quote:
      '"Meu cachorro Pipoca começou a tossir e se engasgar tarde da noite de domingo. Em menos de 7 minutos eu estava em chamada com a Dra. Mariana. Ela me acalmou, identificou o quadro alérgico e mandou a receita pro meu celular. Salvou nossa noite!"',
    author: 'Rodrigo F. & Pipoca (Spitz)',
    location: 'São Paulo, SP • Atendimento Plantão',
    avatarSrc: '/home/tutor-rodrigo.webp',
  },
  {
    quote:
      '"Levar minha gata Mia ao veterinário sempre foi um trauma gigante: ela hiperventilava no carro. A teleconsulta da DrVets foi a melhor descoberta. O veterinário observou ela calma no sofá e resolveu o problema de pele com extrema delicadeza."',
    author: 'Beatriz M. & Mia (Persa)',
    location: 'Curitiba, PR • Medicina Felina',
    avatarSrc: '/home/tutor-beatriz.webp',
  },
  {
    quote:
      '"Sou médico humano e sei avaliar seriedade clínica. A plataforma DrVets é impecável: anamnese aprofundada, prontuário detalhado e prescrição digital aceita sem nenhum questionamento na drogaria."',
    author: 'Dr. Gustavo A. & Bob (Golden)',
    location: 'Belo Horizonte, MG • Nutrologia',
    avatarSrc: '/home/tutor-gustavo.webp',
  },
];

function VideoCamIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.9"
      viewBox="0 0 24 24"
    >
      <rect height="12" rx="2" width="14" x="2" y="6" />
      <path d="M16 10l6-3v10l-6-3z" />
    </svg>
  );
}

export function HomeLanding() {
  const router = useRouter();
  const [species, setSpecies] = useState('dog');
  const [need, setNeed] = useState('geral');
  const [timing, setTiming] = useState('now');
  const [filterOnlineOnly, setFilterOnlineOnly] = useState(false);

  const visibleSpecialists = filterOnlineOnly
    ? specialists.filter((doc) => doc.isOnline)
    : specialists;

  function handleTriageSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams({ species, need, timing });
    router.push(`/agendamento/edit?${params.toString()}`);
  }

  return (
    <div className="bg-[#F5F8FA] text-slate-800 antialiased selection:bg-[#13A88A] selection:text-white">
      {/* BEGIN: BillboardHeroSection */}
      <section
        className="relative overflow-hidden bg-gradient-to-b from-[#EDF5F9] via-white to-[#F5F8FA] pb-14 pt-6 lg:py-16"
        id="inicio"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-[#25C5DC]/15 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-0 top-1/2 h-[550px] w-[550px] rounded-full bg-[#00B298]/15 blur-3xl"
        />
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_12px_35px_-8px_rgba(15,60,90,0.08),0_4px_12px_-2px_rgba(15,60,90,0.04)] sm:p-10 lg:rounded-[36px] lg:p-12">
            <div className="absolute bottom-0 left-0 right-0 h-3.5 bg-gradient-to-r from-[#0B68C2] via-[#00B298] to-[#32D77D]" />
            <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12 lg:gap-12">
              <div className="z-10 flex flex-col justify-center space-y-6 lg:col-span-7">
                <div className="w-fit">
                  <Image
                    alt="DrVets Tele Veterinária"
                    className="h-12 w-auto object-contain drop-shadow-sm sm:h-14 md:h-16"
                    height={240}
                    priority
                    quality={95}
                    referrerPolicy="no-referrer"
                    sizes="280px"
                    src="/home/drvets-logo.webp"
                    width={360}
                  />
                </div>
                <div className="space-y-3">
                  <h1 className="text-3xl font-extrabold leading-[1.14] tracking-tight text-[#153B50] sm:text-4xl md:text-5xl lg:text-[50px]">
                    Cuidado veterinário,
                    <br />
                    <span className="bg-gradient-to-r from-[#0C8974] via-[#13A88A] to-[#25B899] bg-clip-text text-transparent">
                      onde seu pet estiver.
                    </span>
                  </h1>
                  <p className="max-w-xl text-base font-normal leading-relaxed text-slate-600 sm:text-lg">
                    Converse por vídeo com veterinários selecionados, receba orientações e cuide de quem faz parte da sua família no conforto de casa.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-4 pt-1">
                  <a
                    className="group inline-flex items-center gap-3 rounded-full bg-[linear-gradient(92deg,#0A63BA_0%,#0690B4_45%,#0EB485_100%)] px-7 py-3.5 text-base font-bold text-white shadow-[0_15px_35px_-5px_rgba(19,168,138,0.35)] transition-all duration-200 hover:scale-[1.02] hover:bg-[linear-gradient(92deg,#0855A0_0%,#057E9E_45%,#0B9C73_100%)] active:scale-[0.98] sm:text-lg"
                    href="#triage-box"
                  >
                    <span className="flex items-center justify-center rounded-lg bg-white/20 p-1.5">
                      <VideoCamIcon className="h-5 w-5 text-white" />
                    </span>
                    <span>Encontrar veterinário agora</span>
                    <span
                      aria-hidden="true"
                      className="ml-0.5 text-xl font-bold transition-transform group-hover:translate-x-1"
                    >
                      →
                    </span>
                  </a>
                  <div className="flex items-center gap-3 rounded-2xl border border-emerald-200/80 bg-emerald-50/70 px-4 py-2.5">
                    <span className="relative flex h-3 w-3">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
                    </span>
                    <div className="text-xs">
                      <p className="font-bold text-slate-800">Tempo de espera atual</p>
                      <p className="font-semibold text-emerald-700">Médio de ~8 min hoje</p>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-3">
                  <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Navegação rápida do tutor
                  </p>
                  <div className="grid max-w-md grid-cols-4 gap-1.5 rounded-2xl border border-slate-200/70 bg-slate-50/90 p-1.5 text-center">
                    <a
                      className="flex flex-col items-center justify-center rounded-xl border border-emerald-100 bg-white px-1 py-2 shadow-sm transition"
                      href="#inicio"
                    >
                      <svg
                        aria-hidden="true"
                        className="h-5 w-5 text-[#0B68C2]"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M12 3l9 7.5V20a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1v-9.5L12 3z" />
                      </svg>
                      <span className="mt-0.5 text-[11px] font-bold text-[#0C2D48]">Início</span>
                      <div className="mt-0.5 h-0.5 w-4 rounded-full bg-emerald-500" />
                    </a>
                    <Link
                      className="flex flex-col items-center justify-center rounded-xl px-1 py-2 text-slate-600 transition hover:bg-white/80 hover:text-[#0B68C2]"
                      href="/agendamento"
                    >
                      <svg
                        aria-hidden="true"
                        className="h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.8"
                        viewBox="0 0 24 24"
                      >
                        <rect height="16" rx="2" width="18" x="3" y="4" />
                        <path d="M16 2v4M8 2v4M3 10h18" />
                      </svg>
                      <span className="mt-0.5 text-[11px] font-semibold">Consultas</span>
                    </Link>
                    <Link
                      className="flex flex-col items-center justify-center rounded-xl px-1 py-2 text-slate-600 transition hover:bg-white/80 hover:text-[#0B68C2]"
                      href="/pets"
                    >
                      <svg
                        aria-hidden="true"
                        className="h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.8"
                        viewBox="0 0 24 24"
                      >
                        <circle cx="5" cy="9" r="1.8" />
                        <circle cx="10" cy="5.5" r="1.8" />
                        <circle cx="15" cy="5.5" r="1.8" />
                        <circle cx="19" cy="9" r="1.8" />
                        <path d="M12 11c-3 0-5.5 2-5.5 5 0 2 1.5 3 3 3 1.2 0 2-.7 2.5-.7s1.3.7 2.5.7c1.5 0 3-1 3-3 0-3-2.5-5-5.5-5z" />
                      </svg>
                      <span className="mt-0.5 text-[11px] font-semibold">Meus Pets</span>
                    </Link>
                    <Link
                      className="flex flex-col items-center justify-center rounded-xl px-1 py-2 text-slate-600 transition hover:bg-white/80 hover:text-[#0B68C2]"
                      href="/perfil"
                    >
                      <svg
                        aria-hidden="true"
                        className="h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.8"
                        viewBox="0 0 24 24"
                      >
                        <path d="M20 21a8 8 0 10-16 0" />
                        <circle cx="12" cy="8" r="4" />
                      </svg>
                      <span className="mt-0.5 text-[11px] font-semibold">Perfil</span>
                    </Link>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="inline-flex items-center gap-2 rounded-full bg-[#00A868] px-4 py-2 text-xs font-medium text-white shadow-sm sm:text-sm">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full border-2 border-white text-[10px] font-extrabold">
                      ✓
                    </span>
                    <span className="font-bold tracking-wide">
                      Profissionais com CRMV verificado
                    </span>
                  </div>
                  <span className="hidden text-xs text-slate-500 sm:inline">
                    Atendimento humanizado e ético
                  </span>
                </div>
              </div>

              <div className="relative lg:col-span-5">
                <div className="group relative mx-auto overflow-hidden rounded-3xl border-4 border-[#153B50] shadow-2xl">
                  <Image
                    alt="Campanha Oficial DrVets - Dra. Camila e Golden Retriever"
                    className="h-[360px] w-full object-cover transition duration-500 group-hover:scale-[1.02] sm:h-[420px]"
                    height={1024}
                    priority
                    quality={95}
                    referrerPolicy="no-referrer"
                    sizes="(max-width: 1024px) 100vw, 560px"
                    src="/home/hero-campanha.webp"
                    width={1536}
                  />
                  <div className="absolute bottom-3 right-3 rounded-xl border border-white/20 bg-[#153B50]/90 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur-md">
                    Campanha Oficial DrVets
                  </div>
                </div>

                <div className="absolute -right-3 -top-5 max-w-[170px] rotate-3 transform rounded-2xl border-2 border-white bg-gradient-to-br from-[#0EA57A] to-[#047E59] p-3.5 text-center text-white shadow-xl transition duration-300 hover:rotate-0 sm:-right-5">
                  <svg
                    aria-hidden="true"
                    className="mx-auto mb-0.5 h-6 w-6 fill-white"
                    viewBox="0 0 24 24"
                  >
                    <circle cx="5" cy="9" r="2.1" />
                    <circle cx="10" cy="5.5" r="2.1" />
                    <circle cx="15" cy="5.5" r="2.1" />
                    <circle cx="19" cy="9" r="2.1" />
                    <path d="M12 11c-3.1 0-5.5 2-5.5 5 0 2 1.5 3.2 3 3.2 1.2 0 2-.7 2.5-.7s1.3.7 2.5.7c1.5 0 3-1.2 3-3.2 0-3-2.4-5-5.5-5z" />
                  </svg>
                  <p
                    className="text-lg font-bold leading-tight"
                    style={{ fontFamily: 'var(--font-caveat), cursive' }}
                  >
                    Mais saúde e bem-estar para seu pet!
                  </p>
                </div>

                <div className="absolute -bottom-4 left-4 flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-lg">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-xs font-extrabold text-emerald-700">
                    ★ 5.0
                  </div>
                  <div className="text-xs">
                    <p className="font-bold text-slate-800">Dra. Camila &amp; Theo</p>
                    <p className="text-[11px] text-slate-500">
                      &ldquo;Consulta remota rápida e precisa!&rdquo;
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BEGIN: FastTriageWidget */}
      <section className="relative z-20 mx-auto -mt-6 max-w-6xl px-4 sm:px-6" id="triage-box">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xl sm:p-7">
          <div className="mb-4 flex flex-col justify-between gap-2 border-b border-slate-100 pb-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold text-[#153B50]">
                <span className="h-2.5 w-2.5 rounded-full bg-[#00B298]" />
                Iniciar Triagem Rápida ou Agendar Consulta
              </h2>
              <p className="text-xs text-slate-500 sm:text-sm">
                Conectamos você ao veterinário disponível mais indicado em segundos
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 sm:self-auto">
              ⚡ Plantão com resposta imediata
            </span>
          </div>

          <form
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
            onSubmit={handleTriageSubmit}
          >
            <div>
              <label
                className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600"
                htmlFor="triage-species"
              >
                1. Qual é o seu pet?
              </label>
              <select
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-[#00B298] focus:ring-2 focus:ring-[#00B298]"
                id="triage-species"
                onChange={(e) => setSpecies(e.target.value)}
                value={species}
              >
                <option value="dog">Cachorro (Cão)</option>
                <option value="cat">Gato (Felino)</option>
                <option value="bird">Pássaro / Silvestre</option>
                <option value="exotic">Coelho / Roedor</option>
              </select>
            </div>
            <div>
              <label
                className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600"
                htmlFor="triage-need"
              >
                2. O que ele precisa?
              </label>
              <select
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-[#00B298] focus:ring-2 focus:ring-[#00B298]"
                id="triage-need"
                onChange={(e) => setNeed(e.target.value)}
                value={need}
              >
                <option value="geral">Pronto Atendimento / Sintomas Gerais</option>
                <option value="derma">Dermatologia &amp; Coceira / Alergias</option>
                <option value="nutri">Nutrologia &amp; Dieta Personalizada</option>
                <option value="comportamento">Ansiedade &amp; Comportamento Pet</option>
                <option value="cardio">Cardiologia &amp; Exames</option>
                <option value="receita">Renovação de Receita / Exames</option>
              </select>
            </div>
            <div>
              <label
                className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600"
                htmlFor="triage-when"
              >
                3. Quando prefere?
              </label>
              <select
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-[#00B298] focus:ring-2 focus:ring-[#00B298]"
                id="triage-when"
                onChange={(e) => setTiming(e.target.value)}
                value={timing}
              >
                <option value="now">Plantão Imediato (Agora)</option>
                <option value="today">Hoje no próximo horário</option>
                <option value="tomorrow">Amanhã com especialista</option>
                <option value="schedule">Escolher data na agenda</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(92deg,#0A63BA_0%,#0690B4_45%,#0EB485_100%)] px-4 py-3 text-sm font-bold text-white shadow-md transition duration-200 hover:opacity-95 sm:text-base"
                type="submit"
              >
                <svg
                  aria-hidden="true"
                  className="h-[18px] w-[18px]"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
                <span>Conectar Agora</span>
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* BEGIN: TrustStatsStrip */}
      <section className="mt-14 border-y border-[#00B298]/20 bg-[#153B50] py-12 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-8 divide-y divide-white/10 text-center lg:grid-cols-4 lg:divide-x lg:divide-y-0">
            <div className="pt-4 lg:pt-0">
              <p className="bg-gradient-to-r from-[#25C5DC] to-[#32D77D] bg-clip-text text-3xl font-extrabold text-transparent sm:text-4xl">
                +18.500
              </p>
              <p className="mt-1 text-sm font-medium text-slate-300">Teleconsultas Realizadas</p>
              <span className="text-xs font-semibold text-[#00B298]">Em todo o Brasil</span>
            </div>
            <div className="pt-4 lg:pt-0">
              <p className="bg-gradient-to-r from-[#25C5DC] to-[#32D77D] bg-clip-text text-3xl font-extrabold text-transparent sm:text-4xl">
                99.4%
              </p>
              <p className="mt-1 text-sm font-medium text-slate-300">Satisfação dos Tutores</p>
              <span className="text-xs font-semibold text-[#00B298]">Índice NPS de Excelência</span>
            </div>
            <div className="pt-4 lg:pt-0">
              <p className="bg-gradient-to-r from-[#25C5DC] to-[#32D77D] bg-clip-text text-3xl font-extrabold text-transparent sm:text-4xl">
                24 / 7
              </p>
              <p className="mt-1 text-sm font-medium text-slate-300">Plantão Clínico Ativo</p>
              <span className="text-xs font-semibold text-[#00B298]">Sempre que seu pet precisar</span>
            </div>
            <div className="pt-4 lg:pt-0">
              <p className="bg-gradient-to-r from-[#25C5DC] to-[#32D77D] bg-clip-text text-3xl font-extrabold text-transparent sm:text-4xl">
                100%
              </p>
              <p className="mt-1 text-sm font-medium text-slate-300">Médicos com CRMV Ativo</p>
              <span className="text-xs font-semibold text-[#00B298]">
                Auditoria contínua de registros
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* BEGIN: HowItWorks */}
      <section className="bg-white py-20" id="como-funciona">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto mb-16 max-w-3xl text-center">
            <span className="rounded-full border border-[#0B68C2]/20 bg-[#F0F8FB] px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-[#0B68C2]">
              Praticidade Sem Estresse para o Animal
            </span>
            <h2 className="mt-3 text-3xl font-extrabold text-[#153B50] sm:text-4xl">
              Como funciona a Tele Veterinária na DrVets?
            </h2>
            <p className="mt-3 text-base text-slate-600 sm:text-lg">
              Cuidado humanizado e profissional sem precisar colocar o seu pet em caixas de transporte ou enfrentar trânsito e salas de espera lotadas.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                num: '01',
                bg: 'bg-blue-100 text-[#0B68C2]',
                title: 'Escolha o Especialista',
                text: 'Selecione por especialidade médica ou acione direto o plantão 24h para atendimento imediato.',
                footer: 'Triagem prévia inclusa →',
                footerTone: 'text-[#0B68C2]',
              },
              {
                num: '02',
                bg: 'bg-emerald-100 text-[#13A88A]',
                title: 'Vídeo HD Seguro',
                text: 'Conecte-se pelo celular ou notebook em sala criptografada. Mostre o comportamento, lesões e sinais do pet.',
                footer: 'Sem precisar instalar apps →',
                footerTone: 'text-[#13A88A]',
              },
              {
                num: '03',
                bg: 'bg-cyan-100 text-[#25C5DC]',
                title: 'Prescrição ICP-Brasil',
                text: 'Receba receitas digitais certificadas por WhatsApp e e-mail com QR Code aceito em farmácias de todo o Brasil.',
                footer: 'Assinatura digital válida →',
                footerTone: 'text-teal-600',
              },
              {
                num: '04',
                bg: 'bg-purple-100 text-purple-600',
                title: 'Prontuário & Suporte',
                text: 'Acompanhe o histórico do pet, instruções pós-consulta, receitas anteriores e agendamento de retorno.',
                footer: 'Histórico vitalício do pet →',
                footerTone: 'text-purple-600',
              },
            ].map((step) => (
              <div
                className="group relative rounded-2xl border border-slate-200/80 bg-[#F9FBFC] p-6 shadow-sm transition hover:border-[#00B298]/50 hover:shadow-md"
                key={step.num}
              >
                <div
                  className={`mb-5 flex h-12 w-12 items-center justify-center rounded-xl text-lg font-bold transition group-hover:scale-110 ${step.bg}`}
                >
                  {step.num}
                </div>
                <h3 className="mb-2 text-lg font-bold text-[#153B50]">{step.title}</h3>
                <p className="text-sm leading-relaxed text-slate-600">{step.text}</p>
                <span className={`mt-4 block text-xs font-semibold ${step.footerTone}`}>
                  {step.footer}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BEGIN: SpecialistsCatalogWithPhotos */}
      <section className="border-t border-slate-200/80 bg-slate-50 py-20" id="especialistas">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 flex flex-col justify-between md:flex-row md:items-end">
            <div>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#13A88A]">
                Corpo Clínico Credenciado
              </span>
              <h2 className="mt-2 text-3xl font-extrabold text-[#153B50] sm:text-4xl">
                Veterinários Disponíveis para Consulta
              </h2>
              <p className="mt-1 text-base text-slate-600">
                Médicos-veterinários com CRMV ativo, avaliações reais e atendimento humanizado
              </p>
            </div>
            <div className="mt-4 flex items-center gap-3 md:mt-0">
              <span className="text-xs font-semibold text-slate-500">Filtrar por:</span>
              <button
                className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${!filterOnlineOnly ? 'border-[#0B68C2] bg-[#F0F8FB] text-[#0C2D48]' : 'border-slate-200 bg-white text-[#0C2D48] hover:bg-slate-50'}`}
                onClick={() => setFilterOnlineOnly(false)}
                type="button"
              >
                Todos
              </button>
              <button
                className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${filterOnlineOnly ? 'border-emerald-500 bg-emerald-100 text-emerald-900' : 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'}`}
                onClick={() => setFilterOnlineOnly(true)}
                type="button"
              >
                Online Agora
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {visibleSpecialists.map((doc) => (
              <div
                className="group flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300 hover:shadow-xl"
                key={doc.name}
              >
                <div>
                  <div className="mb-4 flex items-start gap-4">
                    <div className="relative">
                      <Image
                        alt={doc.name}
                        className={`h-16 w-16 rounded-2xl border-2 object-cover shadow-sm ${doc.borderTone}`}
                        height={140}
                        quality={95}
                        referrerPolicy="no-referrer"
                        sizes="128px"
                        src={doc.avatarSrc}
                        width={256}
                      />
                      <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-white bg-emerald-500" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${doc.isOnline ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-blue-200 bg-blue-50 text-blue-700'}`}
                        >
                          {doc.statusLabel}
                        </span>
                        <span className="flex items-center gap-0.5 text-xs font-extrabold text-amber-500">
                          ★ {doc.rating}{' '}
                          <span className="text-[10px] font-normal text-slate-400">
                            ({doc.reviews})
                          </span>
                        </span>
                      </div>
                      <h3 className="mt-1 text-base font-bold text-[#153B50] transition group-hover:text-[#0B68C2]">
                        {doc.name}
                      </h3>
                      <p className="text-xs text-slate-500">{doc.crmv}</p>
                    </div>
                  </div>
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {doc.tags.map((tag) => (
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${tag.tone}`}
                        key={tag.label}
                      >
                        {tag.label}
                      </span>
                    ))}
                  </div>
                  <p className="line-clamp-2 text-xs leading-relaxed text-slate-600">{doc.bio}</p>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
                  <div>
                    <span className="block text-[11px] text-slate-400">{doc.priceLabel}</span>
                    <span className="text-lg font-extrabold text-[#153B50]">{doc.price}</span>
                  </div>
                  <Link
                    className={
                      doc.ctaPrimary
                        ? 'rounded-xl bg-[linear-gradient(92deg,#0A63BA_0%,#0690B4_45%,#0EB485_100%)] px-4 py-2.5 text-xs font-bold text-white shadow transition hover:opacity-95'
                        : 'rounded-xl bg-[#F0F8FB] px-4 py-2.5 text-xs font-bold text-[#0B68C2] transition hover:bg-[#0B68C2] hover:text-white'
                    }
                    href="/agendamento/edit"
                  >
                    {doc.ctaLabel}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BEGIN: SectionPetShopsAndClinics */}
      <section className="relative overflow-hidden bg-white py-20" id="parceiros">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-20 top-10 h-96 w-96 rounded-full bg-emerald-100/40 blur-3xl"
        />
        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#10344A] via-[#153B50] to-[#0A2333] p-8 text-white shadow-2xl sm:p-12 lg:p-16">
            <div className="mb-12 max-w-3xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-300">
                Parceria B2B &amp; Varejo Pet
              </span>
              <h2 className="mt-3 text-3xl font-extrabold leading-tight sm:text-4xl lg:text-5xl">
                Seu Pet Shop conectado à Telemedicina DrVets
              </h2>
              <p className="mt-3 text-base leading-relaxed text-slate-300 sm:text-lg">
                Transforme sua loja física em um ponto de pronto atendimento com suporte veterinário 24 horas. Ganhe comissões recorrentes em cada consulta e direcione a compra de remédios para o seu balcão.
              </p>
            </div>

            <div className="mb-12 grid grid-cols-1 gap-6 md:grid-cols-3">
              {[
                {
                  num: '1',
                  tone: 'bg-emerald-400/20 text-emerald-300',
                  title: 'Credenciamento Rápido',
                  text: 'Cadastre seu CNPJ gratuitamente em 5 minutos. Fornecemos display de balcão e material de comunicação oficial.',
                },
                {
                  num: '2',
                  tone: 'bg-cyan-400/20 text-[#25C5DC]',
                  title: 'QR Code & Totem na Loja',
                  text: 'Seu cliente aponta o celular para o QR Code no balcão e abre a teleconsulta na hora com um veterinário DrVets.',
                },
                {
                  num: '3',
                  tone: 'bg-blue-400/20 text-blue-300',
                  title: 'Comissões + Venda do Remédio',
                  text: 'Receba comissão líquida por consulta e venda imediatamente os medicamentos e produtos receitados na sua farmácia.',
                },
              ].map((step) => (
                <div
                  className="rounded-2xl border border-white/10 bg-white/10 p-6 backdrop-blur-md transition hover:border-emerald-400/50"
                  key={step.num}
                >
                  <div
                    className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl text-lg font-bold ${step.tone}`}
                  >
                    {step.num}
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-white">{step.title}</h3>
                  <p className="text-xs leading-relaxed text-slate-300">{step.text}</p>
                </div>
              ))}
            </div>

            <div className="mb-10 grid grid-cols-1 gap-4 border-t border-white/10 pt-6 text-xs sm:grid-cols-3 sm:text-sm">
              {[
                'Prescrição direcionada para sua loja',
                'Aumento de até 35% no ticket médio',
                'Dashboard financeiro com saques semanais',
              ].map((benefit) => (
                <div className="flex items-center gap-3" key={benefit}>
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/20 font-bold text-emerald-400">
                    ✓
                  </span>
                  <span>{benefit}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <Link
                className="flex items-center gap-2 rounded-full bg-[linear-gradient(92deg,#0A63BA_0%,#0690B4_45%,#0EB485_100%)] px-8 py-3.5 text-sm font-bold text-white shadow-lg transition duration-200 hover:scale-105 sm:text-base"
                href="/parceiros"
              >
                <span>Quero ser um Pet Shop Parceiro DrVets</span>
                <span aria-hidden="true" className="text-lg">
                  →
                </span>
              </Link>
              <Link
                className="rounded-full border border-white/20 bg-white/15 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-white/20"
                href="/comissoes"
              >
                Simular Faturamento Mensal
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* BEGIN: SectionDrVetAds */}
      <section className="border-t border-slate-200/80 bg-[#F5F8FA] py-20" id="drvets-ads">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-6">
              <span className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#0B68C2]">
                Ecossistema DrVets Ads (B2B)
              </span>
              <h2 className="text-3xl font-extrabold leading-tight text-[#153B50] sm:text-4xl">
                Conecte sua marca a milhares de tutores e veterinários qualificados
              </h2>
              <p className="text-base leading-relaxed text-slate-600">
                DrVets Ads é a primeira rede de mídia digital integrada ao momento de consulta e cuidado do pet. Entregue soluções no exato instante em que o tutor busca tratamento, rações especiais e bem-estar.
              </p>

              <div className="space-y-4 pt-2">
                {[
                  {
                    badge: 'bg-emerald-100 text-emerald-700',
                    icon: '◎',
                    title: 'Segmentação Clínica Contextual',
                    text: 'Exiba seu produto para perfis específicos: pets com dermatite, obesidade, animais idosos ou filhotes em vacinação.',
                  },
                  {
                    badge: 'bg-blue-100 text-[#0B68C2]',
                    icon: '✓',
                    title: 'Formatos Nativos e Éticos',
                    text: 'Anúncios integrados à tela de resumo pós-consulta e sugestões de farmácia sem interferir na decisão do médico.',
                  },
                  {
                    badge: 'bg-cyan-100 text-teal-700',
                    icon: '↗',
                    title: 'Dashboard de ROI em Tempo Real',
                    text: 'Métricas completas de alcance, conversão em farmácias parceiras e cliques com total transparência.',
                  },
                ].map((item) => (
                  <div className="flex items-start gap-3" key={item.title}>
                    <div
                      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold ${item.badge}`}
                    >
                      {item.icon}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[#153B50]">{item.title}</h3>
                      <p className="text-xs text-slate-500">{item.text}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-4 pt-4">
                <Link
                  className="flex items-center gap-2 rounded-full bg-[#153B50] px-7 py-3 text-sm font-bold text-white shadow transition duration-200 hover:bg-[#0C2D48]"
                  href="/anuncios"
                >
                  <span>Anunciar no DrVets Ads</span>
                  <span aria-hidden="true">→</span>
                </Link>
                <Link
                  className="flex items-center gap-1 text-xs font-bold text-[#0B68C2] hover:text-[#153B50]"
                  href="/parceiros"
                >
                  Portal de Parceiros &amp; Cupons
                </Link>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="relative rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xl sm:p-8">
                <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-[#0B68C2] to-[#00B298] font-bold text-white">
                      ↗
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-800">Painel do Anunciante Pet</h4>
                      <p className="text-[11px] text-slate-400">
                        Campanha Ativa: Ração Hipoalergênica &amp; Suplementos
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                    CTR Médio 8.4%
                  </span>
                </div>

                <div className="mb-6 grid grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <span className="block text-xs text-slate-400">Tutores Impactados</span>
                    <span className="text-2xl font-extrabold text-[#153B50]">142.800</span>
                    <span className="block text-[10px] font-semibold text-emerald-600">
                      ↑ +24% este mês
                    </span>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <span className="block text-xs text-slate-400">Conversões em Pet Shops</span>
                    <span className="text-2xl font-extrabold text-[#153B50]">12.430</span>
                    <span className="block text-[10px] font-semibold text-emerald-600">
                      Ticket Médio R$ 184
                    </span>
                  </div>
                </div>

                <div className="rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/40 p-4">
                  <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-slate-500">
                    <span>Formato Patrocinado em Pós-Consulta (Exemplo)</span>
                    <span className="text-emerald-700">Verificado</span>
                  </div>
                  <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-amber-100 text-xs font-extrabold text-amber-800">
                      CARE
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-bold text-slate-800">Linha Dermato Care Premium</p>
                      <p className="text-[11px] text-slate-500">
                        Cupom de 20% OFF para a primeira compra com retirada local.
                      </p>
                    </div>
                    <Link
                      className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-bold text-[#0B68C2] hover:bg-blue-100"
                      href="/parceiros"
                    >
                      Ver Oferta
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BEGIN: SectionVeterinarianCockpit */}
      <section className="border-t border-slate-200/80 bg-white py-20" id="consultorio-vet">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto mb-16 max-w-3xl text-center">
            <span className="rounded-full border border-[#0B68C2]/20 bg-[#F0F8FB] px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-[#0B68C2]">
              Empoderamento Médico-Veterinário
            </span>
            <h2 className="mt-3 text-3xl font-extrabold text-[#153B50] sm:text-4xl">
              Tenha seu Consultório Veterinário Virtual Exclusivo na DrVets
            </h2>
            <p className="mt-3 text-base text-slate-600 sm:text-lg">
              Tudo o que você precisa para clinicar online com autonomia, segurança jurídica e receita previsível. Atenda de casa ou expanda a capacidade do seu consultório físico.
            </p>
          </div>

          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
            <div className="space-y-5 lg:col-span-5">
              {[
                {
                  badge: 'bg-emerald-100 text-emerald-800',
                  icon: 'HD',
                  title: 'Sala de Teleconsulta HD Integrada',
                  text: 'Conexão sem latência com criptografia ponta a ponta e sala de espera automática para organizar seus pacientes.',
                },
                {
                  badge: 'bg-blue-100 text-blue-800',
                  icon: 'SOAP',
                  title: 'Prontuário Cloud & Histórico Clínico',
                  text: 'Anamnese estruturada com upload de exames laboratoriais, fotos e linha do tempo de evolução do paciente.',
                },
                {
                  badge: 'bg-teal-100 text-teal-800',
                  icon: 'ICP',
                  title: 'Prescrição ICP-Brasil Automática',
                  text: 'Emita receitas simples e de controle especial com assinatura eletrônica oficial, enviadas por WhatsApp e SMS ao tutor.',
                },
                {
                  badge: 'bg-purple-100 text-purple-800',
                  icon: 'R$',
                  title: 'Gestão Financeira & Honorários Livres',
                  text: 'Defina o valor da sua consulta e receba os pagamentos diretamente na sua conta bancária sem riscos de inadimplência.',
                },
              ].map((feature) => (
                <div
                  className="rounded-2xl border border-slate-200/80 p-4 transition duration-200 hover:border-[#00B298] hover:bg-slate-50/50"
                  key={feature.title}
                >
                  <div className="mb-1.5 flex items-center gap-3">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-lg text-[10px] font-extrabold ${feature.badge}`}
                    >
                      {feature.icon}
                    </div>
                    <h3 className="text-base font-bold text-[#153B50]">{feature.title}</h3>
                  </div>
                  <p className="pl-11 text-xs leading-relaxed text-slate-600">{feature.text}</p>
                </div>
              ))}

              <div className="pt-3">
                <Link
                  className="flex items-center justify-center gap-2 rounded-full bg-[linear-gradient(92deg,#0A63BA_0%,#0690B4_45%,#0EB485_100%)] px-7 py-3.5 text-sm font-bold text-white shadow-md transition duration-200 hover:scale-105"
                  href="/agenda"
                >
                  <span>Abrir meu Consultório Virtual na DrVets</span>
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="relative rounded-3xl border border-slate-700 bg-gradient-to-tr from-[#123145] to-[#1A4560] p-5 text-white shadow-2xl sm:p-7">
                <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-red-500" />
                    <span className="h-3 w-3 rounded-full bg-amber-500" />
                    <span className="h-3 w-3 rounded-full bg-emerald-500" />
                    <span className="ml-2 font-mono text-[11px] text-slate-300">
                      drvets.com.br/cockpit/dra-camila
                    </span>
                  </div>
                  <span className="rounded-md border border-emerald-400/30 bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                    CRMV-SP Ativo • Conexão Criptografada
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
                  <div className="relative min-h-[220px] overflow-hidden rounded-2xl border border-white/10 bg-slate-900 md:col-span-7">
                    <Image
                      alt="Vídeo chamada com paciente Theo"
                      className="h-full w-full object-cover"
                      height={768}
                      quality={95}
                      referrerPolicy="no-referrer"
                      sizes="(max-width: 768px) 100vw, 480px"
                      src="/home/cockpit-theo.webp"
                      width={1408}
                    />
                    <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-lg bg-[#153B50]/80 px-2.5 py-1 text-[10px] font-bold backdrop-blur-md">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                      <span>EM ATENDIMENTO • Theo (Golden)</span>
                    </div>
                    <div className="absolute bottom-2.5 right-2.5 h-24 w-20 overflow-hidden rounded-xl border-2 border-emerald-400 shadow-md">
                      <Image
                        alt="Dra. Camila em atendimento"
                        className="h-full w-full object-cover"
                        height={175}
                        quality={95}
                        referrerPolicy="no-referrer"
                        sizes="160px"
                        src="/home/cockpit-camila.webp"
                        width={320}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col justify-between rounded-2xl border border-white/10 bg-white/5 p-4 text-xs backdrop-blur-md md:col-span-5">
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between border-b border-white/10 pb-2">
                        <span className="font-bold text-white">Prontuário Ativo</span>
                        <span className="font-bold text-emerald-400">ICP-Brasil ✓</span>
                      </div>
                      <div className="space-y-1 text-[11px] text-slate-300">
                        <p>
                          <strong className="text-white">Tutor:</strong> Carlos Eduardo
                        </p>
                        <p>
                          <strong className="text-white">Queixa:</strong> Coceira intensa dorso e orelha
                        </p>
                        <p>
                          <strong className="text-white">Diagnóstico:</strong> Hipersensibilidade alimentar
                        </p>
                      </div>
                      <div className="space-y-1 rounded-xl border border-white/10 bg-black/30 p-2.5 text-[11px]">
                        <p className="font-bold text-cyan-300">Receita Gerada:</p>
                        <p className="text-slate-300">• Apoquel 16mg - 1 cp/dia (14 dias)</p>
                        <p className="text-slate-300">• Loção Otológica Calmante</p>
                      </div>
                    </div>
                    <Link
                      className="mt-3 flex w-full items-center justify-center gap-1 rounded-xl bg-emerald-500 py-2 text-xs font-bold text-white transition hover:bg-emerald-600"
                      href="/receitas"
                    >
                      <span>Assinar e Enviar Receita</span>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BEGIN: SecurityLegalSection */}
      <section className="border-y border-slate-200/70 bg-slate-50 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#10344A] to-[#0A2333] p-8 text-white shadow-xl sm:p-12">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-20 -right-20 h-80 w-80 rounded-full bg-[#00B298]/20 blur-3xl"
            />
            <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12">
              <div className="space-y-4 lg:col-span-8">
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300">
                  <span>✓</span>
                  <span>Segurança e Rigor Técnico Resolução CFMV nº 1.465/2022</span>
                </div>
                <h2 className="text-2xl font-bold leading-snug sm:text-3xl">
                  Telemedicina Veterinária Ética, Segura e Validada por Órgãos Oficiais
                </h2>
                <p className="text-sm leading-relaxed text-slate-300 sm:text-base">
                  Todos os profissionais cadastrados na DrVets passam por auditoria obrigatória de registro profissional no Conselho Regional de Medicina Veterinária (CRMV). Nossas prescrições contam com assinatura digital qualificada padrão ICP-Brasil, aceitas legalmente em farmácias humanas e veterinárias em todo o território nacional.
                </p>
                <div className="grid grid-cols-1 gap-3 pt-2 text-xs sm:grid-cols-3">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#32D77D]">✓</span>
                    <span>Dados protegidos por LGPD</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#32D77D]">✓</span>
                    <span>Receituário com QR Code</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#32D77D]">✓</span>
                    <span>Salas de Vídeo Criptografadas</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-6 text-center backdrop-blur-sm lg:col-span-4">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#0B68C2] to-[#00B298] text-2xl font-extrabold text-white shadow-lg">
                  ✓
                </div>
                <h3 className="text-base font-bold text-white">Selo DrVets Autenticado</h3>
                <p className="mb-4 mt-1 text-xs text-slate-300">
                  Verifique instantaneamente a credencial de qualquer veterinário antes do atendimento.
                </p>
                <Link className="text-xs font-bold text-[#25C5DC] hover:underline" href="/agenda">
                  Consultar registro de veterinário →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BEGIN: Testimonials */}
      <section className="bg-white py-20" id="depoimentos">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <span className="rounded-full bg-[#F0F8FB] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#0B68C2]">
              Histórias Reais
            </span>
            <h2 className="mt-2 text-3xl font-extrabold text-[#153B50]">
              O que dizem os tutores que usam a DrVets
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Milhares de cães, gatos e famílias atendidos com carinho no conforto do seu lar.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {testimonials.map((item) => (
              <div
                className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-[#F9FBFC] p-6 shadow-sm transition hover:shadow-md"
                key={item.author}
              >
                <div>
                  <div className="mb-3 flex text-sm text-amber-400">★★★★★</div>
                  <p className="text-sm italic leading-relaxed text-slate-700">{item.quote}</p>
                </div>
                <div className="mt-6 flex items-center gap-3 border-t border-slate-200/60 pt-4">
                  <Image
                    alt={item.author}
                    className="h-11 w-11 rounded-full border border-slate-200 object-cover"
                    height={128}
                    quality={95}
                    referrerPolicy="no-referrer"
                    sizes="96px"
                    src={item.avatarSrc}
                    width={192}
                  />
                  <div>
                    <p className="text-xs font-bold text-slate-800">{item.author}</p>
                    <p className="text-[11px] text-slate-400">{item.location}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BEGIN: BottomCtaBanner */}
      <section className="bg-slate-50 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#0B68C2] via-[#049CB7] to-[#00B298] p-8 text-white shadow-2xl sm:p-14">
            <div className="relative z-10 max-w-2xl space-y-5">
              <span className="inline-block rounded-full bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-wider backdrop-blur-md">
                Seu pet sempre por perto
              </span>
              <h2 className="text-3xl font-extrabold leading-tight sm:text-4xl">
                Não espere os sintomas piorarem. Fale com um veterinário agora mesmo.
              </h2>
              <p className="text-sm leading-relaxed text-white/90 sm:text-base">
                Tenha a tranquilidade de contar com assistência veterinária 24 horas por dia, 7 dias por semana, direto do seu smartphone ou computador.
              </p>
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <Link
                  className="flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-base font-bold text-[#153B50] shadow-lg transition duration-200 hover:bg-slate-50"
                  href="/agendamento/edit"
                >
                  <VideoCamIcon className="h-5 w-5 text-[#0B68C2]" />
                  <span>Chamar Plantonista Agora</span>
                </Link>
                <div className="flex items-center gap-2 text-xs text-white/90">
                  <span>✓ Sem taxa de adesão</span>
                  <span>•</span>
                  <span>✓ Atendimento em minutos</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BEGIN: MainFooter */}
      <footer className="border-t border-slate-800 bg-[#0C2D48] pb-12 pt-16 text-slate-300">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-10 border-b border-slate-800 pb-12 md:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-4 lg:col-span-2">
              <div className="w-fit rounded-2xl bg-white p-2.5">
                <Image
                  alt="DrVets Tele Veterinária"
                  className="h-12 w-auto object-contain"
                  height={220}
                  quality={95}
                  referrerPolicy="no-referrer"
                  sizes="220px"
                  src="/home/drvets-logo.webp"
                  width={330}
                />
              </div>
              <p className="max-w-sm text-sm leading-relaxed text-slate-400">
                Plataforma pioneira em telemedicina e suporte veterinário digital. Conectamos tutores e pet shops aos melhores médicos-veterinários do Brasil com segurança técnica, ética e validação jurídica.
              </p>
              <div className="space-y-1 text-xs text-[#00B298]">
                <p>✓ Conforme a Resolução CFMV nº 1.465/2022</p>
                <p>✓ Responsável Técnico Médico Veterinário: Dr. A. Silveira - CRMV-SP 38.412</p>
              </div>
            </div>

            <div>
              <p className="mb-4 text-sm font-bold uppercase tracking-wider text-white">
                Para Tutores
              </p>
              <ul className="space-y-2.5 text-sm">
                <li>
                  <a className="transition hover:text-white" href="#triage-box">
                    Plantão Veterinário 24h
                  </a>
                </li>
                <li>
                  <a className="transition hover:text-white" href="#especialistas">
                    Catálogo de Especialistas
                  </a>
                </li>
                <li>
                  <a className="transition hover:text-white" href="#como-funciona">
                    Como Funciona a Consulta
                  </a>
                </li>
                <li>
                  <Link className="transition hover:text-white" href="/assinaturas">
                    Clube DrVet (Benefícios)
                  </Link>
                </li>
                <li>
                  <Link className="transition hover:text-white" href="/pets">
                    Meus Pets
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <p className="mb-4 text-sm font-bold uppercase tracking-wider text-white">
                Para Profissionais
              </p>
              <ul className="space-y-2.5 text-sm">
                <li>
                  <Link className="transition hover:text-white" href="/agenda">
                    Consultório Virtual Veterinário
                  </Link>
                </li>
                <li>
                  <Link className="transition hover:text-white" href="/teleconsulta">
                    Sala de Teleconsulta
                  </Link>
                </li>
                <li>
                  <Link className="transition hover:text-white" href="/parceiros">
                    Seja um Pet Shop Parceiro
                  </Link>
                </li>
                <li>
                  <Link className="transition hover:text-white" href="/anuncios">
                    DrVets Ads (Anunciantes)
                  </Link>
                </li>
                <li>
                  <Link className="transition hover:text-white" href="/receitas">
                    Assinatura Digital ICP-Brasil
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <p className="mb-4 text-sm font-bold uppercase tracking-wider text-white">
                Atendimento
              </p>
              <ul className="space-y-2.5 text-sm">
                <li>WhatsApp: (11) 98765-4321</li>
                <li>contato@drvets.com.br</li>
                <li className="pt-2">
                  <Link className="transition hover:text-white" href="/login">
                    Entrar / Cadastrar conta
                  </Link>
                </li>
                <li>
                  <Link className="transition hover:text-white" href="/pagamentos">
                    Pagamentos &amp; Comprovantes
                  </Link>
                </li>
                <li>
                  <Link className="transition hover:text-white" href="/perfil">
                    Meu Perfil &amp; Privacidade
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="flex flex-col items-center justify-between gap-4 pt-8 text-xs text-slate-500 sm:flex-row">
            <p>
              © 2026 DrVets Tele Veterinária Ltda. CNPJ: 45.892.120/0001-90. Todos os direitos reservados.
            </p>
            <div className="flex items-center gap-4">
              <span>Seu pet sempre por perto</span>
              <span>•</span>
              <span>Brasil</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
