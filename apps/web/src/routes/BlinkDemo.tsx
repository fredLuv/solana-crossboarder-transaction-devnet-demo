import React, { useEffect, useMemo, useState } from "react";
import type { DemoWalletSolFunding } from "../api";
import { fundDemoWalletSol } from "../api";
import {
  fetchBlinkActionsManifest,
  fetchBlinkCheckoutMetadata,
  postBlinkCheckoutAction,
  type BlinkActionMetadata,
  type BlinkActionsManifest,
  type BlinkActionPostResponse
} from "../blinkApi";
import {
  createDemoWalletRecord,
  getDemoWalletBalances,
  getStoredDemoWalletKeypair,
  loadStoredDemoWallet,
  saveStoredDemoWallet,
  signAndSendSerializedTransaction,
  type StoredDemoWallet
} from "../lib/demoWallet";

type BlinkRoute = "/" | "/transaction" | "/blink";

const SHOP_ITEMS = [
  {
    sku: "coffee",
    name: "Drift Coffee",
    description: "Single origin cup from the validator cafe",
    priceSol: 0.015,
    imageUrl: "/images/coffee.svg"
  },
  {
    sku: "sticker",
    name: "Blink Sticker Pack",
    description: "Three holo stickers for your laptop",
    priceSol: 0.006,
    imageUrl: "/images/stickers-pack.svg"
  },
  {
    sku: "hoodie",
    name: "Validator Hoodie",
    description: "Heavyweight hoodie with node-map print",
    priceSol: 0.08,
    imageUrl: "/images/hoodie-folded.svg"
  }
] as const;

export function BlinkDemo({
  onNavigate
}: {
  onNavigate: (path: BlinkRoute) => void;
}) {
  const [storedDemoWallet, setStoredDemoWallet] = useState<StoredDemoWallet | null>(() =>
    typeof window === "undefined" ? null : loadStoredDemoWallet()
  );
  const [demoWalletBalanceSol, setDemoWalletBalanceSol] = useState<number | null>(null);
  const [manifest, setManifest] = useState<BlinkActionsManifest | null>(null);
  const [metadata, setMetadata] = useState<BlinkActionMetadata | null>(null);
  const [actionPayload, setActionPayload] = useState<BlinkActionPostResponse | null>(null);
  const [fundingReceipt, setFundingReceipt] = useState<DemoWalletSolFunding | null>(null);
  const [settlement, setSettlement] = useState<{
    signature: string;
    explorerUrl: string;
    amountSol: number;
    sku: string;
    qty: number;
  } | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [loading, setLoading] = useState(false);
  const [funding, setFunding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [sku, setSku] = useState<(typeof SHOP_ITEMS)[number]["sku"]>("coffee");

  const demoWallet = useMemo(
    () => getStoredDemoWalletKeypair(storedDemoWallet),
    [storedDemoWallet]
  );
  const selectedItem = useMemo(
    () => SHOP_ITEMS.find((item) => item.sku === sku) ?? SHOP_ITEMS[0],
    [sku]
  );
  const totalSol = useMemo(
    () => Number((selectedItem.priceSol * qty).toFixed(6)),
    [selectedItem.priceSol, qty]
  );
  const requiredSol = useMemo(
    () => Number((totalSol + 0.002).toFixed(6)),
    [totalSol]
  );
  const walletReady = (demoWalletBalanceSol ?? 0) >= requiredSol;

  useEffect(() => {
    async function bootstrap() {
      try {
        const [nextManifest, nextMetadata] = await Promise.all([
          fetchBlinkActionsManifest(),
          fetchBlinkCheckoutMetadata()
        ]);
        setManifest(nextManifest);
        setMetadata(nextMetadata);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Could not reach the Blink API");
      }
    }

    void bootstrap();
  }, []);

  useEffect(() => {
    async function refreshBalances() {
      if (!demoWallet) {
        setDemoWalletBalanceSol(null);
        return;
      }

      try {
        const balances = await getDemoWalletBalances(demoWallet);
        setDemoWalletBalanceSol(balances.sol);
      } catch (_error) {
        setDemoWalletBalanceSol(null);
      }
    }

    void refreshBalances();
  }, [demoWallet, fundingReceipt, settlement]);

  function createDemoWallet() {
    const nextWallet = createDemoWalletRecord();
    saveStoredDemoWallet(nextWallet);
    setStoredDemoWallet(nextWallet);
    setFundingReceipt(null);
    setSettlement(null);
    setError(null);
  }

  function resetDemoWallet() {
    saveStoredDemoWallet(null);
    setStoredDemoWallet(null);
    setDemoWalletBalanceSol(null);
    setFundingReceipt(null);
    setSettlement(null);
  }

  async function bootstrapBlinkWallet() {
    if (!storedDemoWallet) return;

    setFunding(true);
    setError(null);
    try {
      const receipt = await fundDemoWalletSol(storedDemoWallet.address, requiredSol);
      setFundingReceipt(receipt);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not fund the demo wallet");
    } finally {
      setFunding(false);
    }
  }

  async function runCheckout() {
    if (!demoWallet) return;

    setLoading(true);
    setError(null);
    try {
      const postResponse = await postBlinkCheckoutAction({
        sku,
        qty,
        account: demoWallet.publicKey.toBase58(),
        skipBalanceCheck: false
      });

      setActionPayload(postResponse);
      const signature = await signAndSendSerializedTransaction(postResponse.transaction, demoWallet);
      setSettlement({
        signature,
        explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
        amountSol: totalSol,
        sku,
        qty
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Blink checkout failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="shell">
      <header className="hero simplifiedHero">
        <div>
          <p className="eyebrow">B2B payment (Blink) demo · Solana Devnet</p>
          <h1>Generate a Blink checkout action, then sign and send it on devnet.</h1>
          <p className="lede">
            This branch keeps the real Rust/Axum Blink backend intact. The frontend calls the Blink
            action API, receives an unsigned checkout transaction, then signs and submits it with the
            browser demo wallet.
          </p>
        </div>
        <div className="heroCard blinkHeroCard">
          <span className="heroLabel">Merchant checkout</span>
          <strong>Orbitflare Shop · Blink action receipt</strong>
          <p>Choose an item, bootstrap the wallet with devnet SOL, then complete a merchant payment.</p>
          <div className="heroSummary">
            <div>
              <span>Payer wallet</span>
              <strong>{storedDemoWallet ? walletReady ? "Ready to pay" : "Needs SOL top-up" : "Create wallet"}</strong>
            </div>
            <div>
              <span>Amount</span>
              <strong>{totalSol.toFixed(6)} SOL</strong>
            </div>
            <div>
              <span>Network</span>
              <strong>Solana devnet</strong>
            </div>
          </div>
        </div>
      </header>

      <main className="layout blinkLayout">
        <section className="panel blinkShopPanel">
          <div className="panelHeader">
            <div>
              <h2>Checkout items</h2>
              <p className="subhead">Pick one merchant checkout path, then request the Blink action payload.</p>
            </div>
            <span className="pill">Blink-backed</span>
          </div>

          <div className="shopGridDark">
            {SHOP_ITEMS.map((item) => (
              <button
                key={item.sku}
                className={`shopCard ${item.sku === sku ? "active" : ""}`}
                onClick={() => setSku(item.sku)}
                type="button"
              >
                <img alt={item.name} className="shopCardImage" loading="lazy" src={item.imageUrl} />
                <div>
                  <strong>{item.name}</strong>
                  <p>{item.description}</p>
                </div>
                <span>{item.priceSol.toFixed(3)} SOL</span>
              </button>
            ))}
          </div>

          <div className="blinkSheet">
            <div className="blinkSheetHead">
              <img alt={selectedItem.name} className="heroPhotoDark" src={selectedItem.imageUrl} />
              <div>
                <p className="merchant">Orbitflare Shop</p>
                <h3>{selectedItem.name}</h3>
                <p>{selectedItem.description}</p>
              </div>
              <strong>{selectedItem.priceSol.toFixed(3)} SOL each</strong>
            </div>

            <div className="blinkControls">
              <label>
                Quantity
                <input
                  max="20"
                  min="1"
                  type="number"
                  value={qty}
                  onChange={(event) =>
                    setQty(Math.max(1, Math.min(20, Number(event.target.value || 1))))
                  }
                />
              </label>
              <div className="totals darkTotals">
                <span>Subtotal</span>
                <span>{totalSol.toFixed(6)} SOL</span>
                <span>Network fee</span>
                <span>~0.000005 SOL</span>
                <strong>Total</strong>
                <strong>{(totalSol + 0.000005).toFixed(6)} SOL</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="panel detail">
          <div className="panelHeader">
            <div>
              <h2>Blink signer</h2>
              <p className="subhead">Use the same browser demo wallet foundation as the transaction flow.</p>
            </div>
            <span className={`pill ${storedDemoWallet ? "good" : ""}`}>
              {storedDemoWallet ? "Wallet loaded" : "Wallet needed"}
            </span>
          </div>

          <div className="stepList blinkSteps">
            <div className="stepListItem">
              <strong>1. Create wallet</strong>
              <span>Generate a browser-side signer that both demos can reuse.</span>
            </div>
            <div className="stepListItem">
              <strong>2. Fund wallet</strong>
              <span>Top up devnet SOL so the Blink checkout can pass its real balance check.</span>
            </div>
            <div className="stepListItem">
              <strong>3. Pay checkout</strong>
              <span>Call the Blink POST endpoint, sign the returned payload, and send it to devnet.</span>
            </div>
          </div>

          <div className="walletPanel disconnected">
            <div>
              <span>Wallet state</span>
              <strong>{storedDemoWallet ? walletReady ? "Demo wallet funded for checkout" : "Demo wallet needs devnet SOL" : "No browser demo wallet yet"}</strong>
              <p>
                {storedDemoWallet
                  ? "This wallet is shared with the transaction demo. For Blink, it only needs enough devnet SOL to pass the merchant checkout and network fee."
                  : "Create a demo wallet to make the Blink flow immediately usable without an extension wallet."}
              </p>
              {storedDemoWallet ? (
                <>
                  <p className="mono">{storedDemoWallet.address}</p>
                  <p className="helperText">{`${(demoWalletBalanceSol ?? 0).toFixed(4)} SOL available · ${requiredSol.toFixed(4)} SOL recommended for this checkout`}</p>
                </>
              ) : null}
            </div>
            <div className="connectorList">
              {!storedDemoWallet ? (
                <button className="secondary compact" onClick={createDemoWallet} type="button">
                  Create demo wallet
                </button>
              ) : (
                <>
                  <button className="secondary compact" disabled={funding} onClick={() => void bootstrapBlinkWallet()} type="button">
                    {funding ? "Funding wallet..." : `Fund wallet with ${requiredSol.toFixed(3)} SOL`}
                  </button>
                  <button className="ghost compact" onClick={resetDemoWallet} type="button">
                    Reset demo wallet
                  </button>
                </>
              )}
            </div>
          </div>

          {fundingReceipt ? (
            <p className="successText">
              Wallet funded with {fundingReceipt.amountSol.toFixed(3)} SOL.{" "}
              <a className="linkAction" href={fundingReceipt.explorerUrl} rel="noreferrer" target="_blank">
                Open funding transaction
              </a>
            </p>
          ) : null}
          {error ? <p className="errorText">{error}</p> : null}

          <div className="actionRail">
            <div className="actionRailHeader">
              <div>
                <h3>Checkout action</h3>
                <p>Once the wallet holds enough SOL, request the Blink payload, sign it in-browser, and submit the merchant payment on devnet.</p>
              </div>
              <span className={`statusDot ${settlement ? "good" : walletReady ? "good" : storedDemoWallet ? "warn" : ""}`}>
                {settlement ? "Payment sent" : walletReady ? "Ready to pay" : storedDemoWallet ? "Fund wallet first" : "Create wallet"}
              </span>
            </div>
            <div className="actions">
              <button
                className="secondary"
                disabled={!storedDemoWallet || loading || !walletReady}
                onClick={() => void runCheckout()}
                type="button"
              >
                {loading ? `Sending ${totalSol.toFixed(6)} SOL...` : `Pay ${(totalSol + 0.000005).toFixed(6)} SOL`}
              </button>
              <button className="ghost" onClick={() => setShowDetails((current) => !current)} type="button">
                {showDetails ? "Hide technical details" : "Show technical details"}
              </button>
            </div>
          </div>

          {!walletReady && storedDemoWallet ? (
            <p className="helperText">
              Fund the wallet before checkout. This item needs about {requiredSol.toFixed(4)} SOL including a small fee buffer.
            </p>
          ) : null}

          {settlement ? (
            <section className="panel blinkReceiptPanel">
              <div className="panelHeader">
                <div>
                  <h2>Checkout sent</h2>
                  <p className="subhead">The Blink action payload was signed in-browser and landed on Solana devnet.</p>
                </div>
                <span className="pill good">Confirmed</span>
              </div>
              <div className="receiptGrid">
                <div>
                  <span>Item</span>
                  <strong>{selectedItem.name}</strong>
                </div>
                <div>
                  <span>Quantity</span>
                  <strong>{settlement.qty}</strong>
                </div>
                <div>
                  <span>Total</span>
                  <strong>{settlement.amountSol.toFixed(6)} SOL</strong>
                </div>
                <div>
                  <span>Signature</span>
                  <strong className="mono">{settlement.signature}</strong>
                </div>
                <div>
                  <span>Explorer</span>
                  <strong>
                    <a className="linkAction" href={settlement.explorerUrl} rel="noreferrer" target="_blank">
                      Open transaction
                    </a>
                  </strong>
                </div>
              </div>
            </section>
          ) : null}

          {showDetails ? (
            <section className="technicalPanel">
              <article>
                <h3>actions.json</h3>
                <pre>{JSON.stringify(manifest, null, 2)}</pre>
              </article>
              <article>
                <h3>Checkout metadata</h3>
                <pre>{JSON.stringify(metadata, null, 2)}</pre>
              </article>
              <article>
                <h3>Latest checkout payload</h3>
                <pre>{JSON.stringify(actionPayload, null, 2)}</pre>
              </article>
            </section>
          ) : null}

          <div className="actions secondaryNav">
            <button className="ghost" onClick={() => onNavigate("/")} type="button">
              Back to landing
            </button>
            <button className="ghost" onClick={() => onNavigate("/transaction")} type="button">
              Open transaction demo
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
