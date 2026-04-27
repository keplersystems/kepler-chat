import { PUBLIC_SERVER_URL } from "$env/static/public";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface AuthSession {
  authenticated: boolean;
}

function authUrl(path: string): string {
  return `${PUBLIC_SERVER_URL}${path}`;
}

async function session(fetchImpl: FetchLike = fetch): Promise<AuthSession> {
  const response = await fetchImpl(authUrl("/api/auth/session"), {
    credentials: "include",
  });

  if (response.status === 401) {
    return { authenticated: false };
  }
  if (!response.ok) {
    throw new Error(`Auth session check failed with status ${response.status}`);
  }

  return (await response.json()) as AuthSession;
}

async function login(passcode: string, fetchImpl: FetchLike = fetch): Promise<AuthSession> {
  const response = await fetchImpl(authUrl("/api/auth/login"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passcode }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(payload?.error ?? "Failed to sign in");
  }

  return (await response.json()) as AuthSession;
}

async function logout(fetchImpl: FetchLike = fetch): Promise<void> {
  const response = await fetchImpl(authUrl("/api/auth/logout"), {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Sign out failed with status ${response.status}`);
  }
}

export const authClient = {
  session,
  login,
  logout,
};
