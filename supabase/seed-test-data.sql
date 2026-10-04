-- DEDICATED DEMO DATABASE ONLY. Run after all app migrations, including admin-removal.sql.
-- No passwords, login identities, real recipients or emails are created.
-- Public reviews/articles are visibly fictional. Never run on the real-student database.
-- Change the confirmation below to true after checking the Supabase project.
begin;
create table if not exists public.demo_test_fixtures (
  kind text not null check (kind in ('student','contact','booking','trial','message','review','blog','credit')),
  id uuid not null,
  primary key(kind,id)
);
alter table public.demo_test_fixtures enable row level security;
revoke all on public.demo_test_fixtures from public, anon, authenticated, service_role;

do $$
declare
  confirmed_demo boolean := false;
  uid uuid; cid uuid; bid uuid; batch uuid; slot timestamptz; finish timestamptz;
  anchor date; cfg public.app_settings; i int; j int;
  names text[] := array['Ana','Lucas','Beatriz','Camila','Rafael','Juliana','Pedro','Mariana','Bruno','Sofia'];
  student_country text; zone text; doc jsonb; paragraphs text[];
begin
  if not confirmed_demo then raise exception 'Set confirmed_demo := true only on a dedicated demo database'; end if;
  perform pg_advisory_xact_lock(hashtext('public.book_lesson'));
  perform pg_advisory_xact_lock(hashtext('review:emails'));
  if exists(select 1 from public.demo_test_fixtures) then
    raise notice 'Test fixtures already seeded. Existing edits/dates are preserved. Run remove-test-data.sql before regenerating.';
    return;
  end if;
  select * into cfg from public.app_settings where id=1;
  anchor := (now() at time zone cfg.timezone)::date;
  -- Abort instead of taking over an existing user, even if the email looks fictional.
  if exists(select 1 from auth.users where email like 'demo-student-%@example.invalid'
    or id::text like 'd3100000-0000-4000-8000-%') then raise exception 'DEMO_USER_COLLISION'; end if;

  for i in 1..10 loop
    uid := ('d3100000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid;
    zone := case i when 2 then 'America/New_York' when 3 then 'Europe/Paris'
      when 4 then 'Asia/Tokyo' else 'America/Sao_Paulo' end;
    student_country := case i when 2 then 'Estados Unidos' when 3 then 'França' when 4 then 'Japão' else 'Brasil' end;
    insert into auth.users(id,email,encrypted_password,email_confirmed_at,banned_until,raw_user_meta_data)
    values(uid,'demo-student-' || i || '@example.invalid','',null,'2099-12-31 23:59:59+00'::timestamptz,
      jsonb_build_object('full_name','[TESTE] ' || names[i], 'demo_fixture',true));
    update public.profiles set full_name='[TESTE] ' || names[i], country=student_country,
      timezone=zone, objectives='[TESTE] Praticar conversação para viagens e situações do dia a dia.',
      teacher_notes='Dados fictícios. Sem senha, sem acesso e sem telefone real.',
      is_active=(i<>10) where id=uid;
    insert into public.demo_test_fixtures values('student',uid);
    batch := gen_random_uuid();
    insert into public.credit_batches(id,student_id,remaining,added_at,expires_at)
    values(batch,uid,case when i in (9,10) then 0 else 3 end,now()-interval '6 months',now()+interval '6 months');
    insert into public.demo_test_fixtures values('credit',batch);
    if i in (1,2) then
      bid := gen_random_uuid();
      insert into public.credit_batches(id,student_id,remaining,added_at,expires_at)
      values(bid,uid,1,now()-interval '1 month',now()+interval '3 days');
      insert into public.demo_test_fixtures values('credit',bid);
    elsif i=9 then
      bid := gen_random_uuid();
      insert into public.credit_batches(id,student_id,remaining,added_at,expires_at)
      values(bid,uid,2,now()-interval '13 months',now()-interval '1 month');
      insert into public.demo_test_fixtures values('credit',bid);
    end if;
    perform public.sync_credit_balance(uid);
    -- Five completed regular lessons make each of the seven reviewers truly eligible.
    for j in 1..(case when i<=7 then 5 when i=8 then 4 else 0 end) loop
      slot := ((anchor - (i*7+j)) + time '10:00') at time zone cfg.timezone;
      if exists(select 1 from public.bookings where status='booked' and starts_at<slot+make_interval(mins=>cfg.lesson_minutes) and ends_at>slot)
        or exists(select 1 from public.trial_bookings where status='booked' and starts_at<slot+make_interval(mins=>cfg.lesson_minutes) and ends_at>slot)
        then raise exception 'HISTORICAL_SLOT_COLLISION'; end if;
      bid := gen_random_uuid();
      insert into public.bookings(id,student_id,starts_at,ends_at,credits_used,credit_batch_id)
      values(bid,uid,slot,slot+make_interval(mins=>cfg.lesson_minutes),1,batch);
      insert into public.demo_test_fixtures values('booking',bid);
    end loop;
    if i<=7 then
      bid := gen_random_uuid();
      insert into public.student_reviews(id,student_id,display_name,quote,consent_at,status)
      values(bid,uid,'[TESTE] ' || names[i],
        '[AVALIAÇÃO FICTÍCIA DE TESTE] As aulas são acolhedoras, claras e adaptadas ao meu ritmo. Pratico conversação e ganho confiança para usar o espanhol.',
        now(),case when i<=4 then 'approved' else 'pending' end);
      insert into public.demo_test_fixtures values('review',bid);
    end if;
    if i<=8 then
      -- Choose real available regular slots: never bypass blocks, notice, grid or overlaps.
      select candidates.start_at into slot from (
        select (d::date+w.start_time+make_interval(mins=>n*cfg.lesson_minutes)) at time zone cfg.timezone start_at
        from generate_series(anchor::timestamp,anchor::timestamp+make_interval(days=>cfg.booking_window_days),interval '1 day') d
        join public.weekly_availability w on w.weekday=extract(dow from d)::int and w.is_active
        cross join lateral generate_series(0,floor(extract(epoch from(w.end_time-w.start_time))/(cfg.lesson_minutes*60))::int-1) n
      ) candidates where public.duration_slot_available(candidates.start_at,cfg.lesson_minutes)
      order by candidates.start_at limit 1;
      if slot is null then raise exception 'Not enough availability: configure weekly hours and booking window before seeding'; end if;
      bid := gen_random_uuid(); finish:=slot+make_interval(mins=>cfg.lesson_minutes);
      if i=8 then
        insert into public.bookings(id,student_id,starts_at,ends_at,credits_used)
        values(bid,uid,slot,finish,0);
      else
        update public.credit_batches set remaining=remaining-1 where id=batch;
        insert into public.bookings(id,student_id,starts_at,ends_at,credits_used,credit_batch_id)
        values(bid,uid,slot,finish,1,batch);
        perform public.sync_credit_balance(uid);
      end if;
      insert into public.demo_test_fixtures values('booking',bid);
    end if;
    bid := gen_random_uuid();
    insert into public.bookings(id,student_id,starts_at,ends_at,status,cancel_message,cancelled_at,credits_used,credit_batch_id)
    values(bid,uid,((anchor-1)+time '15:00') at time zone cfg.timezone,
      (((anchor-1)+time '15:00') at time zone cfg.timezone)+make_interval(mins=>cfg.lesson_minutes),
      'cancelled','[TESTE] Cancelamento para verificar o histórico.',now()-interval '2 days',1,batch);
    insert into public.demo_test_fixtures values('booking',bid);
  end loop;

  for i in 1..20 loop
    cid:=gen_random_uuid();
    zone:=case when i%4=0 then 'America/New_York' when i%4=1 then 'Europe/Paris' else 'America/Sao_Paulo' end;
    insert into public.contacts(id,name,email,message,country,timezone,created_at,archived_at)
    values(cid,'[TESTE] Contato ' || lpad(i::text,2,'0'),'demo-contact-'||i||'@example.invalid',
      '[TESTE] Quero conhecer as aulas e praticar espanhol para viagens.',
      case when i%4=0 then 'Estados Unidos' when i%4=1 then 'França' else 'Brasil' end,zone,
      case when i=18 then now()-interval '35 days' else now()-make_interval(days=>i%8) end,
      case when i in (14,20) then now() else null end);
    insert into public.demo_test_fixtures values('contact',cid);
    if i<=5 or i between 6 and 10 then
      -- Predictable tokens are DEMO ONLY: token = i written as a 64-digit hex string.
      insert into public.trial_links(contact_id,token_hash,expires_at)
      values(cid,encode(sha256(convert_to(lpad(to_hex(i),64,'0'),'UTF8')),'hex'),
        case when i=5 then now()-interval '1 day' else now()+interval '7 days' end);
    end if;
    if i between 6 and 10 then
      select (s->>'startsAt')::timestamptz into slot
        from jsonb_array_elements(public.trial_available_slots()) s order by (s->>'startsAt')::timestamptz limit 1;
      if slot is null then raise exception 'Not enough free trial slots: configure more weekly hours before seeding'; end if;
      bid:=gen_random_uuid();
      insert into public.trial_bookings(id,contact_id,starts_at,ends_at) values(bid,cid,slot,slot+interval '30 minutes');
      insert into public.demo_test_fixtures values('trial',bid);
    elsif i between 11 and 17 or i in (19,20) then
      slot:=((anchor-(100+i))+time '11:00') at time zone cfg.timezone;
      bid:=gen_random_uuid();
      insert into public.trial_bookings(id,contact_id,starts_at,ends_at,status,cancel_message)
      values(bid,cid,slot,slot+interval '30 minutes',case when i between 15 and 17 then 'cancelled'::public.booking_status else 'booked'::public.booking_status end,
        case when i between 15 and 17 then '[TESTE] Ensaio cancelado.' else null end);
      insert into public.demo_test_fixtures values('trial',bid);
      if i=13 then update public.contacts set trial_declined_at=now() where id=cid; end if;
      if i=19 then update public.contacts set converted_at=now(),student_id='d3100000-0000-4000-8000-000000000001' where id=cid; end if;
    end if;
  end loop;
  for i in 1..12 loop
    bid:=gen_random_uuid();
    insert into public.messages(id,student_id,body,created_at)
    values(bid,('d3100000-0000-4000-8000-'||lpad(((i-1)%8+1)::text,12,'0'))::uuid,
      '[MENSAGEM DE TESTE '||i||'] Podemos praticar vocabulário de viagens na próxima aula? Obrigado!',
      now()-make_interval(hours=>i*3));
    insert into public.demo_test_fixtures values('message',bid);
  end loop;
  for i in 1..3 loop
    bid:=gen_random_uuid();
    paragraphs:=case i
      when 1 then array[
        'Antes de viajar, pratique situações simples: pedir informações, cumprimentar alguém e fazer um pedido no restaurante. Não é preciso conhecer todas as palavras para começar uma conversa.',
        'Monte uma lista curta com expressões úteis, como buenos días, por favor e muchas gracias. Diga cada expressão em voz alta e imagine uma situação em que você poderia usá-la.',
        'Uma boa atividade é simular uma chegada ao hotel. Apresente-se, confirme sua reserva e pergunte o horário do café da manhã. Na aula, podemos repetir o diálogo e adaptar o vocabulário ao seu destino.']
      when 2 then array[
        'Cinco minutos de prática diária podem ajudar a tornar o espanhol parte da rotina. Escolha um tema conhecido, como sua família, seu trabalho ou o que você fez durante o fim de semana.',
        'Grave uma mensagem curta e escute novamente. Identifique uma expressão que gostaria de melhorar, sem tentar corrigir tudo de uma vez. O objetivo é comunicar uma ideia e ganhar confiança.',
        'Leve suas dúvidas para a próxima aula. Podemos transformar sua mensagem em uma conversa, acrescentar perguntas e praticar maneiras diferentes de responder. Consistência vale mais do que perfeição.']
      else array[
        'Este é um rascunho fictício para testar o editor e a publicação. O plano da próxima aula combina vocabulário de alimentos, leitura de um cardápio e uma conversa em um restaurante.',
        'A atividade inicial será organizar palavras por categorias: bebidas, pratos principais e sobremesas. Depois, cada aluno poderá explicar suas preferências com frases curtas.',
        'Antes de publicar, a professora pode revisar o título, acrescentar exemplos e conferir a apresentação. Este texto deve continuar invisível no blog público enquanto estiver como rascunho.']
    end;
    doc:=jsonb_build_object('type','doc','content',jsonb_build_array(
      jsonb_build_object('type','heading','attrs',jsonb_build_object('level',2),'content',
        jsonb_build_array(jsonb_build_object('type','text','text','Conteúdo fictício para testar o blog'))),
      jsonb_build_object('type','paragraph','content',jsonb_build_array(jsonb_build_object('type','text','text',
        'Este artigo é uma demonstração fictícia, não uma publicação real.'))),
      jsonb_build_object('type','paragraph','content',jsonb_build_array(jsonb_build_object('type','text','text',paragraphs[1]))),
      jsonb_build_object('type','paragraph','content',jsonb_build_array(jsonb_build_object('type','text','text',paragraphs[2]))),
      jsonb_build_object('type','paragraph','content',jsonb_build_array(jsonb_build_object('type','text','text',paragraphs[3])))));
    insert into public.blog_posts(id,title,slug,excerpt,document,status)
    values(bid,'[TESTE] '||case i when 1 then 'Espanhol para sua primeira viagem' when 2 then 'Pratique conversação todos os dias' else 'Rascunho de uma nova aula' end,
      'demo-test-article-'||i,'Conteúdo fictício para testar a apresentação e edição dos artigos.',doc,
      case when i=3 then 'draft' else 'published' end);
    insert into public.demo_test_fixtures values('blog',bid);
  end loop;
  raise notice 'Seeded 20 contacts, 10 non-login students, 7 reviews (4 approved/3 pending), 3 articles, 12 messages and lesson/credit scenarios. No emails sent.';
end;
$$;
select f.kind,count(*) as fixture_count from public.demo_test_fixtures f group by f.kind order by f.kind;
commit;
