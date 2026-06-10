import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import fs from "fs";
import { randomUUID } from "crypto";
import { CONFIG } from "./config.js";
import { getSwapTransaction } from "./jupiter.js";
import { store } from "./store.js";
import type { ArbOpportunity } from "./types.js";

export function loadKeypair(): Keypair {
  const raw = JSON.parse(fs.readFileSync(CONFIG.WALLET_KEYPAIR_PATH!, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function decodeSwapTx(base64: string): VersionedTransaction {
  return VersionedTransaction.deserialize(Buffer.from(base64, "base64"));
}

function buildTipTx(keypair: Keypair, recentBlockhash: string): Transaction {
  const tx = new Transaction();
  tx.recentBlockhash = recentBlockhash;
  tx.feePayer = keypair.publicKey;
  tx.add(
    SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey: new PublicKey(CONFIG.JITO_TIP_ACCOUNT),
      lamports: CONFIG.JITO_TIP_LAMPORTS,
    }),
  );
  tx.sign(keypair);
  return tx;
}

async function submitJitoBundle(txs: (VersionedTransaction | Transaction)[]): Promise<string> {
  const encoded = txs.map((tx) =>
    tx instanceof VersionedTransaction
      ? bs58.encode(tx.serialize())
      : bs58.encode((tx as Transaction).serialize()),
  );

  const res = await fetch(`${CONFIG.JITO_BLOCK_ENGINE_URL}/api/v1/bundles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "sendBundle", params: [encoded] }),
  });
  if (!res.ok) throw new Error(`Jito ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { result: string; error?: { message: string } };
  if (json.error) throw new Error(`Jito: ${json.error.message}`);
  return json.result;
}

async function pollBundleStatus(bundleId: string, tradeId: string, maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    try {
      const res = await fetch(`${CONFIG.JITO_BLOCK_ENGINE_URL}/api/v1/bundles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getBundleStatuses",
          params: [[bundleId]],
        }),
      });
      const json = (await res.json()) as {
        result: { value: Array<{ confirmation_status: string; err: unknown }> };
      };
      const s = json.result?.value?.[0];
      if (!s) continue;
      if (s.err) {
        console.warn(`[executor] bundle ${bundleId} failed on-chain:`, JSON.stringify(s.err), "— basket rebalancer will recover any intermediate tokens");
        store.updateTradeStatus(tradeId, "failed");
        return;
      }
      if (s.confirmation_status === "confirmed" || s.confirmation_status === "finalized") {
        store.updateTradeStatus(tradeId, "confirmed");
        return;
      }
    } catch { /* retry */ }
  }
  // Timed out — mark failed conservatively
  store.updateTradeStatus(tradeId, "failed");
}

export async function executeArb(
  opp: ArbOpportunity,
  keypair: Keypair,
): Promise<void> {
  const tradeId = randomUUID();
  const route = opp.routeLabels.join(" → ");


  console.log(
    `[executor] arb net +${(opp.profitBps / 100).toFixed(2)}% (gross ${(opp.grossProfitBps / 100).toFixed(2)}%, cost ${(Number(opp.costLamports) / 1e9).toFixed(6)} SOL)  ${route}`,
  );

  const swapResponses = await Promise.all(
    opp.quotes.map((q) => getSwapTransaction(q, keypair.publicKey.toBase58())),
  );

  const swapTxs = swapResponses.map((s) => {
    const tx = decodeSwapTx(s.swapTransaction);
    tx.sign([keypair]);
    return tx;
  });

  // Use the swap tx's own blockhash for the tip tx — ensures all bundle txs share
  // the same blockhash, preventing Jito rejection from blockhash divergence.
  const bundleBlockhash = swapTxs[0].message.recentBlockhash;
  const tipTx = buildTipTx(keypair, bundleBlockhash);

  const bundleId = await submitJitoBundle([tipTx, ...swapTxs]);
  console.log(`[executor] bundle: ${bundleId}`);

  const trade = {
    id: tradeId,
    timestamp: Date.now(),
    profitSol: Number(opp.profitLamports) / 1e9,
    profitBps: opp.profitBps,
    route,
    dexLabels: opp.dexLabels,
    bundleId,
    status: "pending" as const,
    inputSol: Number(opp.inputLamports) / 1e9,
    outputSol: Number(opp.outputLamports) / 1e9,
  };

  store.addTrade(trade);

  // Poll in background — don't await
  pollBundleStatus(bundleId, tradeId).catch(console.error);
}
