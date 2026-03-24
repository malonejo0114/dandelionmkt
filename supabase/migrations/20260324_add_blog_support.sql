alter table content_items
  drop constraint if exists content_items_type_check;

alter table content_items
  add constraint content_items_type_check
  check (type in ('portfolio', 'service', 'blog'));

alter table content_items
  add column if not exists published_at timestamptz;

update content_items
set published_at = created_at
where status = 'published'
  and published_at is null;
