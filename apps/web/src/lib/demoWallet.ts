import {
  clusterApiUrl,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAccount,
  getAssociatedTokenAddressSync
} from "@solana/spl-token";

export type StoredDemoWallet = {
  address: string;
  secretKey: number[];
};

export const DEMO_WALLET_STORAGE_KEY = "solana-crossboarder-transaction-devnet-demo.demoWallet";
export const demoConnection = new Connection(clusterApiUrl("devnet"), "confirmed");

export function loadStoredDemoWallet(): StoredDemoWallet | null {
  try {
    const raw = window.localStorage.getItem(DEMO_WALLET_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDemoWallet;
    if (!parsed?.address || !Array.isArray(parsed.secretKey)) return null;
    return parsed;
  } catch (_error) {
    return null;
  }
}

export function saveStoredDemoWallet(wallet: StoredDemoWallet | null) {
  if (!wallet) {
    window.localStorage.removeItem(DEMO_WALLET_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(DEMO_WALLET_STORAGE_KEY, JSON.stringify(wallet));
}

export function createDemoWalletRecord(): StoredDemoWallet {
  const keypair = Keypair.generate();
  return {
    address: keypair.publicKey.toBase58(),
    secretKey: Array.from(keypair.secretKey)
  };
}

export function getStoredDemoWalletKeypair(wallet: StoredDemoWallet | null): Keypair | null {
  if (!wallet) return null;
  return Keypair.fromSecretKey(Uint8Array.from(wallet.secretKey));
}

export async function getDemoWalletBalances(
  wallet: Keypair,
  options: {
    mintAddress?: string | null;
    tokenDecimals?: number;
  } = {}
) {
  const lamports = await demoConnection.getBalance(wallet.publicKey, "confirmed");
  let tokenBalance = 0;

  if (options.mintAddress) {
    const ata = getAssociatedTokenAddressSync(
      new PublicKey(options.mintAddress),
      wallet.publicKey
    );
    tokenBalance = await getAccount(demoConnection, ata, "confirmed", TOKEN_PROGRAM_ID)
      .then((account) => Number(account.amount) / 10 ** (options.tokenDecimals ?? 6))
      .catch(() => 0);
  }

  return {
    sol: Number((lamports / LAMPORTS_PER_SOL).toFixed(4)),
    token: Number(tokenBalance.toFixed(2))
  };
}

export async function signAndSendSerializedTransaction(
  serializedBase64: string,
  signer: Keypair
) {
  const transaction = Transaction.from(Buffer.from(serializedBase64, "base64"));
  transaction.partialSign(signer);
  const signature = await demoConnection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed"
  });

  await demoConnection.confirmTransaction(signature, "confirmed");
  return signature;
}
