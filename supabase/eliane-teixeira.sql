-- Rename only the former default identity and onboarding text; preserve custom content.
begin;
do $$
declare old_content jsonb; updated jsonb; k text;
begin
  select content into old_content from public.website_content where id = 'home' for update;
  if not found then return; end if;
  updated := old_content;
  foreach k in array array['siteName','teacherName','footerText','aboutParagraph1']
  loop
    if old_content ->> k like '%Professora Teixeira%' then
      updated := jsonb_set(updated, array[k], to_jsonb(replace(replace(replace(old_content ->> k,
        'Sou a Professora Teixeira', 'Sou Eliane Teixeira'),
        'com a Professora Teixeira', 'com Eliane Teixeira'), 'Professora Teixeira', 'Eliane Teixeira')));
    end if;
  end loop;
  if old_content ->> 'heroBadge' = 'Aulas de espanhol online e presenciais' then
    updated := jsonb_set(updated, '{heroBadge}', '"Aulas de espanhol online, em qualquer lugar do mundo"');
  end if;
  if old_content ->> 'contactSubtitle' = 'Conte um pouco sobre você e seus objetivos. Responderei em até 48 horas para planejarmos sua primeira aula.' then
    updated := jsonb_set(updated, '{contactSubtitle}', '"Conte um pouco sobre você e agende uma aula experimental online gratuita de 30 minutos."');
  end if;
  if updated is distinct from old_content then
    update public.website_content set content = updated, revision = revision + 1, updated_at = now() where id = 'home';
  end if;
end;
$$;
commit;
