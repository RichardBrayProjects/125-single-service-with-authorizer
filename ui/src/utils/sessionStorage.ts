/**
 * Session storage abstraction layer for OAuth tokens and state
 */

const TOKEN_STORAGE_KEY = "cognito_access_token";
const ID_TOKEN_STORAGE_KEY = "cognito_id_token";
const CODE_VERIFIER_KEY = "pkce_code_verifier";
const STATE_KEY = "oauth_state";
const REDIRECT_URI_KEY = "oauth_redirect_uri";

export const sessionStorage = {
  // Token storage
  setAccessToken: (token: string): void => {
    window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
  },

  getAccessToken: (): string | null => {
    return window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
  },

  setIdToken: (token: string): void => {
    window.sessionStorage.setItem(ID_TOKEN_STORAGE_KEY, token);
  },

  getIdToken: (): string | null => {
    return window.sessionStorage.getItem(ID_TOKEN_STORAGE_KEY);
  },

  // OAuth flow state
  setCodeVerifier: (verifier: string): void => {
    window.sessionStorage.setItem(CODE_VERIFIER_KEY, verifier);
  },

  getCodeVerifier: (): string | null => {
    return window.sessionStorage.getItem(CODE_VERIFIER_KEY);
  },

  setState: (state: string): void => {
    window.sessionStorage.setItem(STATE_KEY, state);
  },

  getState: (): string | null => {
    return window.sessionStorage.getItem(STATE_KEY);
  },

  setRedirectUri: (uri: string): void => {
    window.sessionStorage.setItem(REDIRECT_URI_KEY, uri);
  },

  getRedirectUri: (): string | null => {
    return window.sessionStorage.getItem(REDIRECT_URI_KEY);
  },

  // Cleanup operations
  removeCodeVerifier: (): void => {
    window.sessionStorage.removeItem(CODE_VERIFIER_KEY);
  },

  removeState: (): void => {
    window.sessionStorage.removeItem(STATE_KEY);
  },

  removeRedirectUri: (): void => {
    window.sessionStorage.removeItem(REDIRECT_URI_KEY);
  },

  clearAll: (): void => {
    window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    window.sessionStorage.removeItem(ID_TOKEN_STORAGE_KEY);
    window.sessionStorage.removeItem(CODE_VERIFIER_KEY);
    window.sessionStorage.removeItem(STATE_KEY);
    window.sessionStorage.removeItem(REDIRECT_URI_KEY);
  },
};
