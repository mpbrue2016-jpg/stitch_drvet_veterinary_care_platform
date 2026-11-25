import type { OrganizationRole } from '../../types/database';

export type UserRole = 'tutor' | 'veterinarian' | 'partner' | 'admin';

export interface UserAuthContext {
  role: UserRole;
  organizationRoles: OrganizationRole[];
}

export interface EmailConfirmableUser {
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
}

export type NavSection = 'patient' | 'clinical' | 'partner' | 'admin' | 'account';

export type NavIconName =
  | 'dashboard'
  | 'calendar'
  | 'event'
  | 'health'
  | 'document'
  | 'payments'
  | 'bell';

export interface AppNavItem {
  href: string;
  label: string;
  icon: NavIconName;
  section: NavSection;
  badge?: string;
}

export const APP_NAVIGATION: readonly AppNavItem[] = [
  { href: '/', label: 'Início / Dashboard', icon: 'dashboard', section: 'patient' },
  { href: '/agendamento', label: 'Agendamentos', icon: 'event', section: 'patient' },
  { href: '/teleconsulta', label: 'Sala de Teleconsulta', icon: 'event', section: 'patient' },
  { href: '/pets', label: 'Meus Pets', icon: 'health', section: 'patient' },
  { href: '/prontuarios', label: 'Prontuários SOAP', icon: 'document', section: 'patient' },
  { href: '/carteira/vacinas', label: 'Carteira de vacinas', icon: 'health', section: 'patient' },
  { href: '/exames', label: 'Exames', icon: 'document', section: 'patient' },
  { href: '/assinaturas', label: 'Clube DrVet', icon: 'health', section: 'patient' },
  { href: '/pagamentos', label: 'Pagamentos & Checkout', icon: 'payments', section: 'patient' },
  { href: '/notificacoes', label: 'Notificações & Push', icon: 'bell', section: 'patient' },

  { href: '/painel/veterinario', label: 'Painel Veterinário', icon: 'dashboard', section: 'clinical' },
  { href: '/agenda', label: 'Agenda & Consultas', icon: 'calendar', section: 'clinical', badge: 'Hoje' },
  { href: '/receitas', label: 'Rascunhos de receita', icon: 'document', section: 'clinical' },

  { href: '/painel/parceiro', label: 'Painel Parceiro B2B', icon: 'dashboard', section: 'partner' },
  { href: '/parceiros', label: 'Parceiros B2B', icon: 'dashboard', section: 'partner' },
  { href: '/anuncios', label: 'DrVet Ads', icon: 'dashboard', section: 'partner' },

  { href: '/comissoes', label: 'Faturamento & Repasses', icon: 'payments', section: 'clinical' },
  { href: '/painel', label: 'Central & OFX', icon: 'document', section: 'clinical' },

  { href: '/admin/integracoes', label: 'Integrações & CDC', icon: 'dashboard', section: 'admin' },
  { href: '/admin', label: 'Admin Master', icon: 'dashboard', section: 'admin' },

  { href: '/cadastro', label: 'Cadastro QR', icon: 'health', section: 'account' },
  { href: '/apresentacao', label: 'Apresentação', icon: 'dashboard', section: 'account' },
  { href: '/perfil', label: 'Meu Perfil', icon: 'dashboard', section: 'account' },
] as const;

const PUBLIC_BYPASS_PATHS = ['/receitas/verificar'];
const ADMIN_ONLY_PATHS = ['/admin'];
const VET_ONLY_PATHS = ['/painel/veterinario', '/agenda', '/receitas'];
const PARTNER_ONLY_PATHS = ['/painel/parceiro', '/parceiros', '/anuncios'];
const OPERATIONS_PATHS = ['/comissoes', '/painel'];

function matchesPathPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isEmailConfirmedUser(
  user: EmailConfirmableUser | null | undefined,
): boolean {
  if (!user) return false;
  return Boolean(user.email_confirmed_at || user.confirmed_at);
}

export function sanitizeNextPath(
  rawPath: string | null | undefined,
  fallback = '/agendamento',
): string {
  if (!rawPath) return fallback;
  const trimmed = rawPath.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
    return fallback;
  }
  try {
    const parsed = new URL(trimmed, 'http://localhost');
    if (parsed.origin !== 'http://localhost') {
      return fallback;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function normalizeUserRole(value: unknown): UserRole {
  if (
    value === 'tutor' ||
    value === 'veterinarian' ||
    value === 'partner' ||
    value === 'admin'
  ) {
    return value;
  }
  return 'tutor';
}

export function hasClinicalOrgRole(organizationRoles: readonly OrganizationRole[]): boolean {
  return organizationRoles.includes('veterinarian');
}

export function hasOperationalOrgRole(organizationRoles: readonly OrganizationRole[]): boolean {
  return organizationRoles.some((role) =>
    ['owner', 'admin', 'veterinarian', 'billing', 'staff'].includes(role),
  );
}

export type RouteDeniedReason = 'admin' | 'role' | null;

export function getRouteAccessDenial(
  pathname: string,
  context: UserAuthContext,
): RouteDeniedReason {
  if (PUBLIC_BYPASS_PATHS.some((prefix) => matchesPathPrefix(pathname, prefix))) {
    return null;
  }

  if (ADMIN_ONLY_PATHS.some((prefix) => matchesPathPrefix(pathname, prefix))) {
    return context.role === 'admin' ? null : 'admin';
  }

  if (VET_ONLY_PATHS.some((prefix) => matchesPathPrefix(pathname, prefix))) {
    const allowed =
      context.role === 'admin' ||
      context.role === 'veterinarian' ||
      hasClinicalOrgRole(context.organizationRoles);
    return allowed ? null : 'role';
  }

  if (PARTNER_ONLY_PATHS.some((prefix) => matchesPathPrefix(pathname, prefix))) {
    const allowed = context.role === 'admin' || context.role === 'partner';
    return allowed ? null : 'role';
  }

  if (OPERATIONS_PATHS.some((prefix) => matchesPathPrefix(pathname, prefix))) {
    const allowed =
      context.role === 'admin' ||
      context.role === 'veterinarian' ||
      context.role === 'partner' ||
      hasOperationalOrgRole(context.organizationRoles);
    return allowed ? null : 'role';
  }

  return null;
}

export function canAccessPath(
  pathname: string,
  context: UserAuthContext,
): boolean {
  return getRouteAccessDenial(pathname, context) === null;
}

export function getAuthorizedNavItems(context: UserAuthContext): AppNavItem[] {
  return APP_NAVIGATION.filter((item) => canAccessPath(item.href, context));
}

export function getRoleLabel(role: UserRole): string {
  switch (role) {
    case 'admin':
      return 'Administrador';
    case 'veterinarian':
      return 'Veterinário';
    case 'partner':
      return 'Parceiro B2B';
    case 'tutor':
    default:
      return 'Tutor';
  }
}

export function canManagePartnerOrganization(
  role: UserRole,
  organizationRole: OrganizationRole | null | undefined,
): boolean {
  if (role === 'admin') return true;
  if (role !== 'partner') return false;
  return organizationRole === 'owner' || organizationRole === 'admin';
}

