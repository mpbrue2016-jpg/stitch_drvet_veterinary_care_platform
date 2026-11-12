export default function AgendamentoEdit() {
  return (
    <div className="max-w-5xl mx-auto p-6 bg-[#F5F8FA] min-h-screen">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#183344]">Edição de Teleconsulta</h1>
            <p className="text-[#718096] mt-2">Edite os detalhes da consulta de telemedicina DrVet.</p>
          </div>
          <button className="bg-[#153B50] hover:bg-[#0d2a3a] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            Salvar Alterações
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left border-b border-gray-200">
                <th className="py-3 px-4 text-sm font-semibold text-[#183344]">Campo</th>
                <th className="py-3 px-4 text-sm font-semibold text-[#183344]">Valor</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100 hover:bg-[#EAF5F8] transition-colors">
                <td className="py-3 px-4 text-sm font-medium text-[#183344]">ID do Pet</td>
                <td className="py-3 px-4 text-sm text-[#183344]">
                  <input
                    type="text"
                    placeholder="Ex: 12345"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#35C6B0]"
                  />
                </td>
              </tr>
              <tr className="border-b border-gray-100 hover:bg-[#EAF5F8] transition-colors">
                <td className="py-3 px-4 text-sm font-medium text-[#183344]">Veterinário</td>
                <td className="py-3 px-4 text-sm text-[#183344]">
                  <input
                    type="text"
                    placeholder="Nome do veterinário"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#35C6B0]"
                  />
                </td>
              </tr>
              <tr className="border-b border-gray-100 hover:bg-[#EAF5F8] transition-colors">
                <td className="py-3 px-4 text-sm font-medium text-[#183344]">Data</td>
                <td className="py-3 px-4 text-sm text-[#183344]">
                  <input
                    type="date"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#35C6B0]"
                  />
                </td>
              </tr>
              <tr className="border-b border-gray-100 hover:bg-[#EAF5F8] transition-colors">
                <td className="py-3 px-4 text-sm font-medium text-[#183344]">Horário</td>
                <td className="py-3 px-4 text-sm text-[#183344]">
                  <input
                    type="time"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#35C6B0]"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}