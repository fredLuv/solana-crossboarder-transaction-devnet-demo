import React from "react";

export function Landing({
  onNavigate
}: {
  onNavigate: (path: "/" | "/transaction" | "/blink") => void;
}) {
  return (
    <div className="shell">
      <header className="landingIntro">
        <div className="landingCopy">
          <p className="eyebrow">Solana-CrossBorder-Transaction-Devnet-Demo · Devnet</p>
          <h1>Choose a working Solana devnet flow.</h1>
          <p className="lede">
            One app, two runnable demos. Pick the transaction path for a B2B payout release, or the
            Blink path for a merchant checkout action that signs and lands on devnet.
          </p>
        </div>
        <div className="landingFacts">
          <span className="landingFact">Real devnet send</span>
          <span className="landingFact">Browser demo wallet</span>
          <span className="landingFact">Explorer proof</span>
        </div>
      </header>

      <main className="landingGrid">
        <section className="landingPanel compact">
          <p className="eyebrow">Transaction demo</p>
          <h2>Cross-border payout release</h2>
          <p>
            Run a US to Argentina contractor payout with quote lock, signer funding, on-chain release,
            and local delivery follow-through.
          </p>
          <ul className="featureList">
            <li>Operator-style payout lifecycle</li>
            <li>dUSDC demo rail and receipt</li>
            <li>SQLite-backed case state</li>
          </ul>
          <button className="secondary" onClick={() => onNavigate("/transaction")} type="button">
            Open transaction demo
          </button>
        </section>

        <section className="landingPanel compact">
          <p className="eyebrow">B2B payment (Blink) demo</p>
          <h2>Blink checkout on devnet</h2>
          <p>
            Request a Blink checkout action from the Axum backend, sign it with the browser wallet,
            and send the merchant payment on devnet.
          </p>
          <ul className="featureList">
            <li>Real Rust/Axum Blink backend</li>
            <li>Unsigned checkout payloads</li>
            <li>In-browser signing and explorer proof</li>
          </ul>
          <button className="secondary" onClick={() => onNavigate("/blink")} type="button">
            Open Blink demo
          </button>
        </section>
      </main>
    </div>
  );
}
