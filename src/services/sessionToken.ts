const STORAGE_KEY = 'ai_session_token';

/**
 * Returns a stable anonymous session token for rate limiting.
 * Creates one on first call and persists it in localStorage.
 */
export function getSessionToken(): string {
  let token = localStorage.getItem(STORAGE_KEY);
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, token);
  }
  return token;
}
