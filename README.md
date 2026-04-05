# BorderOps

BorderOps is a Solana-native cross-border payout operations product.
This repo scaffold is now oriented around one clear wedge: help finance and ops teams
turn a payout request into a quoted, approved, settled, and reconciled payment order in one workflow.

## What this demo is doing
This prototype is intentionally product-first, but it now has a cleaner MVP boundary:

- one cross-border payout case
- one in-app demo wallet signer
- one stablecoin funding path
- one real Solana devnet settlement
- one receipt that combines business context and chain proof

The point of the prototype is to make the business story obvious:
- the user is a finance or operations team running cross-border payouts
- the pain is fragmented approvals, weak receipts, slow rails, and corridor-specific exceptions
- the value is faster payout, lower fees, cleaner internal controls, and better beneficiary support

Right now the quote engine is still mocked for determinism, but the wallet funding and settlement path is real on Solana devnet.

## What is actually on Solana today
The current prototype includes a real devnet boundary:
- a local BorderOps treasury keypair persisted under `services/quote-engine/.data/`
- a local demo stablecoin mint on devnet
- devnet balance checks via `@solana/web3.js`
- demo wallet funding with stablecoins plus fee SOL
- browser-side token transfer signed by the in-app demo wallet
- a transaction signature and explorer link returned to the receipt view

This means the flow is no longer purely mocked end to end. The quote is still mocked, but the funding and settlement legs are real devnet operations.

## What is not on Solana yet
- no Anchor program yet
- no end-user extension wallet flow yet
- no Token-2022 or confidential transfer flow yet
- no on-chain approval state machine yet

## Productionization status
This repo is now safer to run as a shareable MVP foundation:
- the web app reads API and RPC endpoints from `VITE_*` env vars
- the quote service reads host, port, cluster, RPC, and CORS settings from env
- the quote service persists the active payout case, funding events, and settlement receipts in SQLite
- request bodies are validated and size-limited before processing
- unused relay settlement endpoints have been removed from the product path
- swap files are ignored and removed from source

It is still not production money infrastructure. It is a cleaner demo architecture you can deploy, demo, and keep iterating on.

## What is in this scaffold
- `apps/web`: React frontend for the operator dashboard and demo flow
- `programs/escrow_router`: Solana program placeholder for payment order and approval logic
- `services/quote-engine`: quote generation logic for route simulation and savings estimates
- `services/quote-engine/server.mjs`: quote API, SQLite persistence, and devnet stablecoin funding service
- `docs/borderops-flow.md`: end-to-end product flow in founder/product terms
- `docs/mvp-plan.md`: build plan and milestone breakdown
- `docs/architecture.md`: system outline and MVP responsibilities

## Recommended MVP demo
1. Import a payout packet
2. Attach policy + privacy mode
3. Lock a payout quote
4. Create and fund the demo wallet
5. Approve from the demo wallet
6. Show settled receipt and audit trail

## Suggested stack
- Frontend: React + Vite + TypeScript
- Chain logic: Anchor / Rust
- Backend service: lightweight TypeScript service for mocked quotes and routing
- Wallet layer: multisig or delegated smart wallet flow

## How the current prototype is organized
- SQLite owns the active payout case plus the latest funding event and settlement receipt.
- The web app reads that persisted state on boot and restores the receipt screen after reload.
- The quote engine owns payout math, fee estimates, route labels, and expiry windows.
- The future program layer can own approval state and release semantics once we move more logic on-chain.

This means we can improve the demo in layers:
1. make the UI more interactive
2. move quote logic behind HTTP
3. add stronger wallet and receipt flows
4. later swap mocked pieces for real infrastructure

## Environment
Copy these before running locally:

```bash
cp apps/web/.env.example apps/web/.env.local
cp services/quote-engine/.env.example services/quote-engine/.env
```

Key values:
- `VITE_API_BASE_URL`: where the web app reaches the quote/funding service
- `VITE_SOLANA_RPC_HTTP` / `VITE_SOLANA_RPC_WS`: Solana RPC endpoints for the browser
- `ALLOWED_ORIGINS`: comma-separated browser origins allowed to call the quote service
- `SOLANA_RPC_HTTP`: RPC endpoint used by the funding service
- `DATA_DIR`: where the service keeps the local treasury, mint, and SQLite files
- `SQLITE_PATH`: optional override for the SQLite database location

## Local commands
Install dependencies:

```bash
pnpm install
```

Run the quote/funding service:

```bash
pnpm dev:api
```

Run the web app:

```bash
pnpm dev:web -- --host 127.0.0.1 --port 4174
```

## Getting started
This is a scaffold with a working interactive demo. After installing dependencies and env files, run the service and web app in separate terminals.

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
cp services/quote-engine/.env.example services/quote-engine/.env
pnpm dev:api
pnpm dev:web -- --host 127.0.0.1 --port 4174
```
