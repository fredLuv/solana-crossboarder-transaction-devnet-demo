# Solana Blink API (Axum)

Minimal Blink-compatible backend with two actions: `tip` and `checkout`.

![Checkout Portal](./docs/checkout-portal.png)

- `GET /actions.json` exposes routing rules.
- `GET /api/actions/tip` returns action metadata and parameters.
- `POST /api/actions/tip?to=<pubkey>&amount=<sol>` returns an unsigned SOL transfer transaction.
- `GET /api/actions/checkout` returns shop checkout metadata.
- `POST /api/actions/checkout?sku=<coffee|sticker|hoodie>&qty=<1-20>` returns an unsigned shop payment transaction.

## Run

```bash
cd /Users/fred/Solana/solana-crossboarder-transaction-devnet-demo
cp services/blink-api/.env.example services/blink-api/.env
cargo run --manifest-path services/blink-api/Cargo.toml
```

## Quick test

```bash
curl http://localhost:3000/actions.json

curl http://localhost:3000/api/actions/tip

curl -X POST "http://localhost:3000/api/actions/tip?to=DAw5ebjQBFruAFb7aehTTdbWixeTS3oS1BUAiZtKAvea&amount=0.01" \
  -H "Content-Type: application/json" \
  -d '{"account":"YOUR_WALLET_PUBKEY"}'

curl -X POST "http://localhost:3000/api/actions/checkout?sku=coffee&qty=2&skip_balance_check=true" \
  -H "Content-Type: application/json" \
  -d '{"account":"YOUR_WALLET_PUBKEY"}'
```

The POST response includes base64 transaction bytes for a wallet client to sign and send.

For demo use without a funded devnet account, append `&skip_balance_check=true` to still get an unsigned transaction payload.

## React scaffold frontend

The unified frontend lives in `apps/web`. Run `pnpm dev:web` from the repo root, then open `http://127.0.0.1:4174/blink`.
