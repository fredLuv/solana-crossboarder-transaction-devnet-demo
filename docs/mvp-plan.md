# Solana-CrossBorder-Transaction-Devnet-Demo MVP Plan

## Goal
Ship an MVP that proves one thing well: a finance or ops team can turn a cross-border payout request
into a quoted, approved, and settled payment order on Solana.

## Demo promise
The MVP should feel like an operating system for payouts, not a crypto dashboard.

## Scope

### In scope
- Operator dashboard with pending payment orders
- Payment packet detail screen
- Policy and privacy layer for each order
- Quote lock interaction with mocked or semi-mocked FX route
- Approval step with wallet action placeholder
- Settlement success screen
- Savings, timing, and receipt summary

### Out of scope
- Real compliance stack
- Full fiat on/off-ramp integration
- Production underwriting
- Full ERP integrations

## Milestones

### Milestone 1: Story-first frontend
- Build dashboard, payment order detail, policy card, quote card, approval state, and receipt screen
- Hardcode a small set of demo orders across payroll, supplier payout, and revenue-share use cases
- Show fee and time comparisons

### Milestone 2: Route + quote service
- Add mock quote engine endpoint
- Return FX rate, fee, expiry, and route label
- Simulate quote refresh and expiry

### Milestone 3: Payment order state machine
- Model statuses: draft, quoted, approval_requested, approved, settled
- Persist state locally or in memory for demo reliability

### Milestone 4: Solana approval story
- Wallet connect placeholder or multisig-style modal
- Simulate approval signature capture
- Model memo/reference and receipt semantics
- If time allows, write minimal on-chain instruction flow

### Milestone 5: Polish for judging
- Add savings summary and timing delta
- Add order-linked metadata
- Create a 90-second demo path with zero dead ends

## Roles
- Product / pitch: keep the narrative on cross-border payout operations and internal controls
- Frontend: own the full payment-order journey
- Service layer: own quote and route simulation
- Program layer: own payment order model and future escrow primitives

## Success criteria
- A judge can understand the user in 15 seconds
- A judge can see the whole flow in 90 seconds
- The value prop is operational and financial, not only technical

## Best stretch feature
Supplier advance mode: pay beneficiary today, settle the payer or platform later.
