import { fetchDemoQuote, type InvoiceDraft, type QuoteResponse } from "@freightflow/quote-engine";
import { appConfig } from "./config";

export type QuoteTransport = "http" | "fallback";
export type Stage =
  | "draft"
  | "quoted"
  | "approval_requested"
  | "wallet_ready"
  | "local_processing"
  | "delivered"
  | "settled";
export type PrivacyMode = "selective" | "recipient_limited" | "auditor_ready";

export type ActivePayoutCase = InvoiceDraft & {
  stage: Stage;
  operator: string;
  approvals: string[];
  policyLabel: string;
  privacyMode: PrivacyMode;
  paymentPurpose: string;
  memoReference: string;
  beneficiaryAddress: string;
  recipientName: string;
  deliveryMethod: string;
  bankRail: string;
  bankAlias: string;
  complianceNote: string;
  offRampPartner: string;
  localEta: string;
  payoutCaseId: string;
};

export type DevnetStatus = {
  ok: boolean;
  cluster: "devnet";
  treasuryAddress: string;
  treasuryBalanceSol: number;
  treasuryStableBalance: number;
  stablecoinMint: string;
  stablecoinSymbol: string;
  stablecoinDecimals: number;
};

export type DemoWalletFunding = {
  ok: boolean;
  cluster: "devnet";
  treasuryAddress: string;
  treasuryBalanceSol: number;
  treasuryStableBalance: number;
  walletAddress: string;
  walletBalanceSol: number;
  walletStableBalance: number;
  stablecoinMint: string;
  stablecoinSymbol: string;
  stablecoinDecimals: number;
  amountToken: number;
  signature: string;
  explorerUrl: string;
};

export type PersistedSettlementReceipt = {
  cluster: "devnet";
  signature: string;
  explorerUrl: string;
  payerAddress: string;
  beneficiaryAddress: string;
  amountToken: number;
  assetSymbol: string;
  mintAddress: string;
  memoReference: string;
  localDeliveryId: string;
  localDeliveryMethod: string;
  offRampPartner: string;
  expectedEta: string;
  createdAt?: string;
};

export type PersistedFundingEvent = {
  walletAddress: string;
  amountToken: number;
  topUpSol: number;
  walletBalanceSol: number;
  walletStableBalance: number;
  signature: string;
  explorerUrl: string;
  createdAt?: string;
};

export type ActivePayoutPayload = {
  payoutCase: ActivePayoutCase;
  latestFundingEvent: PersistedFundingEvent | null;
  latestReceipt: PersistedSettlementReceipt | null;
};

export async function fetchQuote(invoice: InvoiceDraft): Promise<{
  quote: QuoteResponse;
  transport: QuoteTransport;
}> {
  try {
    const response = await fetch(`${appConfig.apiBaseUrl}/quote`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(invoice)
    });

    if (!response.ok) {
      throw new Error(`Quote API failed with ${response.status}`);
    }

    const quote = (await response.json()) as QuoteResponse;
    return {
      quote,
      transport: "http"
    };
  } catch (_error) {
    return {
      quote: await fetchDemoQuote(invoice),
      transport: "fallback"
    };
  }
}

export async function fetchDevnetStatus(): Promise<DevnetStatus | null> {
  try {
    const response = await fetch(`${appConfig.apiBaseUrl}/devnet/status`);
    if (!response.ok) {
      throw new Error(`Devnet status failed with ${response.status}`);
    }
    return (await response.json()) as DevnetStatus;
  } catch (_error) {
    return null;
  }
}

export async function fetchActivePayoutCase(): Promise<ActivePayoutPayload> {
  const response = await fetch(`${appConfig.apiBaseUrl}/payouts/active`);
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Active payout load failed: ${detail}`);
  }
  return (await response.json()) as ActivePayoutPayload;
}

export async function fundDemoWallet(
  address: string,
  amountToken = 500,
  topUpSol = 0.02,
  payoutId?: string
): Promise<DemoWalletFunding> {
  const response = await fetch(`${appConfig.apiBaseUrl}/devnet/stablecoin/fund`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ address, amountToken, topUpSol, payoutId })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Demo wallet funding failed: ${detail}`);
  }

  return (await response.json()) as DemoWalletFunding;
}

export async function persistPayoutStage(payoutId: string, stage: Stage, approvals: string[]): Promise<void> {
  const response = await fetch(`${appConfig.apiBaseUrl}/payouts/${encodeURIComponent(payoutId)}/stage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ stage, approvals })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Payout stage persistence failed: ${detail}`);
  }
}

export async function persistSettlementReceipt(
  payoutId: string,
  receipt: PersistedSettlementReceipt
): Promise<void> {
  const response = await fetch(`${appConfig.apiBaseUrl}/payouts/${encodeURIComponent(payoutId)}/receipts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(receipt)
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Receipt persistence failed: ${detail}`);
  }
}

export async function resetDemoPayoutCase(payoutId: string): Promise<ActivePayoutPayload> {
  const response = await fetch(`${appConfig.apiBaseUrl}/payouts/${encodeURIComponent(payoutId)}/reset-demo`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Demo payout reset failed: ${detail}`);
  }

  return (await response.json()) as ActivePayoutPayload;
}
