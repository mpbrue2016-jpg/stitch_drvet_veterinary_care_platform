'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { APP_NAVIGATION } from '@/lib/auth/guards';

interface Crumb {
  label: string;
  href: string;
  current?: boolean;
}

const staticSegmentLabels: Record<string, string> = {
  painel: 'Painel',
  veterinario: 'Veterinário',
  pets: 'Meus Pets',
  novo: 'Novo Cadastro',
  agendamento: 'Agendamentos',
  edit: 'Novo Agendamento',
  agenda: 'Agenda Semanal',
  teleconsulta: 'Sala de Teleconsulta',
  prontuarios: 'Prontuário Clínico',
  receitas: 'Receita Digital',
  verificar: 'Verificação',
  exames: 'Exames',
  carteira: 'Carteira',
  vacinas: 'Vacinação',
  assinaturas: 'Clube DrVet',
  pagamentos: 'Pagamentos',
  comissoes: 'Comissões & Repasses',
  parceiros: 'Portal de Parceiros',
  admin: 'Master Admin',
  integracoes: 'Integrações',
  notificacoes: 'Notificações',
  perfil: 'Meu Perfil',
  apresentacao: 'Apresentação',
  cadastro: 'Credenciamento',
};

function resolveSegmentLabel(segment: string, fullHref: string): string {
  const navMatch = APP_NAVIGATION.find((item) => item.href === fullHref);
  if (navMatch) return navMatch.label;
  if (staticSegmentLabels[segment]) return staticSegmentLabels[segment];
  if (/^[0-9a-f-]{16,}$/i.test(segment)) {
    return 'Detalhes';
  }
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

export function Breadcrumbs() {
  const pathname = usePathname();
  if (!pathname || pathname === '/') return null;

  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  const crumbs: Crumb[] = [{ label: 'Início', href: '/' }];
  let currentPath = '';
  segments.forEach((segment, index) => {
    currentPath += `/${segment}`;
    const isLast = index === segments.length - 1;
    crumbs.push({
      label: resolveSegmentLabel(segment, currentPath),
      href: currentPath,
      current: isLast,
    });
  });

  return (
    <nav
      aria-label="Breadcrumb"
      className="mb-4 flex flex-wrap items-center gap-1.5 text-xs font-medium text-slate-500 print:hidden"
    >
      <ol className="flex flex-wrap items-center gap-1.5">
        {crumbs.map((crumb, idx) => (
          <li className="flex items-center gap-1.5" key={crumb.href}>
            {idx > 0 && (
              <span aria-hidden="true" className="text-slate-400">
                /
              </span>
            )}
            {crumb.current ? (
              <span
                aria-current="page"
                className="font-semibold text-[#153b50]"
              >
                {crumb.label}
              </span>
            ) : (
              <Link
                className="rounded px-1 py-0.5 transition-colors hover:bg-[#ebf5ff] hover:text-[#087a68] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#087a68]"
                href={crumb.href}
              >
                {crumb.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
