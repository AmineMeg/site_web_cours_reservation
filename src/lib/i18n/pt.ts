import type { Dictionary } from "./en";

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const pt: Dictionary = {
  locale: "pt-BR",
  common: {
    appName: "Espanhol com María",
    footerText: "Espanhol com María. Todos os direitos reservados.",
    save: "Salvar", saving: "Salvando…", cancel: "Cancelar", close: "Fechar", back: "Voltar",
    signOut: "Sair", error: "Algo deu errado. Tente novamente.",
    notAllowed: "Você não tem permissão para fazer isso.",
    notFound: "Página não encontrada",
    notFoundHelp: "Esta página não existe ou não está mais disponível.",
    home: "Voltar ao site",
    retry: "Tentar novamente",
    credits: (n) => `${n} ${plural(n, "crédito", "créditos")}`,
    timezoneNote: (tz) => tz === "America/Sao_Paulo"
      ? "Todos os horários são de Belo Horizonte (horário de Brasília, UTC−3)."
      : `Todos os horários seguem o fuso ${tz.replace(/_/g, " ")}.`,
    phone: "Telefone", email: "E-mail", name: "Nome", call: "Ligar", sendEmail: "Enviar e-mail",
  },
  nav: { blog: "Blog", about: "Sobre mim", testimonials: "Depoimentos", contact: "Contato", login: "Área do aluno" },
  landing: {
    hero: {
      badge: "Aulas de espanhol online e presenciais",
      title: "Fale espanhol com confiança desde a primeira aula",
      subtitle: "Aulas acolhedoras e personalizadas com uma professora nativa experiente. Aprenda no seu ritmo, para viajar, trabalhar, fazer provas ou pelo prazer de aprender.",
      ctaPrimary: "Comece a aprender", ctaSecondary: "Conheça sua professora",
    },
    about: {
      title: "Conheça sua professora",
      role: "Professora nativa de espanhol · Mais de 20 anos de experiência",
      paragraphs: [
        "¡Hola! Sou a María. Nasci em Salamanca, na Espanha, e ensino espanhol há mais de vinte anos. Nesse tempo, tive a alegria de acompanhar mais de mil alunos, de iniciantes a profissionais com uma rotina corrida, ajudando cada um a falar espanhol com confiança.",
        "Minhas aulas são acolhedoras, pacientes e feitas para você. Conversamos desde o primeiro dia, e a gramática e o vocabulário aparecem naturalmente, passo a passo. Seja para uma viagem, uma prova (DELE / SIELE), um novo trabalho ou para conversar com familiares e amigos que falam espanhol, vamos criar um plano a partir dos seus objetivos.",
        "Acredito que aprender um idioma deve ser como uma conversa entre amigos: leve, encorajadora e cheia de boas risadas. Estou ansiosa para conhecer você!",
      ],
      stats: [
        { value: "20+", label: "anos ensinando" },
        { value: "1.000+", label: "alunos satisfeitos" },
        { value: "A1–C2", label: "todos os níveis" },
      ],
    },
    testimonials: {
      title: "O que meus alunos dizem",
      items: [
        { quote: "Depois de anos usando aplicativos sem conseguir avançar, a María finalmente me fez falar. Suas aulas são organizadas e sempre divertidas. Tive minha primeira conversa de verdade em espanhol depois de apenas dois meses.", name: "Sarah T.", detail: "Do nível iniciante ao B1" },
        { quote: "Passei na prova DELE B2 na primeira tentativa graças às explicações claras e à paciência da María. Ela sabe exatamente onde temos dificuldade e como ajudar.", name: "João P.", detail: "Preparação para o DELE B2" },
        { quote: "A María adapta cada aula aos meus horários e objetivos. Agora faço minhas reuniões com clientes de Madri em espanhol, e eles percebem a diferença!", name: "Daniel K.", detail: "Espanhol para negócios" },
      ],
    },
    contact: {
      title: "Entre em contato para começar",
      company: "Empresa",
      subtitle: "Conte um pouco sobre você e seus objetivos. Responderei em até 48 horas para planejarmos sua primeira aula.",
      name: "Seu nome", email: "Seu e-mail", phone: "Seu telefone", message: "Mensagem",
      messagePlaceholder: "Ex.: Sou iniciante e quero viajar para a Espanha nas próximas férias.",
      submit: "Enviar meu pedido", sending: "Enviando…",
      success: "Obrigada! Sua mensagem foi enviada. Entrarei em contato em breve.",
      errors: { name: "Informe seu nome.", email: "Informe um e-mail válido.", phone: "Este telefone é muito longo.", message: "Sua mensagem é muito longa (máximo de 2.000 caracteres)." },
    },
    footer: { rights: (year) => `© ${year} Espanhol com María. Todos os direitos reservados.` },
  },
  login: {
    title: "Bem-vindo de volta", subtitle: "Entre para agendar suas aulas.",
    email: "E-mail", password: "Senha", submit: "Entrar", submitting: "Entrando…",
    error: "E-mail ou senha incorretos. Tente novamente.",
    inactive: "Sua conta está pausada. Entre em contato com sua professora.",
    noProfile: "Sua conta ainda não está pronta. Entre em contato com sua professora.",
    forgot: "Esqueceu sua senha?", backHome: "← Voltar ao site",
  },
  admin: {
    title: "Área da professora",
    nav: { contacts: "Novos contatos", students: "Meus alunos", schedule: "Minha agenda", messages: "Mensagens", website: "Ver meu site" },
    contacts: {
      title: "Novos contatos", intro: "Pessoas que querem aprender com você. Clique no botão verde para criar uma conta de aluno.",
      empty: "Nenhum novo contato por enquanto. 🌿", received: (date) => `Recebido em ${date}`,
      autoDelete: (days) => `Será excluído automaticamente em ${days} ${plural(days, "dia", "dias")} se nenhuma conta for criada.`,
      noMessage: "(Sem mensagem)", createAccount: "Criar conta de aluno", creating: "Criando conta…",
      created: (name) => `Pronto! ${name} agora é seu aluno. Um link seguro de ativação foi enviado por e-mail.`,
      emailExists: "Já existe uma conta de aluno com este e-mail.", remove: "Remover",
      removeConfirm: (name) => `Remover ${name} da lista? Esta ação não pode ser desfeita.`,
      removed: "Contato removido.",
    },
    students: {
      title: "Meus alunos", intro: "Clique no nome de um aluno para ver e editar suas informações.",
      empty: "Você ainda não tem alunos. Crie uma conta em “Novos contatos”.",
      search: "Buscar aluno", openProfile: "Abrir perfil", creditsLeft: "Aulas restantes",
      inactiveTitle: "Alunos pausados", paused: "Pausado",
    },
    credits: {
      label: "Aulas pré-pagas", amount: "Quantas?", add: "Adicionar", remove: "Remover",
      updated: (n) => `Salvo. Agora: ${n} ${plural(n, "aula", "aulas")}.`,
    },
    studentDetail: {
      back: "← Voltar aos meus alunos", editTitle: "Informações do aluno", fullName: "Nome completo",
      email: "E-mail (usado para entrar)", phone: "Telefone", objectives: "Objetivos de aprendizagem",
      notes: "Minhas anotações particulares (o aluno não pode ver)",
      active: "Aluno ativo (pode agendar aulas)", saved: "Alterações salvas.",
      upcoming: "Próximas aulas", noUpcoming: "Nenhuma aula agendada.",
      resetPassword: "Enviar link de acesso à conta",
      resetPasswordConfirm: "Enviar um link seguro de ativação ou redefinição de senha para este aluno?",
      resetPasswordDone: "Um link seguro de acesso foi enviado por e-mail.", notFound: "Aluno não encontrado.",
    },
    schedule: {
      title: "Minha agenda", tabs: { lessons: "Minhas aulas", hours: "Horários da semana", daysOff: "Dias de folga" },
      lessons: {
        intro: "Clique em uma aula para ver o aluno.", previousWeek: "← Semana anterior",
        nextWeek: "Próxima semana →", thisWeek: "Esta semana", noLessons: "Nenhuma aula",
        weekOf: (label) => `Semana de ${label}`,
      },
      hours: {
        intro: "Ative os dias em que você trabalha e escolha seus horários. Depois clique em “Salvar”.",
        working: "Trabalho", notWorking: "Folga", from: "Das", to: "Às",
        saved: "Seus horários da semana foram salvos.",
        invalid: (day) => `${day}: o horário de término deve ser depois do horário de início.`,
      },
      daysOff: {
        intro: "Clique em um dia do calendário para bloqueá-lo (férias, compromissos…).",
        previousMonth: "← Mês anterior", nextMonth: "Próximo mês →", selectDay: "Clique em um dia do calendário.",
        blockWholeDay: "Não posso trabalhar neste dia", unblockWholeDay: "Disponibilizar este dia novamente",
        wholeDayBlocked: "Este dia inteiro está bloqueado.",
        orBlockHours: "Ou bloqueie apenas alguns horários (clique para bloquear ou liberar):",
        notWorkingDay: "Você não trabalha neste dia da semana (veja “Horários da semana”).",
        blocked: "Bloqueado", free: "Livre",
        hasLessons: (n) => `⚠️ ${n} ${plural(n, "aula está agendada", "aulas estão agendadas")} neste dia. Bloquear não cancela as aulas. Se necessário, cancele em “Minhas aulas”.`,
        upcomingTitle: "Meus próximos dias de folga", none: "Nenhuma folga planejada.",
        wholeDay: "Dia inteiro", unblock: "Remover", past: "Este dia já passou.",
      },
    },
    lessonModal: {
      title: "Aula", student: "Aluno", objectives: "Objetivos de aprendizagem", noObjectives: "Nenhum objetivo informado ainda.",
      cancelClass: "Cancelar esta aula", cancelTitle: "Cancelar esta aula?",
      cancelHelp: "Escreva uma mensagem curta para o aluno. Ele receberá um e-mail e terá o crédito da aula devolvido.",
      cancelPlaceholder: "Ex.: Sinto muito, estou doente hoje. Vamos marcar outro dia!",
      confirmCancel: "Sim, cancelar a aula", cancelling: "Cancelando…", keep: "Não, manter a aula",
      cancelled: "A aula foi cancelada. O aluno recebeu 1 crédito de volta e foi avisado por e-mail.",
      messageRequired: "Escreva uma mensagem curta para o aluno.",
    },
    messages: { title: "Mensagens dos alunos", empty: "Nenhuma mensagem ainda.", from: (name) => `De ${name}`, reply: "Responder por e-mail" },
  },
  dashboard: {
    nav: { book: "Agendar uma aula", profile: "Meu perfil", contact: "Falar com minha professora" },
    hello: (name) => `Olá, ${name}!`,
    creditsBadge: (n) => `Você tem ${n} ${plural(n, "aula restante", "aulas restantes")}`,
    booking: {
      title: "Agendar uma aula", intro: "1. Escolha um dia.  2. Escolha um horário.  3. Confirme.",
      noCredits: "Você não tem aulas restantes. Fale com sua professora para comprar mais.",
      chooseDay: "Escolha um dia", chooseTime: "Escolha um horário", noSlotsDay: "Nenhum horário livre neste dia.",
      noSlots: "Não há horários livres no momento. Volte mais tarde.",
      confirmTitle: "Confirme sua aula", confirmText: (when) => `Agendar uma aula para ${when}? Você usará 1 crédito de aula.`,
      confirm: "Sim, agendar", booking: "Agendando…", success: "Sua aula está agendada! Até breve. 🎉",
      errors: {
        NO_CREDITS: "Você não tem aulas restantes. Fale com sua professora.",
        SLOT_NOT_AVAILABLE: "Este horário não está mais disponível. Escolha outro.",
        NOT_ALLOWED: "Sua conta não pode agendar aulas agora. Fale com sua professora.",
      },
      myLessons: "Minhas próximas aulas", noLessons: "Você ainda não tem aulas agendadas.", cancelledByTeacher: "Cancelada pela professora",
    },
    profile: {
      title: "Meu perfil", fullName: "Nome completo", email: "E-mail (para alterar, fale com sua professora)",
      phone: "Telefone", objectives: "Meus objetivos de aprendizagem",
      objectivesHelp: "O que você quer alcançar? (viagem, prova, trabalho, conversação…)",
      saved: "Seu perfil foi salvo.", passwordTitle: "Alterar minha senha",
      newPassword: "Nova senha (pelo menos 15 caracteres)", confirmPassword: "Repita a nova senha",
      passwordSave: "Alterar senha", passwordSaved: "Sua senha foi alterada.",
      passwordTooShort: "A senha deve ter pelo menos 15 caracteres.", passwordMismatch: "As senhas não são iguais.",
    },
    contact: {
      title: "Falar com minha professora", emailLabel: "E-mail da professora", formTitle: "Enviar uma mensagem",
      message: "Sua mensagem", send: "Enviar mensagem", sending: "Enviando…",
      sent: "Sua mensagem foi enviada. Sua professora responderá em breve.", empty: "Escreva uma mensagem.",
    },
  },
  emails: {
    newContact: {
      subject: (name) => `Novo pedido de contato de ${name}`,
      body: (c) => `Alguém quer aprender espanhol com você!\n\nNome: ${c.name}\nE-mail: ${c.email}\nTelefone: ${c.phone || "-"}\n\nMensagem:\n${c.message || "-"}\n\nAbra a área da professora para criar a conta do aluno.`,
    },
    credentials: {
      subject: "Sua conta de aulas de espanhol está pronta",
      body: (p) => `Olá, ${p.name}!\n\nBoas-vindas! Sua conta de aluno está pronta.\n\nAtive sua conta e escolha sua senha:\n${p.url}\n\nSeu e-mail de acesso: ${p.email}\n\nEste link tem prazo de validade e só pode ser usado uma vez. Depois, entre com seu e-mail e senha. Nunca compartilhe o link ou sua senha.\n\nAté breve!`,
    },
    passwordReset: {
      subject: "Redefina sua senha das aulas de espanhol",
      body: (p) => `Olá, ${p.name}!\n\nUse este link seguro para escolher uma nova senha:\n${p.url}\n\nEste link tem prazo de validade e só pode ser usado uma vez. Não o compartilhe. Se você não pediu esta alteração, ignore este e-mail.\n\nAté breve!`,
    },
    cancellation: {
      subject: (when) => `Sua aula de espanhol de ${when} foi cancelada`,
      body: (p) => `Olá, ${p.name}!\n\nSua aula de ${p.when} foi cancelada pela professora.\n\nMensagem da professora:\n"${p.message}"\n\nSeu crédito foi devolvido. Você pode agendar uma nova aula quando quiser.\n\nAté breve!`,
    },
    bookingConfirmation: {
      subject: (when) => `Aula agendada: ${when}`,
      body: (p) => `Olá, ${p.name}!\n\nSua aula de espanhol de ${p.when} está agendada.\n\nAté breve!`,
    },
    teacherNewBooking: {
      subject: (name, when) => `Nova aula: ${name} – ${when}`,
      body: (p) => `${p.name} agendou uma aula para ${p.when}.`,
    },
    studentMessage: {
      subject: (name) => `Nova mensagem de ${name}`,
      body: (p) => `${p.name} (${p.email}) enviou uma mensagem:\n\n${p.message}`,
    },
  },
};
