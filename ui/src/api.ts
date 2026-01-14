import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
} from "./utils/pkce";
import { sessionStorage } from "./utils/sessionStorage";
import type { User } from "./types";

const API_BASE_URL = import.meta.env.VITE_USER_API_BASE_URL;
const COGNITO_DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN;
const COGNITO_CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID;

if (!API_BASE_URL || !COGNITO_DOMAIN || !COGNITO_CLIENT_ID) {
  throw new Error(
    "Missing VITE_USER_API_BASE_URL, COGNITO_DOMAIN or COGNITO_CLIENT_ID (set it in a .env file)."
  );
}

export async function startLogin(): Promise<void> {
  if (!COGNITO_DOMAIN || !COGNITO_CLIENT_ID) {
    throw new Error("Cognito configuration not available");
  }

  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  sessionStorage.setCodeVerifier(codeVerifier);
  sessionStorage.setState(state);

  const authUrl = new URL(`${COGNITO_DOMAIN}/oauth2/authorize`);
  authUrl.searchParams.set("client_id", COGNITO_CLIENT_ID);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email");
  authUrl.searchParams.set(
    "redirect_uri",
    `${window.location.origin}/callback`
  );
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  window.location.href = authUrl.toString();
}

async function exchangeCodeForTokens(
  code: string,
  state: string
): Promise<{ access_token: string; id_token?: string; expires_in: number }> {
  if (!COGNITO_DOMAIN || !COGNITO_CLIENT_ID) {
    throw new Error("Cognito configuration not available");
  }

  const storedState = sessionStorage.getState();
  const codeVerifier = sessionStorage.getCodeVerifier();

  if (!storedState || state !== storedState || !codeVerifier) {
    throw new Error("Invalid state or missing code verifier");
  }

  const tokenParams = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: COGNITO_CLIENT_ID,
    code: code,
    redirect_uri: `${window.location.origin}/callback`,
    code_verifier: codeVerifier,
  });

  const response = await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenParams.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${errorText}`);
  }

  const tokens = await response.json();
  sessionStorage.removeCodeVerifier();
  sessionStorage.removeState();
  return tokens;
}

export function getAccessToken(): string | null {
  return sessionStorage.getAccessToken();
}

function decodeIdToken(idToken: string): User | null {
  try {
    const payload = idToken.split(".")[1];
    const decoded = JSON.parse(atob(payload));
    return {
      sub: decoded.sub,
      email: decoded.email,
      name: decoded.name || decoded.preferred_username || decoded.username,
      groups: decoded["cognito:groups"] || [],
      email_verified: decoded.email_verified,
    };
  } catch {
    return null;
  }
}

export function getUserFromStoredToken(): User | null {
  const idToken = sessionStorage.getIdToken();
  if (!idToken) return null;
  return decodeIdToken(idToken);
}

export function clearTokens(): void {
  sessionStorage.clearAll();
}

export async function doLogout(): Promise<void> {
  clearTokens();
  const logoutUrl = `${COGNITO_DOMAIN}/logout?client_id=${COGNITO_CLIENT_ID}&logout_uri=${encodeURIComponent(
    window.location.origin
  )}`;
  window.location.href = logoutUrl;
}

export async function authenticatedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  // API Gateway Cognito authorizer requires ID token, not access token
  // Try ID token first, fall back to access token for backwards compatibility
  const idToken = sessionStorage.getIdToken();
  const accessToken = getAccessToken();
  const token = idToken || accessToken;

  if (!token) {
    throw new Error("No token available");
  }

  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);

  return fetch(url, {
    ...options,
    headers,
  });
}

/**
 * High-level OAuth callback handler that processes the authorization code
 * and returns the decoded user information.
 * This abstracts away all OAuth mechanics from the React component.
 */
export async function handleOAuthCallback(
  code: string,
  state: string
): Promise<User> {
  const tokens = await exchangeCodeForTokens(code, state);

  if (!tokens.access_token) {
    throw new Error("No access token received");
  }

  sessionStorage.setAccessToken(tokens.access_token);

  if (!tokens.id_token) {
    throw new Error("No ID token received");
  }

  sessionStorage.setIdToken(tokens.id_token);

  const user = decodeIdToken(tokens.id_token);
  if (!user) {
    throw new Error("Failed to decode user information from ID token");
  }

  return user;
}
