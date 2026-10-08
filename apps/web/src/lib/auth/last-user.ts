export const LAST_USERNAME_STORAGE_KEY = 'polleria:lastUsername';
export function readLastUsername(): string | null {
  try {
    return window.localStorage.getItem(LAST_USERNAME_STORAGE_KEY);
  } catch {
    return null;
  }
}
export function saveLastUsername(username: string): void {
  try {
    window.localStorage.setItem(LAST_USERNAME_STORAGE_KEY, username);
  } catch {
    return;
  }
}
