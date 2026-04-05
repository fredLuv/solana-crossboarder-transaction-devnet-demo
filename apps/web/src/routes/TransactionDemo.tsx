import React, { useEffect, useMemo, useState } from "react";
import {
  formatMoney,
  formatNumber,
  type InvoiceDraft,
  type QuoteResponse
} from "@freightflow/quote-engine";
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddressSync
} from "@solana/spl-token";
import {
  fetchActivePayoutCase,
  fetchDevnetStatus,
  fetchQuote,
  fundDemoWallet,
  persistPayoutStage,
  persistSettlementReceipt,
  resetDemoPayoutCase,
  type ActivePayoutCase,
  type DemoWalletFunding,
  type DevnetStatus,
  type PersistedSettlementReceipt,
  type PrivacyMode,
  type Stage,
  type QuoteTransport
} from "../api";
import {
  createDemoWalletRecord,
  demoConnection,
  getDemoWalletBalances,
  getStoredDemoWalletKeypair,
  loadStoredDemoWallet,
  saveStoredDemoWallet,
  type StoredDemoWallet
} from "../lib/demoWallet";

type Screen = "dashboard" | "receipt";
type Invoice = ActivePayoutCase;
type AppSettlement = PersistedSettlementReceipt;

const memoProgramId = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const stablecoinSymbol = "dUSDC";
const stablecoinDecimals = 6;

const stageMeta: Record<Stage, { label: string; tone: string }> = {
  draft: { label: "Needs quote", tone: "neutral" },
  quoted: { label: "Ready for approval", tone: "warm" },
  approval_requested: { label: "Waiting on payout signer", tone: "warm" },
  wallet_ready: { label: "Signer funded", tone: "good" },
  local_processing: { label: "Local payout processing", tone: "warm" },
  delivered: { label: "Delivered", tone: "good" },
  settled: { label: "Local payout processing", tone: "warm" }
};

const flowLabels = ["Intake", "Quote", "Approval", "Wallet", "On-chain", "Local", "Delivered"] as const;

function normalizeStage(stage: Stage): Exclude<Stage, "settled"> {
  if (stage === "settled") return "local_processing";
  return stage;
}

function flowIndex(stage: Stage) {
  switch (normalizeStage(stage)) {
    case "draft":
      return 1;
    case "quoted":
      return 2;
    case "approval_requested":
      return 3;
    case "wallet_ready":
      return 4;
    case "local_processing":
      return 5;
    case "delivered":
      return 6;
    default:
      return 0;
  }
}

function privacyCopy(mode: PrivacyMode) {
  switch (mode) {
    case "selective":
      return "Selective internal visibility with trimmed counterparty proof.";
    case "recipient_limited":
      return "Recipient sees status and reference only.";
    case "auditor_ready":
      return "Full internal receipt plus lighter external proof.";
    default:
      return "";
  }
}

function nextActionLabel(stage: Stage, options: {
  demoWalletCreated: boolean;
  demoWalletReady: boolean;
}) {
  const normalizedStage = normalizeStage(stage);
  if (normalizedStage === "draft") return "Lock quote";
  if (normalizedStage === "quoted") return "Request approval";
  if (normalizedStage === "approval_requested") {
    if (options.demoWalletReady) return "Approve with demo wallet";
    if (options.demoWalletCreated) return "Fund demo wallet";
    return "Create demo wallet";
  }
  if (normalizedStage === "wallet_ready") return "Approve with demo wallet";
  if (normalizedStage === "local_processing") return "Confirm local delivery";
  return "Review receipt";
}

function actionRailCopy(stage: Stage) {
  const normalizedStage = normalizeStage(stage);
  if (normalizedStage === "local_processing") {
    return "The Solana leg is complete. Keep the receipt open, watch for the local payout partner confirmation, then mark the beneficiary as delivered.";
  }
  if (normalizedStage === "delivered") {
    return "Both legs are complete. The payout can now move into reconciliation and beneficiary support follow-up if needed.";
  }
  return "Create the demo wallet, fund it with demo stablecoins, then release the Solana leg and use the receipt as the local handoff proof.";
}

function paperStableAmount(sourceAmount: number) {
  return Number(Math.max(25, Math.min(750, sourceAmount / 100)).toFixed(2));
}

function buildOperationalMilestones(stage: Stage, hasFundingEvent: boolean, hasSettlement: boolean) {
  const normalizedStage = normalizeStage(stage);
  const releaseApproved =
    normalizedStage !== "draft" && normalizedStage !== "quoted";
  const signerFunded =
    hasFundingEvent || normalizedStage === "wallet_ready" || normalizedStage === "local_processing" || normalizedStage === "delivered";
  const chainConfirmed =
    hasSettlement || normalizedStage === "local_processing" || normalizedStage === "delivered";
  const localDelivered = normalizedStage === "delivered";

  return [
    {
      title: "Internal approval locked",
      detail: "Finance signed off on the payout and release policy.",
      state: releaseApproved ? "done" : normalizedStage === "approval_requested" ? "active" : "pending"
    },
    {
      title: "Signer wallet funded",
      detail: "The payout signer holds enough dUSDC and fee SOL to release the chain leg.",
      state: signerFunded ? "done" : normalizedStage === "wallet_ready" ? "active" : "pending"
    },
    {
      title: "Chain leg confirmed",
      detail: "The Solana transfer and memo reference have landed on devnet.",
      state: chainConfirmed ? "done" : normalizedStage === "local_processing" ? "active" : "pending"
    },
    {
      title: "Local beneficiary paid out",
      detail: "The partner confirms the ARS delivery into the recipient rail.",
      state: localDelivered ? "done" : normalizedStage === "delivered" ? "active" : "pending"
    }
  ] as const;
}

function WalletPanel({
  demoWalletAddress,
  demoWalletBalanceSol,
  demoWalletBalanceToken,
  demoFunding,
  ready,
  onCreateDemoWallet,
  onFundDemoWallet,
  onResetDemoWallet
}: {
  demoWalletAddress: string | null;
  demoWalletBalanceSol: number | null;
  demoWalletBalanceToken: number | null;
  demoFunding: boolean;
  ready: boolean;
  onCreateDemoWallet: () => void;
  onFundDemoWallet: () => void;
  onResetDemoWallet: () => void;
}) {
  return (
    <div className="walletPanel disconnected">
      <div>
        <span>Stablecoin payout path</span>
        <strong>
          {demoWalletAddress
            ? ready
              ? "Signer wallet funded and ready"
              : "Demo stablecoin wallet created"
            : "Create a demo stablecoin wallet"}
        </strong>
        <p>
          {demoWalletAddress
            ? ready
              ? "The signer now holds enough dUSDC and fee SOL to release the payout leg on devnet."
              : "This burner wallet lives in your browser storage. Fund it with demo stablecoins and a little SOL for fees, then use it to sign the payout."
            : "This prototype uses a burner wallet inside the app so the flow stays focused on funding, signing, and settlement."}
        </p>
        {demoWalletAddress ? (
          <>
            <p className="mono">{demoWalletAddress}</p>
            <p className="helperText">
              {`${(demoWalletBalanceToken ?? 0).toFixed(2)} ${stablecoinSymbol} and ${(demoWalletBalanceSol ?? 0).toFixed(4)} SOL available`}
            </p>
          </>
        ) : null}
      </div>
      <div className="connectorList">
        {!demoWalletAddress ? (
          <button className="secondary compact" onClick={onCreateDemoWallet} type="button">
            Create demo wallet
          </button>
        ) : (
          <>
            <button className="secondary compact" disabled={demoFunding} onClick={onFundDemoWallet} type="button">
              {demoFunding ? "Funding demo wallet..." : `Fund demo wallet${demoWalletBalanceToken !== null ? ` (${demoWalletBalanceToken.toFixed(2)} ${stablecoinSymbol})` : ""}`}
            </button>
            <button className="ghost compact" onClick={onResetDemoWallet} type="button">
              Reset demo wallet
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ReceiptView({
  invoice,
  quote,
  settlement,
  localDeliveryPending,
  confirmingDelivery,
  onConfirmDelivery,
  onStartAnotherPayout,
  onBack
}: {
  invoice: Invoice;
  quote: QuoteResponse;
  settlement: AppSettlement | null;
  localDeliveryPending: boolean;
  confirmingDelivery: boolean;
  onConfirmDelivery: () => void;
  onStartAnotherPayout: () => void;
  onBack: () => void;
}) {
  return (
    <div className="receiptPage">
      <div className="receiptPageHeader">
        <div>
          <p className="eyebrow">Solana-CrossBorder-Transaction-Devnet-Demo Receipt</p>
          <h1 className="receiptTitle">
            {localDeliveryPending ? "Cross-border payout released." : "Cross-border payout delivered."}
          </h1>
          <p className="lede">
            {localDeliveryPending
              ? "The stablecoin leg has landed on Solana and the payout is now with the local Argentina delivery partner."
              : "Both legs are complete: Solana settlement is confirmed and the local Argentina payout has been delivered."}
          </p>
        </div>
        <div className="actions">
          <button onClick={onBack} type="button">Back to payout</button>
          {localDeliveryPending ? (
            <button className="secondary" disabled={confirmingDelivery} onClick={onConfirmDelivery} type="button">
              {confirmingDelivery ? "Confirming local delivery..." : "Mark local payout delivered"}
            </button>
          ) : (
            <button className="secondary" onClick={onStartAnotherPayout} type="button">
              Start another payout
            </button>
          )}
          <button className="ghost secondary" onClick={() => window.print()} type="button">
            Print receipt
          </button>
        </div>
      </div>

      <section className="receiptHero">
        <div className="receiptHeroMetric">
          <span>Recipient</span>
          <strong>{invoice.recipientName}</strong>
        </div>
        <div className="receiptHeroMetric">
          <span>Recipient gets</span>
          <strong>{invoice.destinationCurrency} {formatNumber(quote.destinationAmount)}</strong>
        </div>
        <div className="receiptHeroMetric">
          <span>Local status</span>
          <strong>{localDeliveryPending ? "Processing with payout partner" : "Delivered to recipient"}</strong>
        </div>
        <div className="receiptHeroMetric">
          <span>Case</span>
          <strong>{invoice.payoutCaseId}</strong>
        </div>
      </section>

      <div className="receiptPageBody">
        <section className="panel">
          <div className="panelHeader">
            <h2>Business summary</h2>
            <span className={`pill ${localDeliveryPending ? "warm" : "good"}`}>
              {localDeliveryPending ? "Partner processing" : "Delivered"}
            </span>
          </div>
          <div className="receiptGrid">
            <div>
              <span>Funding amount</span>
              <strong>{formatMoney(invoice.sourceAmount, "USD")}</strong>
            </div>
            <div>
              <span>Purpose</span>
              <strong>{invoice.paymentPurpose}</strong>
            </div>
            <div>
              <span>Route</span>
              <strong>{quote.routeLabel}</strong>
            </div>
            <div>
              <span>Reference</span>
              <strong>{invoice.memoReference}</strong>
            </div>
            <div>
              <span>Local partner</span>
              <strong>{invoice.offRampPartner}</strong>
            </div>
            <div>
              <span>Local ETA</span>
              <strong>{invoice.localEta}</strong>
            </div>
          </div>
        </section>

        {settlement && (
          <section className="panel">
            <div className="panelHeader">
              <h2>Settlement proof</h2>
              <span className="pill good">Chain confirmed</span>
            </div>
            <div className="receiptGrid">
              <div>
                <span>Amount sent</span>
                <strong>{settlement.amountToken.toFixed(2)} {settlement.assetSymbol}</strong>
              </div>
              <div>
                <span>Local delivery ID</span>
                <strong>{settlement.localDeliveryId}</strong>
              </div>
              <div>
                <span>Payer</span>
                <strong className="mono">{settlement.payerAddress}</strong>
              </div>
              <div>
                <span>Beneficiary</span>
                <strong className="mono">{settlement.beneficiaryAddress}</strong>
              </div>
              <div>
                <span>Mint</span>
                <strong className="mono">{settlement.mintAddress}</strong>
              </div>
              <div>
                <span>Cluster</span>
                <strong>{settlement.cluster}</strong>
              </div>
              <div>
                <span>Partner handoff</span>
                <strong>{settlement.offRampPartner}</strong>
              </div>
              <div>
                <span>Delivery ETA</span>
                <strong>{settlement.expectedEta}</strong>
              </div>
              <div>
                <span>Delivery method</span>
                <strong>{settlement.localDeliveryMethod}</strong>
              </div>
              <div>
                <span>Signature</span>
                <strong className="mono">{settlement.signature}</strong>
              </div>
              <div>
                <span>Explorer</span>
                <strong>
                  <a className="linkAction" href={settlement.explorerUrl} target="_blank" rel="noreferrer">
                    Open transaction
                  </a>
                </strong>
              </div>
            </div>
          </section>
        )}

        <section className="panel">
          <div className="panelHeader">
            <h2>Local payout handoff</h2>
            <span className={`pill ${localDeliveryPending ? "warm" : "good"}`}>
              {localDeliveryPending ? "Awaiting partner confirmation" : "Delivered"}
            </span>
          </div>
          <div className="receiptGrid">
            <div>
              <span>Partner</span>
              <strong>{invoice.offRampPartner}</strong>
            </div>
            <div>
              <span>Delivery method</span>
              <strong>{invoice.deliveryMethod}</strong>
            </div>
            <div>
              <span>Bank rail</span>
              <strong>{invoice.bankRail}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>{localDeliveryPending ? "Processing beneficiary credit" : "Beneficiary credited"}</strong>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function TransactionDemo({
  onNavigate
}: {
  onNavigate: (path: "/" | "/transaction" | "/blink") => void;
}) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [quotes, setQuotes] = useState<Record<string, QuoteResponse>>({});
  const [quoteSource, setQuoteSource] = useState<Record<string, QuoteTransport>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [approvingWallet, setApprovingWallet] = useState(false);
  const [demoFunding, setDemoFunding] = useState(false);
  const [devnetStatus, setDevnetStatus] = useState<DevnetStatus | null>(null);
  const [demoFundingReceipt, setDemoFundingReceipt] = useState<DemoWalletFunding | null>(null);
  const [settlement, setSettlement] = useState<AppSettlement | null>(null);
  const [devnetError, setDevnetError] = useState<string | null>(null);
  const [storedDemoWallet, setStoredDemoWallet] = useState<StoredDemoWallet | null>(() =>
    typeof window === "undefined" ? null : loadStoredDemoWallet()
  );
  const [demoWalletBalanceSol, setDemoWalletBalanceSol] = useState<number | null>(null);
  const [demoWalletBalanceToken, setDemoWalletBalanceToken] = useState<number | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [confirmingDelivery, setConfirmingDelivery] = useState(false);

  const active = invoice;
  const activeQuote = active ? quotes[active.id] : undefined;
  const normalizedStage = active ? normalizeStage(active.stage) : null;
  const meta = normalizedStage ? stageMeta[normalizedStage] : null;
  const demoWallet = useMemo(
    () => getStoredDemoWalletKeypair(storedDemoWallet),
    [storedDemoWallet]
  );
  const demoWalletReady = active ? (demoWalletBalanceToken ?? 0) >= paperStableAmount(active.sourceAmount) : false;
  const localDeliveryPending = normalizedStage === "local_processing";
  const operationalMilestones = active
    ? buildOperationalMilestones(active.stage, Boolean(demoFundingReceipt), Boolean(settlement))
    : [];

  async function hydrateFromPayload(payload: Awaited<ReturnType<typeof fetchActivePayoutCase>>, status?: DevnetStatus | null) {
    let nextStage = normalizeStage(payload.payoutCase.stage);
    const browserOwnsFundedWallet =
      Boolean(storedDemoWallet?.address) &&
      storedDemoWallet?.address === payload.latestFundingEvent?.walletAddress;

    if (nextStage === "wallet_ready" && !browserOwnsFundedWallet) {
      nextStage = "approval_requested";
    }

    if (payload.latestFundingEvent && browserOwnsFundedWallet && !payload.latestReceipt && nextStage === "approval_requested") {
      nextStage = "wallet_ready";
    }
    if (payload.latestReceipt && nextStage === "settled") {
      nextStage = "local_processing";
    }

    setInvoice({ ...payload.payoutCase, stage: nextStage });

    if (payload.latestFundingEvent && browserOwnsFundedWallet) {
      setDemoFundingReceipt({
        ok: true,
        cluster: "devnet",
        treasuryAddress: status?.treasuryAddress ?? devnetStatus?.treasuryAddress ?? "",
        treasuryBalanceSol: status?.treasuryBalanceSol ?? devnetStatus?.treasuryBalanceSol ?? 0,
        treasuryStableBalance: status?.treasuryStableBalance ?? devnetStatus?.treasuryStableBalance ?? 0,
        walletAddress: payload.latestFundingEvent.walletAddress,
        walletBalanceSol: payload.latestFundingEvent.walletBalanceSol,
        walletStableBalance: payload.latestFundingEvent.walletStableBalance,
        stablecoinMint: status?.stablecoinMint ?? devnetStatus?.stablecoinMint ?? "",
        stablecoinSymbol: status?.stablecoinSymbol ?? devnetStatus?.stablecoinSymbol ?? stablecoinSymbol,
        stablecoinDecimals: status?.stablecoinDecimals ?? devnetStatus?.stablecoinDecimals ?? stablecoinDecimals,
        amountToken: payload.latestFundingEvent.amountToken,
        signature: payload.latestFundingEvent.signature,
        explorerUrl: payload.latestFundingEvent.explorerUrl
      });
    } else {
      setDemoFundingReceipt(null);
    }

    setSettlement(payload.latestReceipt ?? null);
    setScreen(payload.latestReceipt ? "receipt" : "dashboard");

    const firstQuote = await fetchQuote(payload.payoutCase);
    setQuotes({
      [payload.payoutCase.id]: firstQuote.quote
    });
    setQuoteSource({
      [payload.payoutCase.id]: firstQuote.transport
    });
  }

  useEffect(() => {
    async function bootstrap() {
      try {
        const [activePayload, status] = await Promise.all([
          fetchActivePayoutCase(),
          fetchDevnetStatus()
        ]);

        setDevnetStatus(status);
        await hydrateFromPayload(activePayload, status);
      } catch (error) {
        setDevnetError(error instanceof Error ? error.message : "Failed to load payout");
      } finally {
        setBootstrapping(false);
      }
    }

    void bootstrap();
  }, []);

  useEffect(() => {
    async function refreshDemoWalletBalance() {
      if (!demoWallet) {
        setDemoWalletBalanceSol(null);
        setDemoWalletBalanceToken(null);
        return;
      }

      try {
        const balances = await getDemoWalletBalances(demoWallet, {
          mintAddress: devnetStatus?.stablecoinMint ?? null,
          tokenDecimals: stablecoinDecimals
        });
        setDemoWalletBalanceSol(balances.sol);
        setDemoWalletBalanceToken(balances.token);
      } catch (_error) {
        setDemoWalletBalanceSol(null);
        setDemoWalletBalanceToken(null);
      }
    }

    void refreshDemoWalletBalance();
  }, [demoWallet, settlement, devnetStatus?.stablecoinMint]);

  const stepState = useMemo(() => {
    if (!active) return [];
    const current = flowIndex(normalizedStage ?? active.stage);
    return flowLabels.map((label, index) => ({
      label,
      state: index < current ? "done" : index === current ? "active" : "pending"
    }));
  }, [active, normalizedStage]);
  const progressPercent = useMemo(() => {
    if (!active) return 0;
    return (flowIndex(normalizedStage ?? active.stage) / (flowLabels.length - 1)) * 100;
  }, [active, normalizedStage]);

  async function requestQuote(invoice: Invoice) {
    setLoadingId(invoice.id);
    try {
      const response = await fetchQuote(invoice);
      setQuotes((current) => ({ ...current, [invoice.id]: response.quote }));
      setQuoteSource((current) => ({ ...current, [invoice.id]: response.transport }));
      await persistPayoutStage(invoice.id, "quoted", invoice.approvals);
      setInvoice((current) => (current ? { ...current, stage: "quoted" } : current));
    } catch (error) {
      setDevnetError(error instanceof Error ? error.message : "Quote lock failed");
    } finally {
      setLoadingId(null);
    }
  }

  async function requestApproval(invoice: Invoice) {
    try {
      const approvals = ["Finance controller"];
      await persistPayoutStage(invoice.id, "approval_requested", approvals);
      setInvoice((current) =>
        current ? { ...current, stage: "approval_requested", approvals } : current
      );
    } catch (error) {
      setDevnetError(error instanceof Error ? error.message : "Approval request failed");
    }
  }

  function createDemoWallet() {
    const nextWallet = createDemoWalletRecord();
    saveStoredDemoWallet(nextWallet);
    setStoredDemoWallet(nextWallet);
    setDemoFundingReceipt(null);
    setDevnetError(null);
  }

  function resetDemoWallet() {
    saveStoredDemoWallet(null);
    setStoredDemoWallet(null);
    setDemoWalletBalanceSol(null);
    setDemoWalletBalanceToken(null);
    setDemoFundingReceipt(null);
  }

  async function topUpDemoWallet() {
    if (!storedDemoWallet || !active) return;

    setDemoFunding(true);
    setDevnetError(null);
    setDemoFundingReceipt(null);

    try {
      const result = await fundDemoWallet(
        storedDemoWallet.address,
        paperStableAmount(active.sourceAmount) + 25,
        0.02,
        active.id
      );
      await persistPayoutStage(active.id, "wallet_ready", ["Finance controller"]);
      setDemoFundingReceipt(result);
      setDemoWalletBalanceSol(result.walletBalanceSol);
      setDemoWalletBalanceToken(result.walletStableBalance);
      setDevnetStatus({
        ok: true,
        cluster: result.cluster,
        treasuryAddress: result.treasuryAddress,
        treasuryBalanceSol: result.treasuryBalanceSol,
        treasuryStableBalance: result.treasuryStableBalance,
        stablecoinMint: result.stablecoinMint,
        stablecoinSymbol: result.stablecoinSymbol,
        stablecoinDecimals: result.stablecoinDecimals
      });
      setInvoice((current) =>
        current ? { ...current, stage: "wallet_ready", approvals: ["Finance controller"] } : current
      );
    } catch (error) {
      setDevnetError(error instanceof Error ? error.message : "Demo wallet funding failed");
    } finally {
      setDemoFunding(false);
    }
  }

  async function settleWithDemoWallet() {
    if (!demoWallet || !active) return;
    setApprovingWallet(true);
    setDevnetError(null);

    try {
      if (!devnetStatus?.stablecoinMint) {
        throw new Error("Stablecoin mint is not ready yet.");
      }

      const amountToken = paperStableAmount(active.sourceAmount);
      const mintAddress = new PublicKey(devnetStatus.stablecoinMint);
      const sourceAta = getAssociatedTokenAddressSync(mintAddress, demoWallet.publicKey);
      const beneficiaryOwner = new PublicKey(active.beneficiaryAddress);
      const beneficiaryAta = getAssociatedTokenAddressSync(mintAddress, beneficiaryOwner);
      const memo = `Solana-CrossBorder-Transaction-Devnet-Demo:${active.id}:${active.memoReference}`;
      const beneficiaryAtaInfo = await demoConnection.getAccountInfo(beneficiaryAta, "confirmed");
      const instructions = [];

      if (!beneficiaryAtaInfo) {
        instructions.push(
          createAssociatedTokenAccountInstruction(
            demoWallet.publicKey,
            beneficiaryAta,
            beneficiaryOwner,
            mintAddress
          )
        );
      }

      instructions.push(
        createTransferCheckedInstruction(
          sourceAta,
          mintAddress,
          beneficiaryAta,
          demoWallet.publicKey,
          Math.round(amountToken * 10 ** stablecoinDecimals),
          stablecoinDecimals
        ),
        new TransactionInstruction({
          programId: memoProgramId,
          keys: [],
          data: new TextEncoder().encode(memo)
        })
      );

      const transaction = new Transaction().add(...instructions);

      const signature = await sendAndConfirmTransaction(demoConnection, transaction, [demoWallet], {
        commitment: "confirmed"
      });

      const receipt: AppSettlement = {
        cluster: "devnet",
        signature: String(signature),
        explorerUrl: `https://explorer.solana.com/tx/${String(signature)}?cluster=devnet`,
        payerAddress: demoWallet.publicKey.toBase58(),
        beneficiaryAddress: active.beneficiaryAddress,
        amountToken,
        assetSymbol: devnetStatus.stablecoinSymbol,
        mintAddress: devnetStatus.stablecoinMint,
        memoReference: active.memoReference,
        localDeliveryId: `${active.payoutCaseId}-L1`,
        localDeliveryMethod: active.deliveryMethod,
        offRampPartner: active.offRampPartner,
        expectedEta: active.localEta
      };

      setSettlement(receipt);
      setInvoice((current) =>
        current
          ? { ...current, stage: "local_processing", approvals: ["Finance controller", "Ops lead"] }
          : current
      );
      setScreen("receipt");
      try {
        await persistSettlementReceipt(active.id, receipt);
      } catch (error) {
        setDevnetError(
          error instanceof Error
            ? `${error.message} The payout succeeded on devnet, but the local receipt sync needs a retry.`
            : "The payout succeeded on devnet, but the local receipt sync needs a retry."
        );
      }

      try {
        const remainingLamports = await demoConnection.getBalance(demoWallet.publicKey, "confirmed");
        const sourceAccount = await getAccount(demoConnection, sourceAta, "confirmed", TOKEN_PROGRAM_ID);
        setDemoWalletBalanceSol(Number((remainingLamports / LAMPORTS_PER_SOL).toFixed(4)));
        setDemoWalletBalanceToken(Number((Number(sourceAccount.amount) / 10 ** stablecoinDecimals).toFixed(2)));
      } catch (_error) {
        // Receipt rendering should not depend on the follow-up wallet refresh succeeding.
      }
    } catch (error) {
      setDevnetError(error instanceof Error ? error.message : "Demo wallet settlement failed");
    } finally {
      setApprovingWallet(false);
    }
  }

  async function confirmLocalDelivery() {
    if (!active) return;
    setConfirmingDelivery(true);
    setDevnetError(null);
    try {
      await persistPayoutStage(active.id, "delivered", ["Finance controller", "Ops lead"]);
      setInvoice((current) =>
        current ? { ...current, stage: "delivered", approvals: ["Finance controller", "Ops lead"] } : current
      );
    } catch (error) {
      setDevnetError(error instanceof Error ? error.message : "Local delivery confirmation failed");
    } finally {
      setConfirmingDelivery(false);
    }
  }

  async function startAnotherPayout() {
    if (!active) return;
    setDevnetError(null);
    try {
      const payload = await resetDemoPayoutCase(active.id);
      await hydrateFromPayload(payload, devnetStatus);
    } catch (error) {
      setDevnetError(error instanceof Error ? error.message : "Could not start another payout");
    }
  }

  if (bootstrapping) {
    return (
      <div className="shell">
        <main className="layout">
          <section className="panel detail">
        <div className="panelHeader">
          <h2>Loading payout case</h2>
            </div>
            <p className="lede">Solana-CrossBorder-Transaction-Devnet-Demo is loading the active payout, devnet rail, and the latest stored settlement state.</p>
          </section>
        </main>
      </div>
    );
  }

  if (!active || !meta) {
    return (
      <div className="shell">
        <main className="layout">
          <section className="panel detail">
            <div className="panelHeader">
              <h2>No payout case found</h2>
            </div>
            <p className="lede">{devnetError ?? "The API did not return an active payout case."}</p>
          </section>
        </main>
      </div>
    );
  }

  if (screen === "receipt" && activeQuote) {
    return (
      <ReceiptView
        invoice={active}
        localDeliveryPending={localDeliveryPending}
        confirmingDelivery={confirmingDelivery}
        onConfirmDelivery={() => void confirmLocalDelivery()}
        onStartAnotherPayout={() => void startAnotherPayout()}
        onBack={() => setScreen("dashboard")}
        quote={activeQuote}
        settlement={settlement}
      />
    );
  }

  return (
    <div className="shell">
      <header className="hero simplifiedHero">
        <div>
          <p className="eyebrow">Solana-CrossBorder-Transaction-Devnet-Demo · Solana Devnet</p>
          <h1>Run one real US to Argentina contractor payout.</h1>
          <p className="lede">
            This demo follows the actual job: confirm the recipient rail, fund in stablecoins, release on Solana,
            and hand off to a local ARS payout partner with proof on both sides.
          </p>
        </div>
        <div className="heroCard">
          <span className="heroLabel">Current transaction</span>
          <strong>{active.id} · {active.paymentPurpose}</strong>
          <p>{active.shipper} paying {active.supplier} across {active.lane}.</p>
          <div className="heroSummary">
            <div>
              <span>Next action</span>
              <strong>
                {nextActionLabel(normalizedStage ?? active.stage, {
                  demoWalletCreated: Boolean(storedDemoWallet),
                  demoWalletReady
                })}
              </strong>
            </div>
            <div>
              <span>Wallet status</span>
              <strong>
                {storedDemoWallet
                  ? `${(demoWalletBalanceToken ?? 0).toFixed(2)} ${stablecoinSymbol}`
                  : "No demo wallet"}
              </strong>
            </div>
            <div>
              <span>Local delivery</span>
              <strong>{active.deliveryMethod}</strong>
            </div>
          </div>
          <div className="heroNote">
            <span>Case</span>
            <strong>{active.payoutCaseId} · {active.bankAlias}</strong>
          </div>
        </div>
      </header>

      <section className="progressStrip" aria-label="Payout progress">
        <div className="progressTrack" aria-hidden="true">
          <span className="progressFill" style={{ width: `${progressPercent}%` }} />
        </div>
        <div className="progressLabels">
          {stepState.map((step) => (
            <div className={`progressLabel ${step.state}`} key={step.label}>
              {step.label}
            </div>
          ))}
        </div>
      </section>

      <main className="layout">
        <section className="panel">
          <div className="panelHeader">
            <h2>How this cross-border payout works</h2>
            <span className="pill">Single demo payout</span>
          </div>
          <ol className="stepList">
            <li>
              <strong>Confirm recipient and rail</strong>
              <span>{active.recipientName} gets paid by {active.deliveryMethod} over {active.bankRail}.</span>
            </li>
            <li>
              <strong>Release the stablecoin leg</strong>
              <span>Fund the signer with {stablecoinSymbol}, then send with memo reference <span className="mono">{active.memoReference}</span>.</span>
            </li>
            <li>
              <strong>Hand off to local delivery</strong>
              <span>The receipt carries both the Solana settlement and the Argentina payout handoff ID.</span>
            </li>
          </ol>
          <div className="detailGrid detailGridWide">
            <div className="metric">
              <span>Current stage</span>
              <strong>{meta.label}</strong>
            </div>
            <div className="metric">
              <span>Recipient</span>
              <strong>{active.recipientName}</strong>
            </div>
            <div className="metric">
              <span>Case ID</span>
              <strong>{active.payoutCaseId}</strong>
            </div>
            <div className="metric good">
              <span>Expected send</span>
              <strong>{paperStableAmount(active.sourceAmount).toFixed(2)} {stablecoinSymbol}</strong>
            </div>
          </div>
        </section>

        <section className="panel detail">
          <div className="panelHeader">
            <div>
              <h2>{active.id}</h2>
              <p className="subhead">{active.paymentPurpose}</p>
            </div>
            <span className={`pill ${meta.tone}`}>{meta.label}</span>
          </div>

          <div className="detailTop">
            <div className="storyBlock">
              <h3>Recipient</h3>
              <p>{active.recipientName} · {active.deliveryMethod}</p>
            </div>
            <div className="storyBlock">
              <h3>Local rail</h3>
              <p>{active.bankRail} to {active.bankAlias}</p>
            </div>
            <div className="storyBlock">
              <h3>Operator</h3>
              <p>{active.operator} · {active.localEta}</p>
            </div>
          </div>

          <div className="detailGrid detailGridWide">
            <div className="metric">
              <span>Company funds</span>
              <strong>{formatMoney(active.sourceAmount, "USD")}</strong>
            </div>
            <div className="metric">
              <span>Recipient gets</span>
              <strong>{active.destinationCurrency}</strong>
            </div>
            <div className="metric">
              <span>Bank alias</span>
              <strong>{active.bankAlias}</strong>
            </div>
            <div className="metric good">
              <span>Local ETA</span>
              <strong>{active.localEta}</strong>
            </div>
          </div>

          <div className="story tripleStory compactStory">
            <div className="storyBlock">
              <h3>Why now</h3>
              <p>{active.riskLabel}</p>
            </div>
            <div className="storyBlock">
              <h3>Release rules</h3>
              <p>{active.policyLabel}</p>
            </div>
            <div className="storyBlock">
              <h3>Compliance + visibility</h3>
              <p>{active.complianceNote} {privacyCopy(active.privacyMode)}</p>
            </div>
          </div>

          {activeQuote ? (
            <div className="quotePanel">
              <div className="quoteHeadline">
                <div>
                  <span className="quoteLabel">Locked route</span>
                  <strong>{activeQuote.routeLabel} · local partner handoff</strong>
                </div>
                <div className="quoteBadge">Savings {formatMoney(activeQuote.savingsUsd, "USD")}</div>
              </div>
              <div className="quoteGrid">
                <div className="quoteMetric">
                  <span>Recipient payout</span>
                  <strong>{active.destinationCurrency} {formatNumber(activeQuote.destinationAmount)}</strong>
                </div>
                <div className="quoteMetric">
                  <span>FX</span>
                  <strong>{activeQuote.fxRate.toFixed(4)}</strong>
                </div>
                <div className="quoteMetric">
                  <span>Partner ETA</span>
                  <strong>{active.localEta}</strong>
                </div>
                <div className="quoteMetric">
                  <span>Route source</span>
                  <strong>{quoteSource[active.id] === "http" ? "HTTP quote API" : "Fallback"}</strong>
                </div>
              </div>
            </div>
          ) : (
            <div className="emptyState">
              <strong>No quote yet</strong>
              <p>Lock the corridor quote first so the team can approve a specific route and amount.</p>
            </div>
          )}

          <section className="opsTimeline" aria-label="Operational handoffs">
            {operationalMilestones.map((item) => (
              <div className={`opsTimelineItem ${item.state}`} key={item.title}>
                <span className="opsTimelineDot" aria-hidden="true" />
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
              </div>
            ))}
          </section>

          {normalizedStage !== "local_processing" && normalizedStage !== "delivered" ? (
            <WalletPanel
              demoFunding={demoFunding}
              demoWalletAddress={storedDemoWallet?.address ?? null}
              demoWalletBalanceSol={demoWalletBalanceSol}
              demoWalletBalanceToken={demoWalletBalanceToken}
              ready={demoWalletReady}
              onCreateDemoWallet={createDemoWallet}
              onFundDemoWallet={() => void topUpDemoWallet()}
              onResetDemoWallet={resetDemoWallet}
            />
          ) : null}

          <section className="actionRail">
            <div className="actionRailHeader">
              <div>
                <h3>Next action</h3>
                <p>{actionRailCopy(active.stage)}</p>
              </div>
              <span className={`statusDot ${demoWalletReady ? "good" : "warn"}`}>
                {normalizedStage === "delivered"
                  ? "Case complete"
                  : normalizedStage === "local_processing"
                    ? "Waiting on local partner"
                    : demoWalletReady
                      ? "Stablecoin wallet ready"
                      : "Create or fund wallet"}
              </span>
            </div>

            {demoFundingReceipt && (
              <p className="successText">
                Demo wallet funded.{" "}
                <a className="linkAction" href={demoFundingReceipt.explorerUrl} target="_blank" rel="noreferrer">
                  Open funding transaction
                </a>
              </p>
            )}

            {devnetError && <p className="errorText">{devnetError}</p>}

            <div className="actions">
              {active.stage === "draft" ? (
                <button
                  className="ghost"
                  disabled={loadingId === active.id}
                  onClick={() => requestQuote(active)}
                  type="button"
                >
                  {loadingId === active.id ? "Locking quote..." : "Lock quote"}
                </button>
              ) : null}
              {active.stage === "quoted" ? (
                <button className="ghost" onClick={() => requestApproval(active)} type="button">
                  Request approval
                </button>
              ) : null}
              {(normalizedStage === "approval_requested" || normalizedStage === "wallet_ready") && storedDemoWallet ? (
                <button
                  className="secondary"
                  disabled={!demoWalletReady || approvingWallet}
                  onClick={() => void settleWithDemoWallet()}
                  type="button"
                >
                  {approvingWallet ? `Sending ${stablecoinSymbol}...` : demoWalletReady ? `Approve with demo wallet` : `Fund demo wallet first`}
                </button>
              ) : null}
              {(normalizedStage === "local_processing" || normalizedStage === "delivered") ? (
                <>
                  <button className="secondary" onClick={() => setScreen("receipt")} type="button">
                    Review receipt
                  </button>
                  {normalizedStage === "delivered" ? (
                    <button className="ghost" onClick={() => void startAnotherPayout()} type="button">
                      Start another payout
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
          </section>

          <div className="actions secondaryNav">
            <button className="ghost" onClick={() => onNavigate("/")} type="button">
              Back to landing
            </button>
            <button className="ghost" onClick={() => onNavigate("/blink")} type="button">
              Open Blink demo
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
