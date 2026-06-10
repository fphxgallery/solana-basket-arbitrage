import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import fs from "fs";
import path from "path";
import { CONFIG } from "./config.js";

export function walletExists(): boolean {
  return fs.existsSync(CONFIG.WALLET_KEYPAIR_PATH!);
}

/** Load the signing keypair from disk. Throws if missing/invalid. */
export function loadKeypair(): Keypair {
  const raw = JSON.parse(fs.readFileSync(CONFIG.WALLET_KEYPAIR_PATH!, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

export function getWalletPublicKey(): string | null {
  if (!walletExists()) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG.WALLET_KEYPAIR_PATH!, "utf-8")) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(raw)).publicKey.toBase58();
  } catch {
    return null;
  }
}

export function createWallet(): { publicKey: string; secretKey: string } {
  const kp = Keypair.generate();
  saveKeypair(kp);
  return {
    publicKey: kp.publicKey.toBase58(),
    secretKey: bs58.encode(kp.secretKey),
  };
}

export function importWallet(raw: string): string {
  const kp = parseKeypair(raw.replace(/\s+/g, ""));
  if (!kp) throw new Error("invalid_key");
  saveKeypair(kp);
  return kp.publicKey.toBase58();
}

function parseKeypair(raw: string): Keypair | null {
  // JSON byte array — Solana CLI format: [1,2,3,...,64]
  if (raw.startsWith("[")) {
    try {
      const arr = JSON.parse(raw) as number[];
      return Keypair.fromSecretKey(Uint8Array.from(arr));
    } catch { /* fall through */ }
  }

  // Base58 — try as 64-byte secret key first, then 32-byte seed
  try {
    const bytes = bs58.decode(raw);
    if (bytes.length === 64) return Keypair.fromSecretKey(bytes);
    if (bytes.length === 32) return Keypair.fromSeed(bytes);
  } catch { /* fall through */ }

  return null;
}

function saveKeypair(kp: Keypair) {
  const dir = path.dirname(CONFIG.WALLET_KEYPAIR_PATH!);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    CONFIG.WALLET_KEYPAIR_PATH!,
    JSON.stringify(Array.from(kp.secretKey)),
    { mode: 0o600 },
  );
}
