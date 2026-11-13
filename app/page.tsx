import Image from 'next/image';
import Link from 'next/link';

const careSteps = [
  { number: '01', title: 'Escolha o atendimento', text: 'Conheça as opções de cuidado e veja qual delas combina com a necessidade do seu pet.' },
  { number: '02', title: 'Converse com um profissional', text: 'A teleconsulta permite conversar com um médico-veterinário por vídeo.' },
  { number: '03', title: 'Acompanhe o cuidado', text: 'Consulte as informações do atendimento e os próximos passos indicados pelo profissional.' },
];

const specialties = [
  'Clínica geral e triagem',
  'Dermatologia e alergias',
  'Comportamento e ansiedade',
  'Nutrição e alimentação',
  'Cardiologia e respiração',
  'Medicina integrativa',
];

export default function Home() {
  return (
    <div className="bg-[#f6faff] text-[#183344]">
      <section className="relative overflow-hidden bg-gradient-to-b from-[#eef8fb] via-white to-[#f6faff] px-4 pb-14 pt-6 sm:px-6 sm:pb-20 sm:pt-12 lg:px-8" id="inicio">
        <div aria-hidden="true" className="pointer-events-none absolute -left-32 -top-20 h-80 w-80 rounded-full bg-cyan-100/70 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 top-24 h-96 w-96 rounded-full bg-emerald-100/70 blur-3xl" />
        <div className="relative mx-auto max-w-7xl">
          <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_12px_35px_-8px_rgba(15,60,90,0.12)] sm:p-10 lg:p-14">
            <div className="absolute inset-x-0 bottom-0 h-2 bg-gradient-to-r from-[#0a63ba] via-[#13a88a] to-[#32d77d]" />
            <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-12">
              <div className="z-10 flex flex-col items-start gap-6 lg:col-span-7">
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-500" />
                  Cuidado veterinário conectado
                </span>
                <div>
                  <h1 className="max-w-3xl text-4xl font-extrabold leading-tight tracking-tight text-[#153b50] sm:text-5xl lg:text-[52px]">
                    Cuidado veterinário,
                    <span className="block bg-gradient-to-r from-[#0c8974] via-[#13a88a] to-[#25b899] bg-clip-text text-transparent">
                      onde seu pet estiver.
                    </span>
                  </h1>
                  <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
                    Conheça a plataforma DrVet e acompanhe os recursos de cuidado veterinário disponíveis.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link className="inline-flex min-h-12 items-center gap-3 rounded-full bg-gradient-to-r from-[#0a63ba] via-[#0690b4] to-[#0eb485] px-6 py-3 font-semibold text-white shadow-lg transition-transform hover:scale-[1.02]" href="/agendamento">
                    Ver agendamentos <span aria-hidden="true">→</span>
                  </Link>
                  <Link className="inline-flex min-h-12 items-center rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-[#153b50] transition-colors hover:bg-slate-50" href="/agenda">
                    Área profissional
                  </Link>
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-slate-600">
                  <span className="inline-flex items-center gap-2"><span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-100 text-emerald-700">✓</span>Conheça a plataforma</span>
                  <span className="inline-flex items-center gap-2"><span className="grid h-5 w-5 place-items-center rounded-full bg-sky-100 text-sky-700">i</span>Atendimento sujeito à disponibilidade</span>
                </div>
              </div>
              <div className="relative mx-auto w-full max-w-md lg:col-span-5 lg:max-w-none">
                <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-emerald-100 via-sky-100 to-transparent blur-xl" />
                <div className="relative overflow-hidden rounded-[2rem] border border-white bg-gradient-to-br from-[#dff7f0] via-[#edf8ff] to-[#d7eeff] p-5 shadow-xl sm:p-7">
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full bg-white/80 px-3 py-1.5 text-xs font-bold text-[#006b57]">DrVet · Cuidado veterinário</span>
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  </div>
                  <div className="relative my-5 h-56 overflow-hidden rounded-3xl shadow-sm sm:h-72">
                    <Image
                      alt="Médica veterinária atendendo um cachorro"
                      className="object-cover"
                      fill
                      sizes="(max-width: 1024px) 100vw, 40vw"
                      src="/stitch-vet-hero.webp"
                    />
                    <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#153b50]/70 via-transparent to-transparent" />
                    <span className="absolute bottom-4 left-4 rounded-full border border-white/40 bg-white/95 px-3 py-2 text-xs font-bold text-[#153b50] shadow-lg">
                      Saúde e bem-estar animal
                    </span>
                  </div>
                  <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm">
                    <p className="text-sm font-bold text-[#153b50]">Um espaço para cuidar melhor</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">Informações de atendimento e acompanhamento em um só lugar.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mx-auto mt-5 grid max-w-5xl gap-3 sm:grid-cols-3">
            {[
              { title: 'Telemedicina', text: 'Conheça os recursos de atendimento on-line.' },
              { title: 'Agenda clínica', text: 'Acesse a área profissional DrVet.' },
              { title: 'Acompanhamento', text: 'Consulte as áreas disponíveis na plataforma.' },
            ].map((item) => (
              <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm sm:p-5" key={item.title}>
                <p className="font-bold text-[#006b57]">{item.title}</p>
                <p className="mt-1 text-sm leading-5 text-slate-600">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-14 sm:px-6 sm:py-16 lg:px-8" id="como-funciona">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto mb-8 max-w-2xl text-center">
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-[#087a68]">Como funciona</span>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-[#153b50] sm:text-3xl">Um caminho simples para o cuidado</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">Conheça as etapas da experiência DrVet.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {careSteps.map((step) => (
              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md sm:p-6" key={step.number}>
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#dff0ff] text-xs font-extrabold text-[#006b57]">{step.number}</span>
                <h3 className="mt-4 font-bold text-[#153b50]">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{step.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#f0f7fb] px-4 py-14 sm:px-6 sm:py-16 lg:px-8" id="especialidades">
        <div className="mx-auto max-w-7xl">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
            <div>
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-[#087a68]">Cuidado veterinário</span>
              <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-[#153b50] sm:text-3xl">Áreas de atendimento</h2>
              <p className="mt-2 text-sm text-slate-600">As áreas e a disponibilidade devem ser confirmadas com a equipe veterinária.</p>
            </div>
            <Link className="text-sm font-semibold text-[#006b57] hover:underline" href="/agendamento">Ver agendamentos →</Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {specialties.map((specialty, index) => (
              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" key={specialty}>
                <span className={`grid h-10 w-10 place-items-center rounded-xl text-sm font-bold ${index % 2 === 0 ? 'bg-[#dff7f0] text-[#006b57]' : 'bg-[#dff0ff] text-[#274a60]'}`}>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3 className="mt-4 font-bold text-[#153b50]">{specialty}</h3>
                <p className="mt-2 text-sm leading-5 text-slate-600">Consulte a equipe veterinária sobre avaliação, disponibilidade e encaminhamentos.</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 rounded-3xl bg-gradient-to-r from-[#153b50] to-[#006b57] p-6 text-white shadow-xl sm:p-10 md:flex-row md:items-center md:justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-200">Plataforma DrVet</span>
            <h2 className="mt-2 text-2xl font-extrabold sm:text-3xl">Conheça as áreas disponíveis</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/80">Este frontend está em desenvolvimento. Os serviços e agendamentos dependem de configuração e disponibilidade.</p>
          </div>
          <Link className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-bold text-[#006b57] transition-colors hover:bg-emerald-50" href="/agendamento">
            Acessar agendamentos <span aria-hidden="true" className="ml-2">→</span>
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-[#153b50] px-4 py-8 text-sm text-white sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <span className="font-bold">DrVet · Telemedicina veterinária</span>
          <span className="text-xs text-white/70">Ambiente em desenvolvimento · Consulte um médico-veterinário para orientação clínica.</span>
        </div>
      </footer>
    </div>
  );
}
