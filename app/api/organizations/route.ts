import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';

const createOrganizationSchema = z
  .object({ name: z.string().trim().min(2).max(120) })
  .strict();

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Supabase não configurado.' },
      { status: 503 },
    );
  }

  const supabase = createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: 'Autenticação necessária.' }, { status: 401 });
  }

  const { data: memberships, error: membershipError } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', authData.user.id);

  if (membershipError) {
    return NextResponse.json(
      { error: 'Não foi possível carregar as organizações.' },
      { status: 500 },
    );
  }

  const organizationIds = memberships.map((membership) => membership.organization_id);
  if (organizationIds.length === 0) {
    return NextResponse.json({
      organizations: [],
      professionals: [],
      currentUserId: authData.user.id,
    });
  }

  const [{ data: organizations, error: organizationError }, { data: professionals, error: professionalError }] =
    await Promise.all([
      supabase
        .from('organizations')
        .select('id, name')
        .in('id', organizationIds),
      supabase
        .from('veterinarian_profiles')
        .select(
          'organization_id, user_id, registration_number, registration_region, specialty, status',
        )
        .in('organization_id', organizationIds),
    ]);

  if (organizationError || professionalError) {
    return NextResponse.json(
      { error: 'Não foi possível carregar os dados profissionais.' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    organizations: organizations.map((organization) => ({
      ...organization,
      role:
        memberships.find(
          (membership) => membership.organization_id === organization.id,
        )?.role ?? 'staff',
    })),
    professionals,
    currentUserId: authData.user.id,
  });
}

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Supabase não configurado.' },
      { status: 503 },
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = createOrganizationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Informe um nome válido para a organização.' },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: 'Autenticação necessária.' }, { status: 401 });
  }

  const { data, error } = await supabase.rpc('create_organization', {
    organization_name: parsed.data.name,
  });
  if (error || !data) {
    return NextResponse.json(
      { error: 'Não foi possível criar a organização.' },
      { status: error?.code === '42501' ? 403 : 500 },
    );
  }

  return NextResponse.json({ organization_id: data }, { status: 201 });
}
