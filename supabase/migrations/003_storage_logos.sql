-- 003_storage_logos
-- Public-read bucket for provider logos. Each user may only write inside their own folder: logos/<auth.uid()>/...

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Public URLs work without a SELECT policy. Owners can see (and so replace or delete) their own files only,
-- which keeps the bucket from being listable by everyone.
create policy "logos owner read" on storage.objects
  for select to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "logos owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.current_user_role()) = 'provider'
  );

create policy "logos owner update" on storage.objects
  for update to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'logos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "logos owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = (select auth.uid())::text);
