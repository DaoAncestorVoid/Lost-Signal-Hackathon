-- Private report photos. The 5 MiB limit matches MAX_IMAGE_BYTES in lib/reports/images.ts.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'report-images',
  'report-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
);

-- Restrictive policies keep other permissive Storage policies from granting
-- access to this bucket. Other buckets are unaffected.
create policy "Guard report image uploads"
on storage.objects as restrictive for insert to public
with check (
  bucket_id <> 'report-images'
  or (
    (select auth.role()) = 'authenticated'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and storage.filename(name) ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
    and exists (
      select 1 from public.reports r
      where r.id::text = (storage.foldername(name))[2]
        and r.user_id = (select auth.uid())
    )
  )
);

create policy "Allow report owner image uploads"
on storage.objects for insert to authenticated
with check (bucket_id = 'report-images');

-- The uploader can sign an object before image_path is saved. After attachment,
-- any authenticated user who can read the report can sign its image.
create policy "Guard report image reads"
on storage.objects as restrictive for select to public
using (
  bucket_id <> 'report-images'
  or (
    (select auth.role()) = 'authenticated'
    and (
      (
        owner_id = (select auth.uid()::text)
        and (storage.foldername(name))[1] = (select auth.uid()::text)
      )
      or exists (
        select 1 from public.reports r
        where r.image_path = storage.objects.name
          and r.user_id::text = (storage.foldername(storage.objects.name))[1]
          and r.id::text = (storage.foldername(storage.objects.name))[2]
      )
    )
  )
);

create policy "Allow authenticated report image reads"
on storage.objects for select to authenticated
using (bucket_id = 'report-images');

-- No UPDATE policy is added. This guard prevents existing broad UPDATE policies
-- from allowing overwrites or moves into or out of the report-images bucket.
create policy "Block report image overwrites"
on storage.objects as restrictive for update to public
using (bucket_id <> 'report-images')
with check (bucket_id <> 'report-images');

-- Failed uploads and replaced images can be removed once no report references
-- the object. The Storage API performs the actual file deletion.
create policy "Guard report image cleanup"
on storage.objects as restrictive for delete to public
using (
  bucket_id <> 'report-images'
  or (
    (select auth.role()) = 'authenticated'
    and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and not exists (
      select 1 from public.reports r
      where r.image_path = storage.objects.name
    )
  )
);

create policy "Allow owner cleanup of unattached report images"
on storage.objects for delete to authenticated
using (bucket_id = 'report-images');
