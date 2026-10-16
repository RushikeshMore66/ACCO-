/** Client-side mirror of the backend password rule (the backend remains authoritative). */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export function validateNewPassword(password: string): string | null {
  if (password.trim().length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters`;
  }
  if (new Set(password).size < 5) {
    return "Password is too repetitive";
  }
  return null;
}
