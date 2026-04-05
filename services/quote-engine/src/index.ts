export type InvoiceDraft = {
  id: string;
  shipper: string;
  supplier: string;
  lane: string;
  origin: string;
  destination: string;
  sourceAmount: number;
  sourceCurrency: string;
  destinationCurrency: string;
  dueLabel: string;
  riskLabel: string;
};

export type QuoteResponse = {
  routeLabel: string;
  providerLabel: string;
  sourceAmount: number;
  destinationAmount: number;
  sourceCurrency: string;
  destinationCurrency: string;
  fxRate: number;
  feeUsd: number;
  bankFeeUsd: number;
  savingsUsd: number;
  etaLabel: string;
  expiresInMinutes: number;
};

const quoteBook: Record<string, Omit<QuoteResponse, "sourceAmount" | "sourceCurrency" | "destinationCurrency">> = {
  "BOP-2401": {
    routeLabel: "Treasury USDC -> Argentina payout partner",
    providerLabel: "Takenos Route A",
    destinationAmount: 40896000,
    fxRate: 1065,
    feeUsd: 74,
    bankFeeUsd: 412,
    savingsUsd: 338,
    etaLabel: "Funds arrive in 3 minutes",
    expiresInMinutes: 18
  },
  "BOP-2402": {
    routeLabel: "Treasury USDC -> Philippines payout partner",
    providerLabel: "Harbor Route B",
    destinationAmount: 671648.8,
    fxRate: 56.3464,
    feeUsd: 31,
    bankFeeUsd: 188,
    savingsUsd: 157,
    etaLabel: "Funds arrive in 5 minutes",
    expiresInMinutes: 11
  },
  "BOP-2403": {
    routeLabel: "Treasury USDC -> Mexico payout partner",
    providerLabel: "Mercado Route C",
    destinationAmount: 1257848.5,
    fxRate: 16.95,
    feeUsd: 92,
    bankFeeUsd: 545,
    savingsUsd: 453,
    etaLabel: "Already settled",
    expiresInMinutes: 0
  }
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchDemoQuote(invoice: InvoiceDraft): Promise<QuoteResponse> {
  await sleep(900);

  const preset = quoteBook[invoice.id];
  if (!preset) {
    const fxRate = 1.74;
    const feeUsd = Math.max(22, Math.round(invoice.sourceAmount * 0.0022));
    const bankFeeUsd = Math.round(feeUsd * 4.3);
    return {
      routeLabel: "Treasury USDC -> Partner payout rail",
      providerLabel: "Fallback Route",
      sourceAmount: invoice.sourceAmount,
      destinationAmount: Number((invoice.sourceAmount * fxRate).toFixed(2)),
      sourceCurrency: invoice.sourceCurrency,
      destinationCurrency: invoice.destinationCurrency,
      fxRate,
      feeUsd,
      bankFeeUsd,
      savingsUsd: bankFeeUsd - feeUsd,
      etaLabel: "Funds arrive in under 10 minutes",
      expiresInMinutes: 9
    };
  }

  return {
    ...preset,
    sourceAmount: invoice.sourceAmount,
    sourceCurrency: invoice.sourceCurrency,
    destinationCurrency: invoice.destinationCurrency
  };
}

export function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "USD" || currency === "USDC" ? 2 : 0
  }).format(amount);
}

export function formatNumber(amount: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0
  }).format(amount);
}
