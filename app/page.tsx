import Link from 'next/link';

const Home = () => {
  return (
    <div className="min-h-screen bg-[#F5F8FA]">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-10 h-10 bg-[#13A88A] rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <span className="text-xl font-bold text-[#153B50]">DrVet Telemedicina</span>
            </div>
            <nav className="hidden md:flex space-x-8">
              <Link href="/agendamento" className="text-gray-600 hover:text-[#153B50] transition-colors">Agendamento</Link>
              <Link href="/agenda" className="text-gray-600 hover:text-[#153B50] transition-colors">Agenda</Link>
              <Link href="/receitas" className="text-gray-600 hover:text-[#153B50] transition-colors">Receitas</Link>
              <Link href="/comissões" className="text-gray-600 hover:text-[#153B50] transition-colors">Comissões</Link>
            </nav>
          </div>
        </div>
      </header>

      <main className="flex flex-col items-center justify-center py-20 px-4">
        <div className="max-w-3xl text-center mb-12">
          <h1 className="text-5xl font-bold text-[#153B50] mb-6">Plataforma de Telemedicina Veterinária</h1>
          <p className="text-xl text-[#718096] mb-8">Agende consultas, acompanhe a agenda, emita receitas digitais ICP-Brasil e gerencie comissões de forma prática e segura.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/agendamento" className="bg-[#153B50] hover:bg-[#0d2a3a] text-white px-8 py-3 rounded-lg text-lg font-medium transition-colors">Novo Agendamento</Link>
            <Link href="/agenda" className="bg-[#13A88A] hover:bg-[#0f8a72] text-white px-8 py-3 rounded-lg text-lg font-medium transition-colors">Ver Agenda</Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl">
          <div className="bg-white p-6 rounded-xl border border-gray-100 hover:shadow-lg transition-shadow">
            <div className="w-12 h-12 bg-[#EAF5F8] rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-[#153B50]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-[#183344] mb-2">Agendamento</h3>
            <p className="text-gray-600">Agende teleconsultas e consultas presenciais para seus pets de forma rápida.</p>
          </div>

          <div className="bg-white p-6 rounded-xl border border-gray-100 hover:shadow-lg transition-shadow">
            <div className="w-12 h-12 bg-[#EAF5F8] rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-[#153B50]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-[#183344] mb-2">Receitas Digitais</h3>
            <p className="text-gray-600">Emita e gerencie receitas digitais assinadas com ICP-Brasil para teleconsultas.</p>
          </div>

          <div className="bg-white p-6 rounded-xl border border-gray-100 hover:shadow-lg transition-shadow">
            <div className="w-12 h-12 bg-[#EAF5F8] rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-[#153B50]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-[#183344] mb-2">Comissões</h3>
            <p className="text-gray-600">Acompanhe e gerencie as comissões e repasses dos seus veterinários parceiros.</p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Home;