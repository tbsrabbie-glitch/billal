export const AUTH_COOKIE = "sc_auth";

/** The cookie value proving the passcode was entered. Changes if APP_PASSCODE changes. */
export async function authToken(passcode: string): Promise<string> {
  const data = new TextEncoder().encode(`speakcoach:${passcode}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
