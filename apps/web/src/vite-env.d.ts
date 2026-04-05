/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_SOLANA_RPC_HTTP?: string;
  readonly VITE_SOLANA_RPC_WS?: string;
  readonly VITE_SOLANA_CLUSTER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
