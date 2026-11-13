-- Fase 3: Buckets de Storage e políticas de acesso para laudos de exames, anexos clínicos e avatares de pets.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'exam-reports',
    'exam-reports',
    false,
    10485760,
    array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'clinical-attachments',
    'clinical-attachments',
    false,
    10485760,
    array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'pet-avatars',
    'pet-avatars',
    false,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp']
  )
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Convenção de caminho nos buckets privados:
--   pet-avatars:          <owner_id>/<pet_id>/<arquivo>
--   exam-reports:         <pet_id>/<exam_order_id>/<arquivo>
--   clinical-attachments: <pet_id>/<appointment_id>/<arquivo>

-- Policy: tutores donos do pet, veterinários que atendem o pet e administradores globais podem visualizar arquivos clínicos, laudos e avatares autorizados.
create policy "Authorized users can read DrVet storage objects"
  on storage.objects for select to authenticated
  using (
    bucket_id in ('pet-avatars', 'exam-reports', 'clinical-attachments')
    and (
      public.is_admin()
      or (
        bucket_id = 'pet-avatars'
        and (storage.foldername(name))[1] = (select auth.uid()::text)
      )
      or (
        bucket_id in ('exam-reports', 'clinical-attachments')
        and (
          exists (
            select 1
            from public.pets p
            where p.id::text = (storage.foldername(name))[1]
              and (
                p.owner_id = (select auth.uid())
                or public.can_access_pet_as_professional(p.id)
              )
          )
        )
      )
    )
  );

-- Policy: tutores podem enviar avatares de seus pets; veterinários aprovados (e tutores em exames) podem enviar arquivos nos respectivos atendimentos/pets.
create policy "Authorized users can upload DrVet storage objects"
  on storage.objects for insert to authenticated
  with check (
    bucket_id in ('pet-avatars', 'exam-reports', 'clinical-attachments')
    and (
      public.is_admin()
      or (
        bucket_id = 'pet-avatars'
        and (storage.foldername(name))[1] = (select auth.uid()::text)
      )
      or (
        bucket_id = 'exam-reports'
        and exists (
          select 1
          from public.pets p
          where p.id::text = (storage.foldername(name))[1]
            and (
              p.owner_id = (select auth.uid())
              or public.can_access_pet_as_professional(p.id)
            )
        )
      )
      or (
        bucket_id = 'clinical-attachments'
        and exists (
          select 1
          from public.pets p
          where p.id::text = (storage.foldername(name))[1]
            and public.can_access_pet_as_professional(p.id)
        )
      )
    )
  );

-- Policy: apenas quem enviou o arquivo (owner), o tutor dono do avatar ou o administrador global pode remover objetos do Storage.
create policy "Owners and admins can delete DrVet storage objects"
  on storage.objects for delete to authenticated
  using (
    bucket_id in ('pet-avatars', 'exam-reports', 'clinical-attachments')
    and (
      public.is_admin()
      or owner = (select auth.uid())
      or (
        bucket_id = 'pet-avatars'
        and (storage.foldername(name))[1] = (select auth.uid()::text)
      )
    )
  );
