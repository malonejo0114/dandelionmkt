alter table content_items
  add column if not exists meta_title text;

alter table content_items
  add column if not exists meta_description text;

alter table content_items
  add column if not exists og_image_path text;
