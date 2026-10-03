-- Run after website.sql and student-password-login.sql, before deployment.
-- Intentionally replaces ALL saved homepage text, as requested.
-- Back up website_content first. Do not rerun after editing the translated page.
-- Booked lessons keep their UTC instants. Weekly hours and all date/time
-- blocks are now interpreted as Belo Horizonte local time.
begin;

alter table public.app_settings alter column timezone set default 'America/Sao_Paulo';
update public.app_settings set timezone = 'America/Sao_Paulo' where id = 1;

insert into public.website_content (id, content, revision, updated_at)
values ('home', $homepage${
  "siteName": "Espanhol com María",
  "teacherName": "María Fernández",
  "footerText": "Espanhol com María. Todos os direitos reservados.",
  "heroBadge": "Aulas de espanhol online e presenciais",
  "heroTitle": "Fale espanhol com confiança desde a primeira aula",
  "heroSubtitle": "Aulas acolhedoras e personalizadas com uma professora nativa experiente. Aprenda no seu ritmo, para viajar, trabalhar, fazer provas ou pelo prazer de aprender.",
  "heroPrimary": "Comece a aprender",
  "heroSecondary": "Conheça sua professora",
  "aboutTitle": "Conheça sua professora",
  "aboutRole": "Professora nativa de espanhol · Mais de 20 anos de experiência",
  "aboutParagraph1": "¡Hola! Sou a María. Nasci em Salamanca, na Espanha, e ensino espanhol há mais de vinte anos. Nesse tempo, tive a alegria de acompanhar mais de mil alunos, de iniciantes a profissionais com uma rotina corrida, ajudando cada um a falar espanhol com confiança.",
  "aboutParagraph2": "Minhas aulas são acolhedoras, pacientes e feitas para você. Conversamos desde o primeiro dia, e a gramática e o vocabulário aparecem naturalmente, passo a passo. Seja para uma viagem, uma prova (DELE / SIELE), um novo trabalho ou para conversar com familiares e amigos que falam espanhol, vamos criar um plano a partir dos seus objetivos.",
  "aboutParagraph3": "Acredito que aprender um idioma deve ser como uma conversa entre amigos: leve, encorajadora e cheia de boas risadas. Estou ansiosa para conhecer você!",
  "stat1Value": "20+",
  "stat1Label": "anos ensinando",
  "stat2Value": "1.000+",
  "stat2Label": "alunos satisfeitos",
  "stat3Value": "A1–C2",
  "stat3Label": "todos os níveis",
  "testimonialsTitle": "O que meus alunos dizem",
  "testimonial1Quote": "Depois de anos usando aplicativos sem conseguir avançar, a María finalmente me fez falar. Suas aulas são organizadas e sempre divertidas. Tive minha primeira conversa de verdade em espanhol depois de apenas dois meses.",
  "testimonial1Name": "Sarah T.",
  "testimonial1Detail": "Do nível iniciante ao B1",
  "testimonial2Quote": "Passei na prova DELE B2 na primeira tentativa graças às explicações claras e à paciência da María. Ela sabe exatamente onde temos dificuldade e como ajudar.",
  "testimonial2Name": "João P.",
  "testimonial2Detail": "Preparação para o DELE B2",
  "testimonial3Quote": "A María adapta cada aula aos meus horários e objetivos. Agora faço minhas reuniões com clientes de Madri em espanhol, e eles percebem a diferença!",
  "testimonial3Name": "Daniel K.",
  "testimonial3Detail": "Espanhol para negócios",
  "contactTitle": "Entre em contato para começar",
  "contactSubtitle": "Conte um pouco sobre você e seus objetivos. Responderei em até 48 horas para planejarmos sua primeira aula.",
  "contactName": "Seu nome",
  "contactEmail": "Seu e-mail",
  "contactPhone": "Seu telefone",
  "contactMessage": "Mensagem",
  "contactPlaceholder": "Ex.: Sou iniciante e quero viajar para a Espanha nas próximas férias.",
  "contactSubmit": "Enviar meu pedido"
}$homepage$::jsonb, 1, now())
on conflict (id) do update
set content = excluded.content,
    revision = public.website_content.revision + 1,
    updated_at = now();

commit;
