export const PASSWORD_MIN_LENGTH = 15;
export const PASSWORD_MAX_LENGTH = 72;

export function passwordProblem(password: string, confirmation: string): "short" | "long" | "mismatch" | null {
  if (password.length < PASSWORD_MIN_LENGTH) return "short";
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_LENGTH) return "long";
  if (password !== confirmation) return "mismatch";
  return null;
}
