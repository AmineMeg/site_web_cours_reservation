-- DEDICATED DEMO DATABASE ONLY. Run after all app migrations, including admin-removal.sql.
-- No passwords, login identities, real recipients or emails are created.
-- Fictional names/content are displayed naturally, without demo labels. Never run on the real-student database.
-- Change the confirmation below to true after checking the Supabase project.
-- Already seeded? Set refresh_articles := true as well to replace ONLY the three article texts.
-- Set refresh_demo_presentation := true to update names and remove legacy visible demo labels too.
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
  confirmed_demo boolean := true;
  refresh_articles boolean := true;
  refresh_demo_presentation boolean := true;
  refreshing boolean;
  uid uuid; cid uuid; bid uuid; batch uuid; slot timestamptz; finish timestamptz;
  anchor date; cfg public.app_settings; i int; j int;
  names text[] := array['Ana Carolina Silva','Lucas Oliveira','Beatriz Santos','Camila Ferreira','Rafael Costa',
    'Juliana Almeida','Pedro Henrique Lima','Mariana Ribeiro','Bruno Martins','Sofia Pereira'];
  contact_names text[] := array['Fernanda Souza','Gabriel Carvalho','Patrícia Gomes','Diego Rocha','Larissa Mendes',
    'Eduardo Barbosa','Renata Teixeira','Felipe Azevedo','Carolina Moreira','Thiago Nunes',
    'Isabela Cardoso','André Monteiro','Amanda Castro','Rodrigo Freitas','Letícia Fernandes',
    'Marcelo Batista','Natália Correia','Vinícius Duarte','Ana Carolina Silva','Daniela Ramos'];
  quotes text[] := array[
    'Eu tinha receio de falar espanhol, mas a Eliane me deixou à vontade desde a primeira aula. Hoje consigo participar de conversas sem traduzir cada palavra.',
    'As aulas são organizadas e cheias de exemplos que uso no trabalho. Gosto muito de praticar conversação e receber orientações claras sobre o que melhorar.',
    'Comecei a estudar para uma viagem e aprendi a pedir informações, conversar no hotel e fazer pedidos. As atividades foram adaptadas ao meu ritmo.',
    'A Eliane explica com paciência e sempre encontra uma maneira diferente de mostrar o conteúdo. A combinação de prática e revisão me ajuda muito.',
    'Estudar espanhol voltou a fazer parte da minha rotina. As conversas sobre assuntos do dia a dia tornam a aula leve e me incentivam a continuar.',
    'Os exercícios de escuta e pronúncia me ajudaram a perceber detalhes que antes passavam despercebidos. Sinto que estou falando com mais clareza.',
    'Gosto de poder trazer minhas dúvidas e situações reais para a aula. A professora transforma tudo em uma oportunidade de praticar e aprender.'];
  student_country text; zone text; doc jsonb; paragraphs text[]; headings text[]; article_title text; article_excerpt text;
begin
  if not confirmed_demo then raise exception 'Set confirmed_demo := true only on a dedicated demo database'; end if;
  perform pg_advisory_xact_lock(hashtext('public.book_lesson'));
  perform pg_advisory_xact_lock(hashtext('review:emails'));
  refreshing := exists(select 1 from public.demo_test_fixtures);
  if refreshing and not refresh_articles and not refresh_demo_presentation then
    raise notice 'Test fixtures already seeded. Existing edits/dates are preserved. Run remove-test-data.sql before regenerating.';
    return;
  end if;
  if refreshing and refresh_articles and (
    select count(*) from public.blog_posts b join public.demo_test_fixtures f on f.kind='blog' and f.id=b.id
    where b.slug in ('demo-test-article-1','demo-test-article-2','demo-test-article-3')
  ) <> 3 then raise exception 'Expected all three tracked demo articles. Refusing a partial refresh.'; end if;
  if not refreshing then
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
      jsonb_build_object('full_name',names[i], 'demo_fixture',true));
    update public.profiles set full_name=names[i], country=student_country,
      timezone=zone, objectives='Praticar conversação para viagens e situações do dia a dia.',
      teacher_notes='Prefere atividades de conversação com exemplos práticos e revisão de vocabulário.',
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
      values(bid,uid,names[i],quotes[i],
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
      'cancelled','Precisei mudar meus planos e não poderei participar da aula.',now()-interval '2 days',1,batch);
    insert into public.demo_test_fixtures values('booking',bid);
  end loop;

  for i in 1..20 loop
    cid:=gen_random_uuid();
    zone:=case when i%4=0 then 'America/New_York' when i%4=1 then 'Europe/Paris' else 'America/Sao_Paulo' end;
    insert into public.contacts(id,name,email,message,country,timezone,created_at,archived_at)
    values(cid,contact_names[i],'demo-contact-'||i||'@example.invalid',
      'Quero conhecer as aulas e praticar espanhol para viagens.',
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
        case when i between 15 and 17 then 'Não poderei participar neste horário.' else null end);
      insert into public.demo_test_fixtures values('trial',bid);
      if i=13 then update public.contacts set trial_declined_at=now() where id=cid; end if;
      if i=19 then update public.contacts set converted_at=now(),student_id='d3100000-0000-4000-8000-000000000001' where id=cid; end if;
    end if;
  end loop;
  for i in 1..12 loop
    bid:=gen_random_uuid();
    insert into public.messages(id,student_id,body,created_at)
    values(bid,('d3100000-0000-4000-8000-'||lpad(((i-1)%8+1)::text,12,'0'))::uuid,
      'Podemos praticar vocabulário de viagens na próxima aula? Obrigado!',
      now()-make_interval(hours=>i*3));
    insert into public.demo_test_fixtures values('message',bid);
  end loop;
  end if;
  if refreshing and refresh_demo_presentation then
    if exists(select 1 from public.demo_test_fixtures f join auth.users u on u.id=f.id
      join public.profiles p on p.id=u.id where f.kind='student'
        and (p.role<>'student' or u.email not like 'demo-student-%@example.invalid'
          or u.raw_user_meta_data->>'demo_fixture' is distinct from 'true'))
      then raise exception 'A demo account was repurposed. Refusing to rename it.'; end if;
    for i in 1..10 loop
      uid:=('d3100000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
      if exists(select 1 from public.demo_test_fixtures where kind='student' and id=uid) then
        update public.profiles set full_name=names[i],
          objectives=regexp_replace(objectives,'^\[TESTE\] *',''),
          teacher_notes=case when teacher_notes='Dados fictícios. Sem senha, sem acesso e sem telefone real.'
            then 'Prefere atividades de conversação com exemplos práticos e revisão de vocabulário.' else teacher_notes end
          where id=uid;
        update auth.users set raw_user_meta_data=jsonb_set(raw_user_meta_data,'{full_name}',to_jsonb(names[i])) where id=uid;
        update public.student_reviews r set display_name=names[i],quote=quotes[i]
          where r.student_id=uid and exists(select 1 from public.demo_test_fixtures f where f.kind='review' and f.id=r.id);
      end if;
    end loop;
    for i in 1..20 loop
      update public.contacts c set name=contact_names[i],message=regexp_replace(message,'^\[TESTE\] *','')
        where c.email='demo-contact-'||i||'@example.invalid'
          and exists(select 1 from public.demo_test_fixtures f where f.kind='contact' and f.id=c.id);
    end loop;
    update public.messages m set body=regexp_replace(body,'^\[MENSAGEM DE TESTE [0-9]+\] *','')
      where exists(select 1 from public.demo_test_fixtures f where f.kind='message' and f.id=m.id);
    update public.bookings b set cancel_message='Precisei mudar meus planos e não poderei participar da aula.'
      where cancel_message='[TESTE] Cancelamento para verificar o histórico.'
        and exists(select 1 from public.demo_test_fixtures f where f.kind='booking' and f.id=b.id);
    update public.trial_bookings b set cancel_message='Não poderei participar neste horário.'
      where cancel_message='[TESTE] Ensaio cancelado.'
        and exists(select 1 from public.demo_test_fixtures f where f.kind='trial' and f.id=b.id);
    update public.blog_posts b set title=regexp_replace(title,'^\[TESTE\] *',''),
      document=jsonb_set(document,'{content}',coalesce((
        select jsonb_agg(node order by ord) from jsonb_array_elements(document->'content') with ordinality as nodes(node,ord)
        where node is distinct from jsonb_build_object('type','paragraph','content',jsonb_build_array(
          jsonb_build_object('type','text','text','Artigo de demonstração para testar o blog e preparar atividades de espanhol.')))
      ),'[]'::jsonb))
      where exists(select 1 from public.demo_test_fixtures f where f.kind='blog' and f.id=b.id);
  end if;
  if not refreshing or refresh_articles then
  for i in 1..3 loop
    bid:=gen_random_uuid();
    article_title:=case i when 1 then 'Espanhol para viajar: do aeroporto ao restaurante'
      when 2 then 'Como praticar conversação em espanhol sem decorar tudo'
      else 'Espanhol para brasileiros: falsos amigos e pronúncia na prática' end;
    article_excerpt:=case i
      when 1 then 'Prepare-se para uma viagem com expressões em espanhol, diálogos de hotel e restaurante e um exercício para levar à sua próxima aula.'
      when 2 then 'Uma rotina simples para falar com mais confiança: perguntas, respostas completas, estratégias para pedir ajuda e prática guiada com a professora.'
      else 'Entenda palavras que confundem brasileiros, pratique sons do espanhol e aprenda a usar ser e estar com exemplos e um exercício comentado.' end;
    headings:=case i
      when 1 then array['Prepare o espanhol que você realmente vai usar','No aeroporto e no hotel','No restaurante: peça com clareza','Uma atividade para sua próxima aula']
      when 2 then array['Comece com assuntos que fazem parte da sua vida','Transforme respostas curtas em conversas','Como continuar quando faltar uma palavra','Uma rotina de quinze minutos']
      else array['Palavras parecidas nem sempre significam a mesma coisa','Escute os sons antes de tentar imitá-los','Ser e estar: observe o sentido da frase','Exercício prático com respostas comentadas'] end;
    paragraphs:=case i
      when 1 then array[
        'Uma viagem é uma ótima motivação para aprender espanhol, mas tentar memorizar centenas de palavras de uma vez costuma ser cansativo. Comece pelas situações mais prováveis: encontrar o transporte, apresentar-se na recepção e pedir uma refeição. O objetivo inicial não é falar sem erros, e sim conseguir explicar o que você precisa e compreender as informações principais.',
        'Antes da aula, anote seu destino, o tipo de viagem e três situações em que gostaria de se sentir mais seguro. Quem viaja a trabalho pode precisar confirmar um horário; quem passeia com a família talvez queira perguntar sobre ingressos. Esse contexto permite praticar diálogos úteis, em vez de estudar uma lista de frases sem ligação com sua realidade.',
        'Cumprimentos e pequenas expressões ajudam a começar: “Buenos días” significa bom dia; “Por favor” e “Muchas gracias” demonstram gentileza. Para chamar alguém com educação, experimente “Disculpe”. Se não entender, diga “¿Puede repetir más despacio, por favor?”. Pratique as frases em voz alta, com pausas naturais, sem transformar cada palavra em uma tradução isolada.',
        'Ao desembarcar, você pode perguntar “¿Dónde está la salida?” para encontrar a saída ou “¿Dónde puedo tomar un taxi?” para localizar um táxi. A resposta pode conter “a la derecha”, à direita, e “a la izquierda”, à esquerda. Durante a aula, peça à professora que use um mapa simples e alterne as direções: assim você pratica a compreensão, não apenas a pergunta.',
        'Na recepção do hotel, uma apresentação curta costuma bastar: “Hola, tengo una reserva a nombre de Ana Silva”. Para saber o horário do café da manhã, pergunte “¿A qué hora es el desayuno?”. Se precisar de acesso à internet, use “¿Cuál es la contraseña del wifi?”. Treine também a leitura de números e horários, pois essas informações aparecem em quase toda viagem.',
        'Veja um diálogo possível: recepcionista — “¿Tiene una reserva?”; hóspede — “Sí, a nombre de Ana Silva”; recepcionista — “¿Puede mostrarme su documento?”; hóspede — “Claro, aquí está”. Depois de compreender a situação, troque o nome, acrescente a quantidade de noites e pergunte sobre o horário de saída. Uma pequena mudança já transforma a repetição em prática de comunicação.',
        'No restaurante, comece com “Una mesa para dos, por favor”. Para escolher, pergunte “¿Qué me recomienda?” ou “¿Qué lleva este plato?”, isto é, quais ingredientes o prato contém. Ao fazer o pedido, “Quisiera una sopa y agua sin gas” é uma opção educada. Em muitos lugares você ouvirá “la carta” para o cardápio; o vocabulário pode variar conforme o país.',
        'Se houver uma restrição alimentar, fale de forma direta: “Soy alérgico al maní” ou “Soy alérgica al maní” indica alergia a amendoim; na Espanha, você também pode encontrar a palavra “cacahuete”. Confirme que o atendente compreendeu. Aprender uma frase não substitui cuidados médicos nem garante ausência de contaminação: leve suas orientações habituais e procure confirmação adequada.',
        'Ao terminar, diga “La cuenta, por favor”. Para perguntar sobre a forma de pagamento, use “¿Puedo pagar con tarjeta?”. Uma atividade interessante é montar um cardápio pequeno com três pratos e dois tipos de bebida. A professora faz o papel de atendente e você escolhe, pergunta sobre um ingrediente e encerra o atendimento. Depois, invertam os papéis.',
        'Prepare uma simulação com três etapas: chegada ao hotel, pedido no restaurante e pergunta sobre transporte. Escreva apenas palavras-chave em um papel, não o diálogo inteiro. Tente falar por um minuto em cada etapa. Se faltar uma palavra, explique com o vocabulário que já conhece ou peça ajuda em espanhol. Essa habilidade também faz parte da aprendizagem.',
        'Para revisar, responda em voz alta: como você pediria para alguém repetir devagar? Como informaria que tem uma reserva? Como pediria a conta? Possíveis respostas são “¿Puede repetir más despacio?”, “Tengo una reserva a nombre de…” e “La cuenta, por favor”. Compare suas respostas com o contexto e não apenas com uma tradução palavra por palavra.',
        'Leve suas dúvidas à próxima aula e informe o país que pretende visitar. A professora pode adaptar pronúncia, formas de tratamento e vocabulário ao destino. Você não precisa esperar ter um espanhol perfeito para praticar: precisa de oportunidades para ouvir, responder e ajustar sua mensagem. Cada diálogo compreendido é mais um recurso para aproveitar a viagem com autonomia.']
      when 2 then array[
        'Entender uma explicação e conseguir conversar são habilidades relacionadas, mas não idênticas. Na conversa, você precisa escutar, escolher palavras e organizar uma resposta em pouco tempo. Por isso, estudar regras é importante, mas também é necessário praticar o uso delas em situações reais. Não espere conhecer toda a gramática para começar a dizer o que pensa.',
        'Escolha um tema familiar: sua rotina, sua família, seu trabalho ou uma atividade de que gosta. Prepare cinco palavras úteis e uma pergunta. Para falar da rotina, por exemplo, você pode usar “trabajo”, “estudio”, “por la mañana”, “por la tarde” e “descanso”. Com esse conjunto pequeno, já é possível construir mensagens pessoais e compreender perguntas relacionadas.',
        'Comece com modelos simples: “Trabajo por la mañana”, “Estudio español por la tarde” e “Los domingos descanso”. Depois, adapte o conteúdo à sua vida. Se uma frase não representa sua rotina, mude-a. A prática fica mais significativa quando você comunica algo verdadeiro, em vez de repetir um exemplo que não tem relação com seus interesses.',
        'Uma resposta de uma palavra pode encerrar a conversa rapidamente. Se alguém pergunta “¿Te gusta viajar?”, você pode dizer “Sí, me gusta viajar porque quiero conocer otras culturas”. A combinação de resposta, motivo e detalhe cria espaço para continuar. Não é necessário usar estruturas difíceis: “porque”, “pero” e “también” já ajudam a conectar ideias.',
        'Pratique uma sequência: “¿Qué haces en tu tiempo libre?”; “Me gusta cocinar”; “¿Qué te gusta cocinar?”; “Me gusta preparar pasta y probar recetas nuevas”. Observe como a segunda pergunta aproveita uma informação da resposta anterior. Durante a aula, a professora pode alternar o papel de quem pergunta e de quem responde para treinar os dois lados da conversa.',
        'Outra estratégia é acrescentar uma pergunta ao final da resposta: “Me gusta leer. ¿Y a ti?”. Para concordar, experimente “A mí también”; para apresentar outra preferência, “Yo prefiero…”. Essas pequenas expressões ajudam a participar sem fazer um discurso longo. Escute o que a outra pessoa disse e escolha uma continuação que realmente combine com o assunto.',
        'Esquecer uma palavra não significa que você perdeu a conversa. Use uma descrição: se não lembrar “paraguas”, pode dizer “Es un objeto que usamos cuando llueve”. Talvez sua explicação não seja perfeita, mas ela permite negociar o significado. Essa prática ensina a trabalhar com o vocabulário disponível, em vez de depender de uma tradução imediata.',
        'Tenha algumas frases de apoio: “¿Cómo se dice isso en español?” não é uma frase totalmente em espanhol; prefira “¿Cómo se dice esto en español?”. Também são úteis “No entiendo esta palabra” e “¿Puedes darme un ejemplo?”. Com tratamento mais formal, use “¿Puede darme un ejemplo?”. A professora pode ajudar a escolher a forma adequada ao contexto.',
        'Quando perceber um erro, corrija com calma e continue. Por exemplo: “Ayer voy… mejor dicho, ayer fui al mercado”. Não é preciso interromper toda frase para revisar cada detalhe. Na prática guiada, vocês podem escolher um foco por vez, como um tempo verbal ou uma expressão. Isso evita transformar a conversa em uma sequência de interrupções.',
        'Experimente uma rotina de quinze minutos: nos primeiros cinco, ouça um diálogo curto adequado ao seu nível; nos cinco seguintes, repita algumas frases e observe o ritmo; nos últimos cinco, fale sobre uma situação parecida com palavras próprias. Use materiais que consiga compreender com apoio. Um áudio muito difícil pode gerar frustração sem oferecer prática aproveitável.',
        'Uma vez por semana, grave uma resposta de aproximadamente um minuto a uma pergunta conhecida, como “¿Cómo es tu rutina?”. Escute e escolha dois pontos para revisar: uma palavra que faltou e uma frase que gostaria de organizar melhor. Guarde a gravação para comparar com versões futuras. A comparação deve acompanhar seu próprio progresso, não o ritmo de outra pessoa.',
        'Leve uma pergunta, uma gravação ou uma situação concreta para a próxima aula. A professora poderá propor perguntas adicionais, corrigir padrões recorrentes e ampliar o vocabulário aos poucos. A confiança não surge de decorar um texto inteiro, mas de experimentar conversas em um ambiente acolhedor. Uma rotina possível de manter é mais útil do que um plano intenso que logo será abandonado.']
      else array[
        'A proximidade entre português e espanhol pode facilitar a leitura, mas também cria armadilhas. Algumas palavras parecem familiares e têm outro sentido; alguns sons pedem uma articulação diferente. Reconhecer essas diferenças ajuda a evitar mal-entendidos, sem tratar o português como um problema. Sua língua materna é um ponto de apoio, desde que você observe os contextos.',
        'Em espanhol, “embarazada” significa grávida, e não envergonhada. Para expressar vergonha, você pode dizer “Me da vergüenza” ou, conforme a situação, “Estoy avergonzado” e “Estoy avergonzada”. Outro exemplo é “exquisito”: em muitos contextos descreve algo delicioso ou de qualidade refinada. Para dizer que algo é estranho, “raro” ou “extraño” pode ser mais adequado.',
        '“Oficina” costuma significar escritório, enquanto uma oficina mecânica é um “taller mecánico”. “Apellido” significa sobrenome; “apodo” pode indicar apelido. Em vez de memorizar apenas pares de palavras, crie frases: “Trabajo en una oficina” e “Mi apellido es Silva”. A frase mostra como a palavra funciona e oferece um exemplo que você pode usar numa conversa.',
        'A letra h normalmente não representa som em espanhol: observe “hola”, “hotel” e “hora”. Na palavra “hola”, a pronúncia começa na vogal. Para praticar, escute um exemplo curto, repita e compare. Evite acrescentar um som apenas porque a escrita sugere uma letra conhecida. Primeiro perceba o modelo; depois, tente reproduzi-lo com naturalidade.',
        'O ñ de “español” e “mañana” pode ser aproximado ao som de nh do português em muitas pronúncias. Já o r de “pero” e o rr de “perro” distinguem palavras: “pero” significa mas, enquanto “perro” significa cachorro. Trabalhe esse contraste aos poucos com a professora. A descrição escrita ajuda, mas ouvir e receber orientação é essencial para ajustar a articulação.',
        'A pronúncia também varia entre regiões. Em grande parte da América Latina, “casa” e “caza” têm o mesmo som de s; em muitas regiões da Espanha, o z e o c antes de e ou i têm um som diferente. Nenhuma dessas variedades precisa ser apresentada como a única correta. Escolha modelos ligados ao seu objetivo e aprenda a reconhecer outras formas de falar.',
        'Para brasileiros, ser e estar parecem familiares, mas não basta copiar cada frase do português. Em espanhol, “Soy brasileña” identifica nacionalidade; “Estoy en Brasil” localiza a pessoa; “Estoy cansada” descreve um estado. Observe o que a frase comunica: identidade, localização, condição ou característica. A escolha depende do sentido, não apenas de uma regra sobre duração.',
        'Compare “Ana es aburrida” e “Ana está aburrida”. A primeira descreve Ana como uma pessoa considerada entediante; a segunda diz que ela está sentindo tédio. “La comida es buena” pode avaliar a qualidade da comida, enquanto “La comida está buena” pode comentar que ela está gostosa. Estudar pares em contexto mostra diferenças que uma lista de traduções costuma esconder.',
        'A ideia de que ser é sempre permanente e estar é sempre temporário é uma simplificação que pode confundir. Para localizar pessoas e objetos, usamos normalmente estar: “El libro está en la mesa”. Para indicar onde acontece um evento, usamos ser: “La clase es en línea” ou “La reunión es en la biblioteca”. Leve exemplos concretos para discutir, em vez de tentar resolver tudo com uma única regra.',
        'Complete estas frases: 1) “Mi ___ es Souza”, para informar o sobrenome; 2) “Trabajo en una ___”, para dizer que trabalha em um escritório; 3) “Hoy ___ cansado”, para falar de como se sente; 4) “El libro ___ en la mesa”, para indicar localização. Antes de olhar as respostas, leia cada situação e explique em português o sentido que deseja comunicar.',
        'Respostas possíveis: 1) “apellido”; 2) “oficina”; 3) “estoy”; 4) “está”. Observe que cansado pode mudar para cansada conforme quem fala. Agora crie uma frase pessoal com cada estrutura e leia em voz alta. Na aula, a professora pode mudar uma informação e pedir uma nova resposta, para verificar se você compreendeu o uso e não apenas memorizou a solução.',
        'Monte um caderno de contrastes com três colunas: palavra ou estrutura em espanhol, significado no contexto e uma frase própria. Inclua também um áudio ou uma anotação de pronúncia quando isso ajudar. Revise poucos exemplos por vez e use-os em conversas. O objetivo não é eliminar imediatamente toda influência do português, mas construir um espanhol mais claro com observação e prática acompanhada.']
    end;
    doc:=jsonb_build_object('type','doc','content','[]'::jsonb);
    for j in 1..array_length(paragraphs,1) loop
      if (j-1)%3=0 then
        doc:=jsonb_set(doc,'{content}',(doc->'content')||jsonb_build_array(
          jsonb_build_object('type','heading','attrs',jsonb_build_object('level',2),'content',
            jsonb_build_array(jsonb_build_object('type','text','text',headings[(j-1)/3+1])))));
      end if;
      doc:=jsonb_set(doc,'{content}',(doc->'content')||jsonb_build_array(
        jsonb_build_object('type','paragraph','content',jsonb_build_array(jsonb_build_object('type','text','text',paragraphs[j])))));
    end loop;
    if refreshing then
      update public.blog_posts b set title=article_title,excerpt=article_excerpt,document=doc
      where b.slug='demo-test-article-'||i and exists(
        select 1 from public.demo_test_fixtures f where f.kind='blog' and f.id=b.id);
    else
      insert into public.blog_posts(id,title,slug,excerpt,document,status)
      values(bid,article_title,'demo-test-article-'||i,article_excerpt,doc,
        case when i=3 then 'draft' else 'published' end);
      insert into public.demo_test_fixtures values('blog',bid);
    end if;
  end loop;
  end if;
  if refreshing then
    raise notice 'Refreshed requested demo presentation/content. IDs, URLs, statuses, schedules, credits and unrelated records were preserved.';
  else
    raise notice 'Seeded 20 contacts, 10 non-login students, 7 reviews (4 approved/3 pending), 3 articles, 12 messages and lesson/credit scenarios. No emails sent.';
  end if;
end;
$$;
select f.kind,count(*) as fixture_count from public.demo_test_fixtures f group by f.kind order by f.kind;
commit;
