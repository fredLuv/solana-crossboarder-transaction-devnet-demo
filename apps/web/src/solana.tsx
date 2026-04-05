import React from "react";
import { autoDiscover, createClient } from "@solana/client";
import { SolanaProvider } from "@solana/react-hooks";
import { appConfig } from "./config";

export const solanaClient = createClient({
  endpoint: appConfig.solanaHttpEndpoint,
  websocketEndpoint: appConfig.solanaWsEndpoint,
  walletConnectors: autoDiscover()
});

export function SolanaAppProvider({ children }: { children: React.ReactNode }) {
  return <SolanaProvider client={solanaClient}>{children}</SolanaProvider>;
}
