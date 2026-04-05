# Solana-CrossBorder-Transaction-Devnet-Demo

![Solana-CrossBorder-Transaction-Devnet-Demo](docs/assets/solana-crossboarder-transaction-devnet-demo.png)

Solana-CrossBorder-Transaction-Devnet-Demo is a single Solana devnet app with two working flows:

- `Transaction demo` for a cross-border contractor payout release
- `B2B payment (Blink) demo` for a Blink-style merchant checkout

Both paths run against devnet and are designed to finish with a real transaction and explorer proof.

## What is real

- browser-based demo wallet flow
- demo stablecoin mint on Solana devnet
- real devnet funding and token transfer
- real Blink checkout payload generation from a Rust/Axum service
- receipt with transaction signature and explorer link
- SQLite-backed payout case, funding event, and receipt state

## What is still mocked

- FX quote generation
- local payout partner response
- compliance / approval policy logic
- beneficiary onboarding and payout intake

## Repo structure

- `apps/web` – React/Vite operator UI
- `services/quote-engine` – local API for quotes, SQLite persistence, and devnet funding helpers
- `services/blink-api` – Rust/Axum Blink action backend for checkout and tip flows
- `docs` – product notes and architecture
- `programs/escrow_router` – placeholder for future on-chain approval logic

## Run locally

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
cp services/quote-engine/.env.example services/quote-engine/.env
cp services/blink-api/.env.example services/blink-api/.env
pnpm dev:api
pnpm dev:blink
pnpm dev:web
```

Then open [http://127.0.0.1:4174/](http://127.0.0.1:4174/).

## Demo flow

1. Open the landing page and choose either the transaction or Blink path.
2. Create a browser demo wallet.
3. Fund it for the chosen flow.
4. Send the devnet transaction.
5. Review the receipt and explorer proof.

## Current limits

This is not production money infrastructure.
There is no real custody separation, no production auth, no real payout partner integration, and no on-chain approval program yet.
