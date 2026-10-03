-- Optional fixtures for a dedicated demo database ONLY.
-- Run after student-reviews.sql. Never run on the database used by real students.
begin;

create table if not exists public.demo_student_reviews (
  id uuid primary key,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  quote text not null check (char_length(btrim(quote)) between 20 and 2000),
  created_at timestamptz not null default now()
);
alter table public.demo_student_reviews enable row level security;
revoke all on public.demo_student_reviews from public, anon, authenticated;

insert into public.demo_student_reviews(id, display_name, quote)
values
  ('de000000-0000-4000-8000-000000000001', 'Ana',
   'Comecei sem saber quase nada de espanhol. As aulas são leves, bem explicadas e respeitam meu ritmo. Hoje já consigo conversar com muito mais confiança.'),
  ('de000000-0000-4000-8000-000000000002', 'Lucas',
   'Queria me preparar para uma viagem e gostei muito das atividades de conversação. Praticamos situações do dia a dia, e isso me ajudou a perder o medo de falar.'),
  ('de000000-0000-4000-8000-000000000003', 'Beatriz',
   'A professora explica com paciência e adapta as aulas aos meus objetivos. Gosto de aprender a gramática na prática, com exemplos que consigo usar nas conversas.')
on conflict (id) do nothing;

create or replace function public.get_public_reviews()
returns table(id uuid, display_name text, quote text)
language sql stable security definer set search_path = public as $$
  select reviews.id, reviews.display_name, reviews.quote
  from (
    select r.id, r.display_name, r.quote, r.created_at
    from student_reviews r join profiles p on p.id = r.student_id
    where r.status = 'approved' and p.is_active and p.role = 'student'
    union all
    select d.id, d.display_name, d.quote, d.created_at from demo_student_reviews d
  ) reviews
  order by reviews.created_at desc, reviews.id
$$;
revoke all on function public.get_public_reviews() from public;
grant execute on function public.get_public_reviews() to anon, authenticated;
commit;
