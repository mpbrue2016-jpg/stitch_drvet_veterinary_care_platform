export default function Comissoes() {
  return (
    <div className="max-w-5xl mx-auto p-6 bg-[#F5F8FA] min-h-screen">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#183344]">Comissões Veterinárias</h1>
            <p className="text-[#718096] mt-2">Gerencie comissões e repasses de veterinários da DrVet.</p>
          </div>
          <button className="bg-[#153B50] hover:bg-[#0d2a3a] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            Novo Repasse
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left border-b border-gray-200">
                <th className="py-3 px-4 text-sm font-semibold text-[#183344]">Veterinário</th>
                <th className="py-3 px-4 text-sm font-semibold text-[#183344]">Consultas</th>
                <th className="py-3 px-4 text-sm font-semibold text-[#183344]">Valor Total</th>
                <th className="py-3 px-4 text-sm font-semibold text-[#183344]">Comissão</th>
                <th className="py-3 px-4 text-sm font-semibold text-[#183344]">Status</th>
                <th className="py-3 px-4 text-sm font-semibold text-[#183344]">Data</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100 hover:bg-[#EAF5F8] transition-colors">
                <td className="py-3 px-4 text-sm text-[#183344]">Dra. Camila Silva</td>
                <td className="py-3 px-4 text-sm text-[#183344]">12</td>
                <td className="py-3 px-4 text-sm text-[#183344]">R$ 1.200,00</td>
                <td className="py-3 px-4 text-sm text-[#183344]">R$ 240,00</td>
                <td className="py-3 px-4 text-sm">
                  <span className="px-2 py-1 bg-[#16A36A]/10 text-[#16A36A] rounded-full text-xs font-medium">Pago</span>
                </td>
                <td className="py-3 px-4 text-sm text-[#183344]">10/11/2026</td>
              </tr>
              <tr className="border-b border-gray-100 hover:bg-[#EAF5F8] transition-colors">
                <td className="py-3 px-4 text-sm text-[#183344]">Dra. Ana Paula</td>
                <td className="py-3 px-4 text-sm text-[#183344]">8</td>
                <td className="py-3 px-4 text-sm text-[#183344]">R$ 800,00</td>
                <td className="py-3 px-4 text-sm text-[#183344]">R$ 160,00</td>
                <td className="py-3 px-4 text-sm">
                  <span className="px-2 py-1 bg-[#F2A93B]/10 text-[#F2A93B] rounded-full text-xs font-medium">Pendente</span>
                </td>
                <td className="py-3 px-4 text-sm text-[#183344]">09/11/2026</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}