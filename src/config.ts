import "dotenv/config";

const apiKey = process.env.HELIUS_API_KEY;
if (!apiKey) throw new Error("HELIUS_API_KEY missing from .env");

const apiToken = process.env.API_TOKEN;
if (!apiToken || apiToken.length < 16) {
  throw new Error("API_TOKEN missing or too short (min 16 chars) — generate one with: openssl rand -hex 32");
}

const WSOL  = "So11111111111111111111111111111111111111112";
const USDC  = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (isNaN(n)) throw new Error(`${key} must be an integer, got: "${raw}"`);
  return n;
}

export const CONFIG = {
  WSOL_MINT: WSOL,
  USDC_MINT: USDC,

  API_TOKEN: apiToken,

  HELIUS_API_KEY: apiKey,
  RPC_URL: `https://mainnet.helius-rpc.com/?api-key=${apiKey}`,

  WALLET_KEYPAIR_PATH: process.env.WALLET_KEYPAIR_PATH ?? "./wallet/keypair.json",

  // Slippage for basket pricing quotes
  SLIPPAGE_BPS: 100,
  // Priority fee for rebalance swaps
  PRIORITY_FEE_LAMPORTS: envInt("PRIORITY_FEE_LAMPORTS", 100000),

  // Basket pricing + rebalance swaps use the Jupiter lite API
  JUPITER_LITE_QUOTE_URL: "https://lite-api.jup.ag/swap/v1/quote",
  JUPITER_LITE_SWAP_URL: "https://lite-api.jup.ag/swap/v1/swap",
  // Higher slippage for rebalance swaps (not latency-sensitive, just needs to fill)
  REBALANCE_SLIPPAGE_BPS: 300,

  PORT: envInt("PORT", 3420),
} as const;
