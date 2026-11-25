import assert from 'node:assert/strict';
import test from 'node:test';
import type { UserRole } from '../src/lib/auth/guards';
import {
  createAuthorizedPet,
  deleteAuthorizedPet,
  listAuthorizedPets,
  updateAuthorizedPet,
  type PetsDataClient,
} from '../src/lib/pets/server-pets';
import type { OrganizationRole } from '../src/types/database';
import type { Pet } from '../src/types/entities';

const TUTOR_A = '11111111-1111-4111-8111-111111111111';
const TUTOR_B = '22222222-2222-4222-8222-222222222222';
const VET_USER = '33333333-3333-4333-8333-333333333333';
const PARTNER_USER = '44444444-4444-4444-8444-444444444444';
const ADMIN_USER = '55555555-5555-4555-8555-555555555555';

const PET_A_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const PET_B_1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const PET_B_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';

const basePets: Pet[] = [
  {
    id: PET_A_1,
    owner_id: TUTOR_A,
    name: 'Pipoca',
    species: 'Cachorro',
    breed: 'SRD',
    birth_date: '2022-05-10',
    sex: 'female',
    notes: 'Peso aproximado: 8.5 kg',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: PET_B_1,
    owner_id: TUTOR_B,
    name: 'Thor',
    species: 'Cachorro',
    breed: 'Golden Retriever',
    birth_date: '2021-02-15',
    sex: 'male',
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: PET_B_2,
    owner_id: TUTOR_B,
    name: 'Mia',
    species: 'Gato',
    breed: 'Siamês',
    birth_date: '2023-08-01',
    sex: 'female',
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

function createMockClient(options?: {
  simulateLeakyDbOnOwnerQuery?: boolean;
  vetAppointmentPetIds?: string[];
  rolesByUser?: Record<string, UserRole>;
  orgRolesByUser?: Record<string, OrganizationRole[]>;
  approvedVets?: string[];
  onMutate?: { updated: string[]; deleted: string[] };
}): PetsDataClient {
  const roles = options?.rolesByUser ?? {
    [TUTOR_A]: 'tutor',
    [TUTOR_B]: 'tutor',
    [VET_USER]: 'veterinarian',
    [PARTNER_USER]: 'partner',
    [ADMIN_USER]: 'admin',
  };
  const orgRoles = options?.orgRolesByUser ?? {
    [VET_USER]: ['veterinarian'],
    [PARTNER_USER]: ['owner'],
  };
  const approvedVets = new Set(options?.approvedVets ?? [VET_USER]);
  const vetPetIds = options?.vetAppointmentPetIds ?? [PET_B_1];

  return {
    async getProfileRole(userId) {
      return { role: roles[userId] ?? 'tutor', error: null };
    },
    async getOrganizationRoles(userId) {
      return { roles: orgRoles[userId] ?? [], error: null };
    },
    async isApprovedVeterinarian(userId) {
      return { approved: approvedVets.has(userId), error: null };
    },
    async listPetsByOwner(ownerId, petId) {
      // Optionally simulate broken DB RLS returning all pets to prove server-side filter prevents leakage.
      const rows = options?.simulateLeakyDbOnOwnerQuery
        ? basePets
        : basePets.filter((pet) => pet.owner_id === ownerId);
      return {
        data: petId ? rows.filter((pet) => pet.id === petId) : rows,
        error: null,
      };
    },
    async listAppointmentPetIdsForVet(vetId) {
      return { petIds: vetId === VET_USER ? vetPetIds : [], error: null };
    },
    async listPetsByIds(petIds, petId) {
      const idSet = new Set(petIds);
      const rows = basePets.filter(
        (pet) => idSet.has(pet.id) && (!petId || pet.id === petId),
      );
      return { data: rows, error: null };
    },
    async listAllPets(petId) {
      return {
        data: petId ? basePets.filter((pet) => pet.id === petId) : basePets,
        error: null,
      };
    },
    async findPetById(petId) {
      return { data: basePets.find((pet) => pet.id === petId) ?? null, error: null };
    },
    async insertPet(values) {
      return {
        data: {
          id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
          ...values,
          created_at: '2026-01-02T00:00:00Z',
          updated_at: '2026-01-02T00:00:00Z',
        },
        error: null,
      };
    },
    async updatePet(petId, _ownerId, values) {
      options?.onMutate?.updated.push(petId);
      const existing = basePets.find((pet) => pet.id === petId) ?? null;
      return { data: existing ? { ...existing, ...values } : null, error: null };
    },
    async deletePet(petId) {
      options?.onMutate?.deleted.push(petId);
      return { error: null };
    },
  };
}

test('bloqueia usuário não autenticado com HTTP 401', async () => {
  const client = createMockClient();
  const res = await listAuthorizedPets(client, null);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.status, 401);
});

test('bloqueia usuário com e-mail não confirmado com HTTP 403', async () => {
  const client = createMockClient();
  const unconfirmedUser = { id: TUTOR_A, email_confirmed_at: null, confirmed_at: null };

  const getRes = await listAuthorizedPets(client, unconfirmedUser);
  assert.equal(getRes.ok, false);
  if (!getRes.ok) {
    assert.equal(getRes.status, 403);
    assert.equal(getRes.code, 'EMAIL_NOT_CONFIRMED');
  }

  const postRes = await createAuthorizedPet(client, unconfirmedUser, {
    name: 'Rex',
    species: 'Cachorro',
  });
  assert.equal(postRes.ok, false);
  if (!postRes.ok) assert.equal(postRes.status, 403);
});

test('tutor A recebe exclusivamente seus próprios pets mesmo quando a consulta simula retorno amplo', async () => {
  const client = createMockClient({ simulateLeakyDbOnOwnerQuery: true });
  const tutorA = { id: TUTOR_A, email_confirmed_at: '2026-01-01T00:00:00Z' };

  const res = await listAuthorizedPets(client, tutorA);
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.data.pets.length, 1);
    assert.equal(res.data.pets[0].id, PET_A_1);
    assert.equal(res.data.pets[0].owner_id, TUTOR_A);
  }
});

test('tutor A não acessa, não edita e não exclui pet do tutor B', async () => {
  const mutated = { updated: [] as string[], deleted: [] as string[] };
  const client = createMockClient({
    simulateLeakyDbOnOwnerQuery: true,
    onMutate: mutated,
  });
  const tutorA = { id: TUTOR_A, email_confirmed_at: '2026-01-01T00:00:00Z' };

  const getByIdRes = await listAuthorizedPets(client, tutorA, { petId: PET_B_1 });
  assert.equal(getByIdRes.ok, false);
  if (!getByIdRes.ok) assert.equal(getByIdRes.status, 404);

  const patchRes = await updateAuthorizedPet(client, tutorA, {
    id: PET_B_1,
    name: 'Alterado indevido',
  });
  assert.equal(patchRes.ok, false);
  if (!patchRes.ok) assert.equal(patchRes.status, 403);

  const deleteRes = await deleteAuthorizedPet(client, tutorA, PET_B_1);
  assert.equal(deleteRes.ok, false);
  if (!deleteRes.ok) assert.equal(deleteRes.status, 403);

  assert.deepEqual(mutated.updated, []);
  assert.deepEqual(mutated.deleted, []);
});

test('tutor e parceiro são bloqueados em scope=patients e scope=all', async () => {
  const client = createMockClient();
  const tutorA = { id: TUTOR_A, email_confirmed_at: '2026-01-01T00:00:00Z' };
  const partner = { id: PARTNER_USER, email_confirmed_at: '2026-01-01T00:00:00Z' };

  const tutorPatients = await listAuthorizedPets(client, tutorA, { scope: 'patients' });
  assert.equal(tutorPatients.ok, false);
  if (!tutorPatients.ok) assert.equal(tutorPatients.status, 403);

  const tutorAll = await listAuthorizedPets(client, tutorA, { scope: 'all' });
  assert.equal(tutorAll.ok, false);
  if (!tutorAll.ok) assert.equal(tutorAll.status, 403);

  const partnerPatients = await listAuthorizedPets(client, partner, { scope: 'patients' });
  assert.equal(partnerPatients.ok, false);
  if (!partnerPatients.ok) assert.equal(partnerPatients.status, 403);
});

test('veterinário acessa apenas pacientes vinculados a atendimentos próprios', async () => {
  const client = createMockClient({ vetAppointmentPetIds: [PET_B_1] });
  const vet = { id: VET_USER, email_confirmed_at: '2026-01-01T00:00:00Z' };

  const res = await listAuthorizedPets(client, vet, { scope: 'patients' });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.deepEqual(
      res.data.pets.map((p) => p.id),
      [PET_B_1],
    );
  }

  const unrelatedRes = await listAuthorizedPets(client, vet, {
    scope: 'patients',
    petId: PET_B_2,
  });
  assert.equal(unrelatedRes.ok, false);
  if (!unrelatedRes.ok) assert.equal(unrelatedRes.status, 403);
});

test('administrador pode consultar scope=all e criação força owner_id do usuário autenticado', async () => {
  const client = createMockClient();
  const admin = { id: ADMIN_USER, email_confirmed_at: '2026-01-01T00:00:00Z' };
  const tutorA = { id: TUTOR_A, email_confirmed_at: '2026-01-01T00:00:00Z' };

  const allRes = await listAuthorizedPets(client, admin, { scope: 'all' });
  assert.equal(allRes.ok, true);
  if (allRes.ok) assert.equal(allRes.data.pets.length, 3);

  const createRes = await createAuthorizedPet(client, tutorA, {
    owner_id: TUTOR_B, // tentativa de spoofing deve ser ignorada
    name: 'Luna',
    species: 'Gato',
    sex: 'female',
  });
  assert.equal(createRes.ok, true);
  if (createRes.ok) {
    assert.equal(createRes.data.pet.owner_id, TUTOR_A);
  }
});

test('listAuthorizedPets suporta busca textual (q) e paginação preservando isolamento por proprietário', async () => {
  const client = createMockClient({ simulateLeakyDbOnOwnerQuery: true });
  const admin = { id: ADMIN_USER, email_confirmed_at: '2026-01-01T00:00:00Z' };
  const tutorA = { id: TUTOR_A, email_confirmed_at: '2026-01-01T00:00:00Z' };

  const adminSearch = await listAuthorizedPets(client, admin, {
    scope: 'all',
    q: 'siames',
  });
  assert.equal(adminSearch.ok, true);
  if (adminSearch.ok) {
    assert.deepEqual(
      adminSearch.data.pets.map((p) => p.id),
      [PET_B_2],
    );
    assert.equal(adminSearch.data.pagination.total, 1);
  }

  const adminPage2 = await listAuthorizedPets(client, admin, {
    scope: 'all',
    page: 2,
    limit: 2,
  });
  assert.equal(adminPage2.ok, true);
  if (adminPage2.ok) {
    assert.equal(adminPage2.data.pets.length, 1);
    assert.equal(adminPage2.data.pagination.page, 2);
    assert.equal(adminPage2.data.pagination.totalPages, 2);
    assert.equal(adminPage2.data.pagination.hasPrevPage, true);
    assert.equal(adminPage2.data.pagination.hasNextPage, false);
  }

  // Tutor A buscando "Thor" (pet do Tutor B) não deve ver nada
  const tutorSearchOther = await listAuthorizedPets(client, tutorA, {
    scope: 'mine',
    q: 'Thor',
  });
  assert.equal(tutorSearchOther.ok, true);
  if (tutorSearchOther.ok) {
    assert.equal(tutorSearchOther.data.pets.length, 0);
    assert.equal(tutorSearchOther.data.pagination.total, 0);
  }
});
