# Architecture Overview

## Frontend
`apps/web` is the main demo surface. It should render:
- payment order list
- payment packet detail
- policy and privacy context
- quote panel
- approval timeline
- settlement receipt

## Quote Engine
`services/quote-engine` is a lightweight service that returns:
- source amount
- destination amount
- FX rate
- route label
- estimated fee
- expiry timestamp
- route/provider identity

## Program Layer
`programs/escrow_router` is the future home for:
- payment order account model
- approval state
- release semantics
- memo/reference semantics
- settlement receipt data

## Data model

### Payment packet
- id
- payer
- beneficiary
- corridor
- source currency
- destination currency
- amount
- due date
- policy mode
- privacy mode
- memo reference

### Quote
- rate
- sourceAmount
- destinationAmount
- fee
- route
- expiresAt

### Payment Order
- id
- packetId
- status
- approvers
- treasuryWallet
- destinationWallet
- privacyMode
- policyLabel

## MVP implementation advice
- Fake the parts judges do not need to audit
- Make statuses and transitions feel real
- Invest in clear UI copy, references, and receipts
