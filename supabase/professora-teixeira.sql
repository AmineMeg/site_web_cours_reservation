-- Run after website.sql. Safe to rerun; other homepage customizations are kept.
-- Does not change account names, email addresses, articles or student information.
begin;

with renamed as (
  select w.id, jsonb_object_agg(
    item.key,
    case when jsonb_typeof(item.value) = 'string' then to_jsonb(
      replace(replace(replace(
        item.value #>> '{}',
        'Espanhol com María', 'Espanhol com a Professora Teixeira'),
        'María Fernández', 'Professora Teixeira'),
        'María', 'Professora Teixeira')
    ) else item.value end
  ) as content
  from public.website_content w
  cross join lateral jsonb_each(w.content) item
  where w.id = 'home'
  group by w.id
)
update public.website_content w
set content = r.content, revision = w.revision + 1, updated_at = now()
from renamed r
where w.id = r.id and w.content is distinct from r.content;

commit;
