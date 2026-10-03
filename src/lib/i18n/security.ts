/** Texts of the account security area (/security). Keep keys when translating. */
export const securityText = {
  title: "Segurança da conta",
  continue: "Continuar",
  back: "Voltar",
  signOut: "Sair",
  error: "Não foi possível concluir o pedido. Tente novamente.",
  tooManyAttempts: "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.",
  invalidCode: "Código incorreto. Confira o código no aplicativo e tente novamente.",

  codeLabel: "Código de 6 dígitos do aplicativo autenticador",
  verifyButton: "Confirmar",
  verifying: "Verificando…",

  setupTitle: "Proteja sua conta",
  setupIntro:
    "Para sua segurança, a conta da professora exige uma segunda etapa ao entrar: um código de 6 dígitos de um aplicativo autenticador gratuito, como Google Authenticator ou Microsoft Authenticator.",
  replaceTitle: "Usar um novo aplicativo autenticador",
  replaceIntro:
    "Configure seu novo celular ou aplicativo. O autenticador anterior deixará de funcionar assim que o novo for confirmado.",
  setupStart: "Começar configuração",
  setupStarting: "Preparando…",
  scanQr: "1. Abra seu aplicativo autenticador e escaneie este QR code.",
  manualKey: "Não consegue escanear? Digite esta chave no aplicativo:",
  enterCode: "2. Digite o código de 6 dígitos mostrado no aplicativo.",
  confirmSetup: "Confirmar",
  setupExpired: "Esta configuração expirou. Comece novamente.",
  alreadyEnrolled: "Já existe um aplicativo autenticador ativo nesta conta.",

  codesTitle: "Guarde seus códigos de recuperação",
  codesIntro:
    "Se perder seu celular, um destes códigos, junto com sua senha, permite configurar um novo autenticador. Cada código funciona uma vez. Eles só aparecem agora: imprima, baixe ou anote e guarde em um lugar seguro.",
  codesCopy: "Copiar",
  codesCopied: "Copiado",
  codesDownload: "Baixar",
  codesFileName: "codigos-de-recuperacao.txt",
  codesSaved: "Guardei meus códigos de recuperação",
  codesStoreFailed:
    "Seu autenticador está ativo, mas não foi possível salvar os códigos de recuperação. Abra “Segurança da conta” para criar novos códigos.",

  verifyTitle: "Digite seu código de segurança",
  verifyIntro: "Abra seu aplicativo autenticador e digite o código de 6 dígitos deste site.",
  lostDevice: "Perdeu seu celular? Use um código de recuperação",

  reauthTitle: "Confirme sua identidade",
  reauthIntro: "Para esta alteração importante, digite um novo código de 6 dígitos do aplicativo autenticador.",

  recoverTitle: "Usar um código de recuperação",
  recoverIntro:
    "Digite sua senha e um dos códigos de recuperação. Por segurança, vamos encerrar todas as sessões, remover o autenticador antigo e pedir que configure um novo.",
  passwordLabel: "Senha",
  recoveryCodeLabel: "Código de recuperação",
  recoverButton: "Redefinir meu autenticador",
  recovering: "Verificando…",
  recoverFailed: "A senha ou o código de recuperação está incorreto.",
  recoverNoCodes:
    "Ficou sem códigos? Peça ao responsável pelo site para redefinir seu autenticador após confirmar sua identidade.",
  backToCode: "Voltar ao código de 6 dígitos",

  settingsTitle: "Segurança da conta",
  settingsIntro: "Seu acesso é protegido por sua senha e por um aplicativo autenticador.",
  studentSettingsIntro: "Gerencie sua senha e os dispositivos conectados. Alunos não precisam de aplicativo autenticador.",
  factorTitle: "Aplicativo autenticador",
  factorOn: "Ativado — um código de 6 dígitos é exigido sempre que você entra.",
  replaceFactor: "Usar um novo celular ou aplicativo",
  codesSectionTitle: "Códigos de recuperação",
  codesRemaining: (n: number) => (n === 1 ? "Resta 1 código de recuperação não utilizado." : `Restam ${n} códigos de recuperação não utilizados.`),
  codesLow: "Seus códigos estão acabando. Crie novos códigos.",
  regenerateCodes: "Criar novos códigos de recuperação",
  regenerateIntro: "Criar novos códigos cancela todos os códigos anteriores.",
  regenerating: "Criando…",
  sessionTitle: "Dispositivos conectados",
  sessionLimits: "Por segurança, você sai automaticamente após um período sem atividade e, de qualquer forma, algumas horas depois de entrar.",

  sessionEndsAt: (when: string) => `Este acesso termina, no máximo, em ${when}.`,
  signOutOthers: "Sair dos meus outros dispositivos",
  signingOut: "Saindo…",
  signedOutOthers: "Seus outros dispositivos foram desconectados.",
  signOutAll: "Sair de todos os dispositivos (inclusive deste)",
  activityTitle: "Atividade recente de segurança",
  noActivity: "Nenhuma atividade recente.",
  backToApp: "Voltar à minha área",
  studentMfaReset: "O autenticador do aluno foi removido e todos os acessos foram encerrados.",
  resetStudentMfa: "Redefinir autenticador do aluno",

  events: {
    "mfa.enrolled": "Autenticador configurado",
    "mfa.factor_replaced": "Autenticador substituído",
    "mfa.recovery_codes_generated": "Novos códigos de recuperação criados",
    "mfa.recovery_code_used": "Código de recuperação utilizado",
    "mfa.recovery_code_rejected": "Código de recuperação incorreto",
    "mfa.reset_by_recovery": "Autenticador redefinido com código de recuperação",
    "mfa.reset_by_teacher": "Autenticador redefinido pela professora",
    "mfa.verify_failed": "Código de segurança incorreto",
    "mfa.verified": "Acesso com código de segurança",
    "reauth.succeeded": "Identidade confirmada",
    "login.password_ok": "Senha aceita",
    "session.revoked_all": "Saída de todos os dispositivos",
    "session.revoked_others": "Outros dispositivos desconectados",
    "session.expired": "Acesso expirado",
    "profile.sensitive_update": "Informações da conta alteradas",
    "credits.changed": "Créditos de aula alterados",
    "password.changed": "Senha alterada",
    "password.reset_completed": "Senha redefinida por link de e-mail",
    "password.reset_requested": "E-mail de redefinição de senha solicitado",
    "invite.sent": "Convite enviado",
    "invite.accepted": "Convite aceito",
    "admin.student_updated": "Conta atualizada pela professora",
  } as Record<string, string>,

  alertSubject: "Alerta de segurança da sua conta",
  alertBody: (what: string) =>
    `Olá!\n\nEsta é uma mensagem automática: ${what}\n\nSe não foi você, entre em contato com a professora ou com o responsável pelo site imediatamente.\n`,
  alerts: {
    mfa_enrolled: "um aplicativo autenticador foi configurado na sua conta.",
    mfa_replaced: "o autenticador da sua conta foi substituído.",
    recovery_used: "um código de recuperação foi usado para redefinir seu autenticador. Todos os acessos foram encerrados.",
    codes_regenerated: "novos códigos de recuperação foram criados para sua conta. Os códigos anteriores não funcionam mais.",
    signed_out_everywhere: "sua conta foi desconectada de todos os dispositivos.",
  },
};

export type SessionEndReason =
  | "idle_timeout"
  | "absolute_timeout"
  | "revoked"
  | "signed_out"
  | "account_inactive"
  | "account_missing"
  | "signed_out_everywhere"
  | "mfa_reset";

const sessionEndedMessages: Record<SessionEndReason, string> = {
  idle_timeout: "Você saiu após um período sem atividade. Entre novamente.",
  absolute_timeout: "Por segurança, os acessos têm duração limitada. Entre novamente.",
  revoked: "Seu acesso foi encerrado, por exemplo após uma alteração de senha ou segurança. Entre novamente.",
  signed_out: "Você saiu da conta.",
  account_inactive: "Esta conta está pausada. Fale com sua professora.",
  account_missing: "Esta conta ainda não está pronta. Fale com sua professora.",
  signed_out_everywhere: "Você saiu de todos os seus dispositivos.",
  mfa_reset: "Seu autenticador foi redefinido. Entre com sua senha para configurar um novo.",
};

/** Message for /login?reason=… (unknown reasons → null). */
export function sessionEndedMessage(reason: unknown): string | null {
  return typeof reason === "string" && Object.hasOwn(sessionEndedMessages, reason)
    ? sessionEndedMessages[reason as SessionEndReason]
    : null;
}