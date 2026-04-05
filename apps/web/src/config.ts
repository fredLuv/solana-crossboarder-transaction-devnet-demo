const DEFAULT_API_BASE_URL = "http://127.0.0.1:8789";
const DEFAULT_BLINK_API_BASE_URL = "http://127.0.0.1:3000";
const DEFAULT_SOLANA_HTTP = "https://api.devnet.solana.com";
const DEFAULT_SOLANA_WS = "wss://api.devnet.solana.com";
const DEFAULT_CLUSTER = "devnet";

function normalizeBaseUrl(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  return value.replace(/\/+$/, "");
}

export const appConfig = {
  apiBaseUrl: normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL, DEFAULT_API_BASE_URL),
  blinkApiBaseUrl: normalizeBaseUrl(import.meta.env.VITE_BLINK_API_BASE_URL, DEFAULT_BLINK_API_BASE_URL),
  solanaHttpEndpoint: import.meta.env.VITE_SOLANA_RPC_HTTP || DEFAULT_SOLANA_HTTP,
  solanaWsEndpoint: import.meta.env.VITE_SOLANA_RPC_WS || DEFAULT_SOLANA_WS,
  solanaCluster: import.meta.env.VITE_SOLANA_CLUSTER || DEFAULT_CLUSTER
} as const;
