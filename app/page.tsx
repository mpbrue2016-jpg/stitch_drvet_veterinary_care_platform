import Link from 'next/link';

const Home = () => {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-brand-floor">
      <section aria-labelledby="home-title" className="flex flex-col items-center justify-center px-4 py-16 sm:py-20">
        <div className="max-w-3xl text-center mb-12">
          <span className="mb-5 inline-flex items-center rounded-full bg-brand-ice px-4 py-2 text-sm font-semibold text-brand-green">
            Atendimento veterinário em um só lugar
          </span>
          <h1 className="mb-6 text-4xl font-extrabold tracking-tight text-brand-navy sm:text-5xl" id="home-title">
            Cuidado veterinário, mais perto de você
          </h1>
          <p className="mb-8 text-lg leading-8 text-brand-muted sm:text-xl">
            Agende consultas e acompanhe a rotina de cuidado do seu pet em um só lugar.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/agendamento" className="rounded-lg bg-brand-navy px-8 py-3 text-lg font-semibold text-white transition-colors hover:bg-[#0d2a3a]">Agendamentos</Link>
            <Link href="/agenda" className="rounded-lg bg-brand-green px-8 py-3 text-lg font-semibold text-white transition-colors hover:bg-[#0f8a72]">Ver agenda</Link>
          </div>
        </div>

        <p className="max-w-3xl text-center text-sm text-brand-muted">
          Plataforma em desenvolvimento. Consulte as áreas disponíveis no menu.
        </p>
      </section>
    </div>
  );
};

export default Home;