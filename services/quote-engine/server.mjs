import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import {
  clusterApiUrl,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction
} from "@solana/web3.js";
import {
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createInitializeMintInstruction,
  createMintToInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddressSync
} from "@solana/spl-token";

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 8789);
const cluster = process.env.SOLANA_CLUSTER || "devnet";
const rpcHttpEndpoint = process.env.SOLANA_RPC_HTTP || clusterApiUrl(cluster);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || path.join(__dirname, ".data");
const dbPath = process.env.SQLITE_PATH || path.join(dataDir, "borderops.sqlite");
const treasuryPath = path.join(dataDir, "devnet-treasury.json");
const mintPath = path.join(dataDir, "devnet-stablecoin-mint.json");
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const stablecoinSymbol = process.env.STABLECOIN_SYMBOL || "dUSDC";
const stablecoinDecimals = Number(process.env.STABLECOIN_DECIMALS || 6);
const stablecoinTreasuryTarget = Number(process.env.STABLECOIN_TREASURY_TARGET || 250_000);
const requestBodyLimitBytes = Number(process.env.REQUEST_BODY_LIMIT_BYTES || 32_768);

const connection = new Connection(rpcHttpEndpoint, "confirmed");

const defaultPayoutCase = {
  id: "BOP-2401",
  shipper: "Northstar Commerce US",
  supplier: "Takenos Contractor Desk",
  lane: "US company -> Argentina contractor payout",
  origin: "Delaware, USA",
  destination: "Buenos Aires, Argentina",
  sourceAmount: 38400,
  sourceCurrency: "USD",
  destinationCurrency: "ARS",
  dueLabel: "Payroll closes today, 14:00 ART",
  riskLabel: "Ops needs same-day release before payroll cutoff.",
  stage: "approval_requested",
  operator: "Camila / Payroll ops",
  approvals: ["Finance controller"],
  policyLabel: "Selective privacy + dual approval",
  privacyMode: "selective",
  paymentPurpose: "Contractor payroll batch",
  memoReference: "PAYROLL-MAR-AR",
  beneficiaryAddress: "5RfYoTYcCjKjDoDKradrBChFGxSCUi1mvpDDEKVK8oLx",
  recipientName: "Lucia Fernandez",
  deliveryMethod: "ARS bank transfer",
  bankRail: "CVU alias delivery",
  bankAlias: "lucia.payroll.mp",
  complianceNote: "Contractor services payout, low-risk recurring payroll, under corridor limit.",
  offRampPartner: "Takenos Argentina payout partner",
  localEta: "Under 15 minutes after release",
  payoutCaseId: "AR-PAY-93841"
};

const quoteBook = {
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

await ensureDir(dataDir);

const db = new DatabaseSync(dbPath);
initializeDatabase();
seedDefaultPayoutCase();

function nowIso() {
  return new Date().toISOString();
}

function initializeDatabase() {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS payout_cases (
      id TEXT PRIMARY KEY,
      shipper TEXT NOT NULL,
      supplier TEXT NOT NULL,
      lane TEXT NOT NULL,
      origin TEXT NOT NULL,
      destination TEXT NOT NULL,
      source_amount REAL NOT NULL,
      source_currency TEXT NOT NULL,
      destination_currency TEXT NOT NULL,
      due_label TEXT NOT NULL,
      risk_label TEXT NOT NULL,
      stage TEXT NOT NULL,
      operator TEXT NOT NULL,
      approvals_json TEXT NOT NULL,
      policy_label TEXT NOT NULL,
      privacy_mode TEXT NOT NULL,
      payment_purpose TEXT NOT NULL,
      memo_reference TEXT NOT NULL,
      beneficiary_address TEXT NOT NULL,
      recipient_name TEXT NOT NULL,
      delivery_method TEXT NOT NULL,
      bank_rail TEXT NOT NULL,
      bank_alias TEXT NOT NULL,
      compliance_note TEXT NOT NULL,
      off_ramp_partner TEXT NOT NULL,
      local_eta TEXT NOT NULL,
      payout_case_id TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS funding_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payout_id TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      amount_token REAL NOT NULL,
      top_up_sol REAL NOT NULL,
      wallet_balance_sol REAL NOT NULL,
      wallet_stable_balance REAL NOT NULL,
      signature TEXT NOT NULL,
      explorer_url TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (payout_id) REFERENCES payout_cases(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settlement_receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payout_id TEXT NOT NULL,
      cluster TEXT NOT NULL,
      signature TEXT NOT NULL UNIQUE,
      explorer_url TEXT NOT NULL,
      payer_address TEXT NOT NULL,
      beneficiary_address TEXT NOT NULL,
      amount_token REAL NOT NULL,
      asset_symbol TEXT NOT NULL,
      mint_address TEXT NOT NULL,
      memo_reference TEXT NOT NULL,
      local_delivery_id TEXT NOT NULL,
      local_delivery_method TEXT NOT NULL,
      off_ramp_partner TEXT NOT NULL,
      expected_eta TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (payout_id) REFERENCES payout_cases(id) ON DELETE CASCADE
    );
  `);
}

function seedDefaultPayoutCase() {
  const existing = db.prepare("SELECT id FROM payout_cases WHERE id = ?").get(defaultPayoutCase.id);
  if (existing) return;

  const createdAt = nowIso();
  db.prepare(`
    INSERT INTO payout_cases (
      id, shipper, supplier, lane, origin, destination, source_amount, source_currency,
      destination_currency, due_label, risk_label, stage, operator, approvals_json,
      policy_label, privacy_mode, payment_purpose, memo_reference, beneficiary_address,
      recipient_name, delivery_method, bank_rail, bank_alias, compliance_note,
      off_ramp_partner, local_eta, payout_case_id, is_active, created_at, updated_at
    ) VALUES (
      @id, @shipper, @supplier, @lane, @origin, @destination, @sourceAmount, @sourceCurrency,
      @destinationCurrency, @dueLabel, @riskLabel, @stage, @operator, @approvalsJson,
      @policyLabel, @privacyMode, @paymentPurpose, @memoReference, @beneficiaryAddress,
      @recipientName, @deliveryMethod, @bankRail, @bankAlias, @complianceNote,
      @offRampPartner, @localEta, @payoutCaseId, 1, @createdAt, @updatedAt
    )
  `).run({
    id: defaultPayoutCase.id,
    shipper: defaultPayoutCase.shipper,
    supplier: defaultPayoutCase.supplier,
    lane: defaultPayoutCase.lane,
    origin: defaultPayoutCase.origin,
    destination: defaultPayoutCase.destination,
    sourceAmount: defaultPayoutCase.sourceAmount,
    sourceCurrency: defaultPayoutCase.sourceCurrency,
    destinationCurrency: defaultPayoutCase.destinationCurrency,
    dueLabel: defaultPayoutCase.dueLabel,
    riskLabel: defaultPayoutCase.riskLabel,
    stage: defaultPayoutCase.stage,
    operator: defaultPayoutCase.operator,
    approvalsJson: JSON.stringify(defaultPayoutCase.approvals),
    policyLabel: defaultPayoutCase.policyLabel,
    privacyMode: defaultPayoutCase.privacyMode,
    paymentPurpose: defaultPayoutCase.paymentPurpose,
    memoReference: defaultPayoutCase.memoReference,
    beneficiaryAddress: defaultPayoutCase.beneficiaryAddress,
    recipientName: defaultPayoutCase.recipientName,
    deliveryMethod: defaultPayoutCase.deliveryMethod,
    bankRail: defaultPayoutCase.bankRail,
    bankAlias: defaultPayoutCase.bankAlias,
    complianceNote: defaultPayoutCase.complianceNote,
    offRampPartner: defaultPayoutCase.offRampPartner,
    localEta: defaultPayoutCase.localEta,
    payoutCaseId: defaultPayoutCase.payoutCaseId,
    createdAt,
    updatedAt: createdAt
  });
}

function mapPayoutCaseRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    shipper: row.shipper,
    supplier: row.supplier,
    lane: row.lane,
    origin: row.origin,
    destination: row.destination,
    sourceAmount: Number(row.source_amount),
    sourceCurrency: row.source_currency,
    destinationCurrency: row.destination_currency,
    dueLabel: row.due_label,
    riskLabel: row.risk_label,
    stage: row.stage,
    operator: row.operator,
    approvals: JSON.parse(row.approvals_json),
    policyLabel: row.policy_label,
    privacyMode: row.privacy_mode,
    paymentPurpose: row.payment_purpose,
    memoReference: row.memo_reference,
    beneficiaryAddress: row.beneficiary_address,
    recipientName: row.recipient_name,
    deliveryMethod: row.delivery_method,
    bankRail: row.bank_rail,
    bankAlias: row.bank_alias,
    complianceNote: row.compliance_note,
    offRampPartner: row.off_ramp_partner,
    localEta: row.local_eta,
    payoutCaseId: row.payout_case_id
  };
}

function getActivePayoutCase() {
  const row = db.prepare(`
    SELECT *
    FROM payout_cases
    WHERE is_active = 1
    ORDER BY updated_at DESC
    LIMIT 1
  `).get();

  return mapPayoutCaseRow(row);
}

function getLatestFundingEvent(payoutId) {
  if (!payoutId) return null;
  const row = db.prepare(`
    SELECT *
    FROM funding_events
    WHERE payout_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `).get(payoutId);

  if (!row) return null;
  return {
    walletAddress: row.wallet_address,
    amountToken: Number(row.amount_token),
    topUpSol: Number(row.top_up_sol),
    walletBalanceSol: Number(row.wallet_balance_sol),
    walletStableBalance: Number(row.wallet_stable_balance),
    signature: row.signature,
    explorerUrl: row.explorer_url,
    createdAt: row.created_at
  };
}

function getLatestSettlementReceipt(payoutId) {
  if (!payoutId) return null;
  const row = db.prepare(`
    SELECT *
    FROM settlement_receipts
    WHERE payout_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `).get(payoutId);

  if (!row) return null;
  return {
    cluster: row.cluster,
    signature: row.signature,
    explorerUrl: row.explorer_url,
    payerAddress: row.payer_address,
    beneficiaryAddress: row.beneficiary_address,
    amountToken: Number(row.amount_token),
    assetSymbol: row.asset_symbol,
    mintAddress: row.mint_address,
    memoReference: row.memo_reference,
    localDeliveryId: row.local_delivery_id,
    localDeliveryMethod: row.local_delivery_method,
    offRampPartner: row.off_ramp_partner,
    expectedEta: row.expected_eta,
    createdAt: row.created_at
  };
}

function updatePayoutStage(payoutId, stage, approvals) {
  db.prepare(`
    UPDATE payout_cases
    SET stage = ?, approvals_json = ?, updated_at = ?
    WHERE id = ?
  `).run(stage, JSON.stringify(approvals), nowIso(), payoutId);
}

function recordFundingEvent(payoutId, event) {
  if (!payoutId) return;
  db.prepare(`
    INSERT INTO funding_events (
      payout_id, wallet_address, amount_token, top_up_sol, wallet_balance_sol,
      wallet_stable_balance, signature, explorer_url, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    payoutId,
    event.walletAddress,
    event.amountToken,
    event.topUpSol,
    event.walletBalanceSol,
    event.walletStableBalance,
    event.signature,
    event.explorerUrl,
    nowIso()
  );
}

function recordSettlementReceipt(payoutId, receipt) {
  db.prepare(`
    INSERT OR REPLACE INTO settlement_receipts (
      payout_id, cluster, signature, explorer_url, payer_address, beneficiary_address,
      amount_token, asset_symbol, mint_address, memo_reference, local_delivery_id,
      local_delivery_method, off_ramp_partner, expected_eta, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    payoutId,
    receipt.cluster,
    receipt.signature,
    receipt.explorerUrl,
    receipt.payerAddress,
    receipt.beneficiaryAddress,
    receipt.amountToken,
    receipt.assetSymbol,
    receipt.mintAddress,
    receipt.memoReference,
    receipt.localDeliveryId,
    receipt.localDeliveryMethod,
    receipt.offRampPartner,
    receipt.expectedEta,
    nowIso()
  );

  updatePayoutStage(payoutId, "local_processing", ["Finance controller", "Ops lead"]);
}

function buildNextCaseSeed() {
  const suffix = String(Date.now()).slice(-6);
  return {
    payoutCaseId: `AR-PAY-${suffix}`,
    memoReference: `PAYROLL-${suffix}-AR`,
    dueLabel: "Next payout case opened for release review."
  };
}

function resetDemoPayout(payoutId) {
  const payoutCase = getActivePayoutCase();
  if (!payoutCase || payoutCase.id !== payoutId) {
    throw new Error("Active payout case not found.");
  }

  const latestFundingEvent = getLatestFundingEvent(payoutId);
  const nextStage = latestFundingEvent ? "wallet_ready" : "approval_requested";
  const nextApprovals = ["Finance controller"];
  const nextSeed = buildNextCaseSeed();

  db.prepare(`DELETE FROM settlement_receipts WHERE payout_id = ?`).run(payoutId);

  db.prepare(`
    UPDATE payout_cases
    SET stage = ?,
        approvals_json = ?,
        payout_case_id = ?,
        memo_reference = ?,
        due_label = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    nextStage,
    JSON.stringify(nextApprovals),
    nextSeed.payoutCaseId,
    nextSeed.memoReference,
    nextSeed.dueLabel,
    nowIso(),
    payoutId
  );

  return {
    payoutCase: getActivePayoutCase(),
    latestFundingEvent: getLatestFundingEvent(payoutId),
    latestReceipt: null
  };
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (allowedOrigins.length === 0) return true;
  return allowedOrigins.includes(origin);
}

function corsHeaders(origin) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  if (allowedOrigins.length === 0) {
    return { ...headers, "Access-Control-Allow-Origin": "*" };
  }

  if (origin && isAllowedOrigin(origin)) {
    return { ...headers, "Access-Control-Allow-Origin": origin, Vary: "Origin" };
  }

  return headers;
}

function sendJson(request, response, statusCode, payload) {
  response.writeHead(statusCode, corsHeaders(request.headers.origin));
  response.end(JSON.stringify(payload));
}

function buildQuote(invoice) {
  const preset = quoteBook[invoice.id];
  if (preset) {
    return {
      ...preset,
      sourceAmount: invoice.sourceAmount,
      sourceCurrency: invoice.sourceCurrency,
      destinationCurrency: invoice.destinationCurrency
    };
  }

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

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function readKeypair(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(content)));
}

async function writeKeypair(filePath, keypair) {
  await fs.writeFile(filePath, JSON.stringify(Array.from(keypair.secretKey)), "utf8");
}

async function readJsonBody(request) {
  return await new Promise((resolve, reject) => {
    let body = "";
    let size = 0;

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > requestBodyLimitBytes) {
        reject(new Error(`Request body too large. Limit is ${requestBodyLimitBytes} bytes.`));
        request.destroy();
        return;
      }
      body += chunk;
    });

    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error(error instanceof Error ? error.message : "Invalid JSON body"));
      }
    });

    request.on("error", (error) => reject(error));
  });
}

function assertString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return value.trim();
}

function assertNumber(value, field, options = {}) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${field} must be a valid number.`);
  }
  if ("min" in options && value < options.min) {
    throw new Error(`${field} must be >= ${options.min}.`);
  }
  if ("max" in options && value > options.max) {
    throw new Error(`${field} must be <= ${options.max}.`);
  }
  return value;
}

function validateQuoteRequest(payload) {
  return {
    id: assertString(payload.id, "id"),
    sourceAmount: assertNumber(payload.sourceAmount, "sourceAmount", { min: 1 }),
    sourceCurrency: assertString(payload.sourceCurrency, "sourceCurrency"),
    destinationCurrency: assertString(payload.destinationCurrency, "destinationCurrency")
  };
}

function validateWalletFundingRequest(payload) {
  const address = assertString(payload.address, "address");
  const amountToken = assertNumber(
    typeof payload.amountToken === "number" ? payload.amountToken : 500,
    "amountToken",
    { min: 1, max: 10_000 }
  );
  const topUpSol = assertNumber(
    typeof payload.topUpSol === "number" ? payload.topUpSol : 0.02,
    "topUpSol",
    { min: 0, max: 0.25 }
  );
  const payoutId = typeof payload.payoutId === "string" ? payload.payoutId.trim() : "";

  try {
    new PublicKey(address);
  } catch (_error) {
    throw new Error("address must be a valid Solana public key.");
  }

  return {
    address,
    amountToken,
    topUpSol,
    payoutId: payoutId || null
  };
}

function validateStageUpdateRequest(payload) {
  const stage = assertString(payload.stage, "stage");
  const allowedStages = new Set([
    "draft",
    "quoted",
    "approval_requested",
    "wallet_ready",
    "local_processing",
    "delivered",
    "settled"
  ]);
  if (!allowedStages.has(stage)) {
    throw new Error(
      "stage must be one of draft, quoted, approval_requested, wallet_ready, local_processing, delivered, settled."
    );
  }
  const approvals = Array.isArray(payload.approvals)
    ? payload.approvals.map((item, index) => assertString(item, `approvals[${index}]`))
    : [];

  return { stage, approvals };
}

function validateSettlementReceiptRequest(payload) {
  return {
    cluster,
    signature: assertString(payload.signature, "signature"),
    explorerUrl: assertString(payload.explorerUrl, "explorerUrl"),
    payerAddress: assertString(payload.payerAddress, "payerAddress"),
    beneficiaryAddress: assertString(payload.beneficiaryAddress, "beneficiaryAddress"),
    amountToken: assertNumber(payload.amountToken, "amountToken", { min: 0 }),
    assetSymbol: assertString(payload.assetSymbol, "assetSymbol"),
    mintAddress: assertString(payload.mintAddress, "mintAddress"),
    memoReference: assertString(payload.memoReference, "memoReference"),
    localDeliveryId: assertString(payload.localDeliveryId, "localDeliveryId"),
    localDeliveryMethod: assertString(payload.localDeliveryMethod, "localDeliveryMethod"),
    offRampPartner: assertString(payload.offRampPartner, "offRampPartner"),
    expectedEta: assertString(payload.expectedEta, "expectedEta")
  };
}

async function loadOrCreateTreasury() {
  try {
    return await readKeypair(treasuryPath);
  } catch (_error) {
    const keypair = Keypair.generate();
    await writeKeypair(treasuryPath, keypair);
    return keypair;
  }
}

async function loadOrCreateMint() {
  try {
    return await readKeypair(mintPath);
  } catch (_error) {
    const keypair = Keypair.generate();
    await writeKeypair(mintPath, keypair);
    return keypair;
  }
}

async function getBalanceSol(publicKey) {
  const lamports = await connection.getBalance(publicKey, "confirmed");
  return Number((lamports / LAMPORTS_PER_SOL).toFixed(4));
}

async function ensureTreasuryFunded(treasury) {
  const balance = await connection.getBalance(treasury.publicKey, "confirmed");
  if (balance >= 0.2 * LAMPORTS_PER_SOL) return;

  try {
    const signature = await connection.requestAirdrop(treasury.publicKey, 1 * LAMPORTS_PER_SOL);
    const latest = await connection.getLatestBlockhash("confirmed");
    await connection.confirmTransaction({
      signature,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight
    }, "confirmed");
  } catch (error) {
    throw new Error(
      `Devnet treasury needs funding. Airdrop was rate-limited. Top up ${treasury.publicKey.toBase58()} on devnet and retry. Original error: ${error instanceof Error ? error.message : "unknown"}`
    );
  }
}

function stablecoinUnits(amount) {
  return Math.round(amount * 10 ** stablecoinDecimals);
}

function formatStablecoin(units) {
  return Number((units / 10 ** stablecoinDecimals).toFixed(2));
}

async function getTokenBalance(owner, mintAddress) {
  const ata = getAssociatedTokenAddressSync(mintAddress, owner);
  const ataInfo = await connection.getAccountInfo(ata, "confirmed");
  if (!ataInfo) return 0;
  const account = await getAccount(connection, ata, "confirmed");
  return Number(account.amount);
}

async function ensureStablecoinRail() {
  const treasury = await loadOrCreateTreasury();
  const mint = await loadOrCreateMint();

  await ensureTreasuryFunded(treasury);

  const mintInfo = await connection.getAccountInfo(mint.publicKey, "confirmed");
  if (!mintInfo) {
    const lamports = await connection.getMinimumBalanceForRentExemption(MINT_SIZE, "confirmed");
    const transaction = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: treasury.publicKey,
        newAccountPubkey: mint.publicKey,
        space: MINT_SIZE,
        lamports,
        programId: TOKEN_PROGRAM_ID
      }),
      createInitializeMintInstruction(
        mint.publicKey,
        stablecoinDecimals,
        treasury.publicKey,
        null,
        TOKEN_PROGRAM_ID
      )
    );

    await sendAndConfirmTransaction(connection, transaction, [treasury, mint], {
      commitment: "confirmed"
    });
  }

  const treasuryAta = getAssociatedTokenAddressSync(mint.publicKey, treasury.publicKey);
  const treasuryAtaInfo = await connection.getAccountInfo(treasuryAta, "confirmed");
  if (!treasuryAtaInfo) {
    const transaction = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        treasury.publicKey,
        treasuryAta,
        treasury.publicKey,
        mint.publicKey
      )
    );

    await sendAndConfirmTransaction(connection, transaction, [treasury], {
      commitment: "confirmed"
    });
  }

  const treasuryTokenBalance = await getTokenBalance(treasury.publicKey, mint.publicKey);
  if (treasuryTokenBalance < stablecoinUnits(stablecoinTreasuryTarget)) {
    const refillUnits = stablecoinUnits(stablecoinTreasuryTarget - formatStablecoin(treasuryTokenBalance) + 10_000);
    const transaction = new Transaction().add(
      createMintToInstruction(mint.publicKey, treasuryAta, treasury.publicKey, refillUnits)
    );

    await sendAndConfirmTransaction(connection, transaction, [treasury], {
      commitment: "confirmed"
    });
  }

  return {
    mintAddress: mint.publicKey,
    treasury,
    treasuryAta
  };
}

async function fundStablecoinWallet(address, amountToken = 500, topUpSol = 0.02, payoutId = null) {
  const { mintAddress, treasury, treasuryAta } = await ensureStablecoinRail();
  const wallet = new PublicKey(address);
  const walletAta = getAssociatedTokenAddressSync(mintAddress, wallet);
  const instructions = [];
  const walletAtaInfo = await connection.getAccountInfo(walletAta, "confirmed");

  if (!walletAtaInfo) {
    instructions.push(
      createAssociatedTokenAccountInstruction(
        treasury.publicKey,
        walletAta,
        wallet,
        mintAddress
      )
    );
  }

  const walletLamports = await connection.getBalance(wallet, "confirmed");
  if (walletLamports < topUpSol * LAMPORTS_PER_SOL) {
    instructions.push(
      SystemProgram.transfer({
        fromPubkey: treasury.publicKey,
        toPubkey: wallet,
        lamports: Math.round(topUpSol * LAMPORTS_PER_SOL)
      })
    );
  }

  instructions.push(
    createTransferCheckedInstruction(
      treasuryAta,
      mintAddress,
      walletAta,
      treasury.publicKey,
      stablecoinUnits(amountToken),
      stablecoinDecimals
    )
  );

  const transaction = new Transaction().add(...instructions);
  const signature = await sendAndConfirmTransaction(connection, transaction, [treasury], {
    commitment: "confirmed"
  });

  const result = {
    ok: true,
    cluster,
    treasuryAddress: treasury.publicKey.toBase58(),
    treasuryBalanceSol: await getBalanceSol(treasury.publicKey),
    treasuryStableBalance: formatStablecoin(await getTokenBalance(treasury.publicKey, mintAddress)),
    walletAddress: wallet.toBase58(),
    walletBalanceSol: await getBalanceSol(wallet),
    walletStableBalance: formatStablecoin(await getTokenBalance(wallet, mintAddress)),
    stablecoinMint: mintAddress.toBase58(),
    stablecoinSymbol,
    stablecoinDecimals,
    amountToken,
    topUpSol,
    signature,
    explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`
  };

  recordFundingEvent(payoutId, result);
  return result;
}

async function devnetStatus() {
  const { mintAddress, treasury } = await ensureStablecoinRail();
  return {
    ok: true,
    cluster,
    treasuryAddress: treasury.publicKey.toBase58(),
    treasuryBalanceSol: await getBalanceSol(treasury.publicKey),
    treasuryStableBalance: formatStablecoin(await getTokenBalance(treasury.publicKey, mintAddress)),
    stablecoinMint: mintAddress.toBase58(),
    stablecoinSymbol,
    stablecoinDecimals
  };
}

const server = http.createServer(async (request, response) => {
  if (!isAllowedOrigin(request.headers.origin)) {
    sendJson(request, response, 403, { ok: false, error: "Origin not allowed" });
    return;
  }

  if (request.method === "OPTIONS") {
    sendJson(request, response, 204, {});
    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    sendJson(request, response, 200, {
      ok: true,
      service: "quote-engine",
      cluster,
      stablecoinSymbol
    });
    return;
  }

  if (request.method === "GET" && request.url === "/devnet/status") {
    try {
      sendJson(request, response, 200, await devnetStatus());
    } catch (error) {
      sendJson(request, response, 500, {
        ok: false,
        error: "Failed to fetch devnet status",
        detail: error instanceof Error ? error.message : "unknown"
      });
    }
    return;
  }

  if (request.method === "GET" && request.url === "/payouts/active") {
    const payoutCase = getActivePayoutCase();
    if (!payoutCase) {
      sendJson(request, response, 404, { ok: false, error: "No active payout case" });
      return;
    }
    sendJson(request, response, 200, {
      payoutCase,
      latestFundingEvent: getLatestFundingEvent(payoutCase.id),
      latestReceipt: getLatestSettlementReceipt(payoutCase.id)
    });
    return;
  }

  if (request.method === "POST" && request.url === "/quote") {
    try {
      const invoice = validateQuoteRequest(await readJsonBody(request));
      sendJson(request, response, 200, buildQuote(invoice));
    } catch (error) {
      sendJson(request, response, 400, {
        ok: false,
        error: "Invalid request body",
        detail: error instanceof Error ? error.message : "unknown"
      });
    }
    return;
  }

  if (request.method === "POST" && request.url === "/devnet/stablecoin/fund") {
    try {
      const payload = validateWalletFundingRequest(await readJsonBody(request));
      sendJson(
        request,
        response,
        200,
        await fundStablecoinWallet(payload.address, payload.amountToken, payload.topUpSol, payload.payoutId)
      );
    } catch (error) {
      const statusCode = error instanceof Error && error.message.includes("must") ? 400 : 500;
      sendJson(request, response, statusCode, {
        ok: false,
        error: "Stablecoin wallet funding failed",
        detail: error instanceof Error ? error.message : "unknown"
      });
    }
    return;
  }

  const payoutStageMatch = request.method === "POST" && request.url?.match(/^\/payouts\/([^/]+)\/stage$/);
  if (payoutStageMatch) {
    try {
      const payload = validateStageUpdateRequest(await readJsonBody(request));
      updatePayoutStage(decodeURIComponent(payoutStageMatch[1]), payload.stage, payload.approvals);
      sendJson(request, response, 200, { ok: true });
    } catch (error) {
      sendJson(request, response, 400, {
        ok: false,
        error: "Payout stage update failed",
        detail: error instanceof Error ? error.message : "unknown"
      });
    }
    return;
  }

  const payoutReceiptMatch = request.method === "POST" && request.url?.match(/^\/payouts\/([^/]+)\/receipts$/);
  if (payoutReceiptMatch) {
    try {
      const payload = validateSettlementReceiptRequest(await readJsonBody(request));
      recordSettlementReceipt(decodeURIComponent(payoutReceiptMatch[1]), payload);
      sendJson(request, response, 200, { ok: true });
    } catch (error) {
      sendJson(request, response, 400, {
        ok: false,
        error: "Receipt persistence failed",
        detail: error instanceof Error ? error.message : "unknown"
      });
    }
    return;
  }

  const payoutResetMatch = request.method === "POST" && request.url?.match(/^\/payouts\/([^/]+)\/reset-demo$/);
  if (payoutResetMatch) {
    try {
      const payload = resetDemoPayout(decodeURIComponent(payoutResetMatch[1]));
      sendJson(request, response, 200, payload);
    } catch (error) {
      sendJson(request, response, 400, {
        ok: false,
        error: "Demo payout reset failed",
        detail: error instanceof Error ? error.message : "unknown"
      });
    }
    return;
  }

  sendJson(request, response, 404, { ok: false, error: "Not found" });
});

server.listen(port, host, () => {
  console.log(`BorderOps quote API listening on http://${host}:${port} (cluster=${cluster})`);
});
