import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canAccessPath,
  getAuthorizedNavItems,
  isEmailConfirmedUser,
  sanitizeNextPath,
} from '../src/lib/auth/guards';

test('tutor vê apenas menus permitidos e é bloqueado em rotas clínicas, parceiros e admin', () => {
  const tutorCtx = { role: 'tutor' as const, organizationRoles: [] };
  const hrefs = getAuthorizedNavItems(tutorCtx).map((item) => item.href);

  assert.ok(hrefs.includes('/agendamento'));
  assert.ok(hrefs.includes('/pets'));
  assert.ok(hrefs.includes('/perfil'));

  for (const forbidden of [
    '/painel/veterinario',
    '/agenda',
    '/receitas',
    '/painel/parceiro',
    '/parceiros',
    '/anuncios',
    '/comissoes',
    '/painel',
    '/admin',
    '/admin/integracoes',
  ]) {
    assert.equal(hrefs.includes(forbidden), false, `Tutor não deve ver ${forbidden}`);
    assert.equal(canAccessPath(forbidden, tutorCtx), false, `Tutor deve ser bloqueado em ${forbidden}`);
  }
});

test('parceiro B2B vê menus de parceiro mesmo com role owner na organização, sem vazar menus veterinários ou admin', () => {
  const partnerCtx = {
    role: 'partner' as const,
    organizationRoles: ['owner' as const],
  };
  const hrefs = getAuthorizedNavItems(partnerCtx).map((item) => item.href);

  assert.ok(hrefs.includes('/painel/parceiro'));
  assert.ok(hrefs.includes('/parceiros'));
  assert.ok(hrefs.includes('/anuncios'));
  assert.ok(hrefs.includes('/comissoes'));

  assert.equal(canAccessPath('/painel/veterinario', partnerCtx), false);
  assert.equal(canAccessPath('/agenda', partnerCtx), false);
  assert.equal(canAccessPath('/receitas', partnerCtx), false);
  assert.equal(canAccessPath('/admin', partnerCtx), false);
});

test('veterinário acessa menus clínicos sem vazar painel de parceiro ou admin', () => {
  const vetCtx = {
    role: 'veterinarian' as const,
    organizationRoles: ['veterinarian' as const],
  };

  assert.equal(canAccessPath('/painel/veterinario', vetCtx), true);
  assert.equal(canAccessPath('/agenda', vetCtx), true);
  assert.equal(canAccessPath('/receitas', vetCtx), true);
  assert.equal(canAccessPath('/comissoes', vetCtx), true);

  assert.equal(canAccessPath('/painel/parceiro', vetCtx), false);
  assert.equal(canAccessPath('/parceiros', vetCtx), false);
  assert.equal(canAccessPath('/anuncios', vetCtx), false);
  assert.equal(canAccessPath('/admin', vetCtx), false);
});

test('administrador tem acesso completo incluindo /admin e /admin/integracoes', () => {
  const adminCtx = { role: 'admin' as const, organizationRoles: [] };
  const hrefs = getAuthorizedNavItems(adminCtx).map((item) => item.href);

  assert.ok(hrefs.includes('/admin'));
  assert.ok(hrefs.includes('/admin/integracoes'));
  assert.ok(hrefs.includes('/painel/veterinario'));
  assert.ok(hrefs.includes('/painel/parceiro'));
  assert.equal(canAccessPath('/admin/integracoes', adminCtx), true);
});

test('verificação pública de receita (/receitas/verificar) permanece acessível sem bloqueio de papel', () => {
  assert.equal(
    canAccessPath('/receitas/verificar', { role: 'tutor', organizationRoles: [] }),
    true,
  );
});

test('isEmailConfirmedUser exige confirmação de e-mail e sanitizeNextPath bloqueia open redirects', () => {
  assert.equal(isEmailConfirmedUser(null), false);
  assert.equal(isEmailConfirmedUser({ email_confirmed_at: null, confirmed_at: null }), false);
  assert.equal(isEmailConfirmedUser({ email_confirmed_at: '2026-11-01T12:00:00Z' }), true);

  assert.equal(sanitizeNextPath('https://evil.example/phish'), '/agendamento');
  assert.equal(sanitizeNextPath('//evil.example/phish'), '/agendamento');
  assert.equal(sanitizeNextPath('/\\evil.example'), '/agendamento');
  assert.equal(sanitizeNextPath('/pets/novo?next=/assinaturas'), '/pets/novo?next=/assinaturas');
});
