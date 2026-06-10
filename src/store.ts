import { EventEmitter } from "events";

export interface TradeRecord {
  id: string;
  timestamp: number;
  profitSol: number;
  profitBps: number;
  route: string;        // "SOL → TOKEN → USDC → SOL"
  dexLabels: string[];  // DEX per leg
  bundleId: string;
  status: "pending" | "confirmed" | "failed";
  inputSol: number;
  outputSol: number;
}

export interface BotState {
  running: boolean;
  startedAt: number | null;
  error: string | null;
}

export interface StoreSnapshot {
  botState: BotState;
  trades: TradeRecord[];
  totalProfitSol: number;
  totalTrades: number;
  walletBalanceSol: number | null;
}

const MAX_TRADES = 100;

class Store extends EventEmitter {
  trades: TradeRecord[] = [];
  botState: BotState = { running: false, startedAt: null, error: null };
  totalProfitSol = 0;
  totalTrades = 0;
  walletBalanceSol: number | null = null;

  addTrade(trade: TradeRecord) {
    this.trades.unshift(trade);
    if (this.trades.length > MAX_TRADES) this.trades.pop();
    this.emit("update", "trade", trade);
  }

  updateTradeStatus(id: string, status: TradeRecord["status"]) {
    const t = this.trades.find((r) => r.id === id);
    if (!t) return;
    const wasPending = t.status === "pending";
    t.status = status;
    if (status === "confirmed" && wasPending) {
      this.totalTrades++;
      this.totalProfitSol += t.profitSol;
    }
    this.emit("update", "trade", t);
  }

  setBotState(patch: Partial<BotState>) {
    Object.assign(this.botState, patch);
    this.emit("update", "status", this.botState);
  }

  setWalletBalance(sol: number) {
    this.walletBalanceSol = sol;
    this.emit("update", "balance", sol);
  }

  snapshot(): StoreSnapshot {
    return {
      botState: { ...this.botState },
      trades: [...this.trades],
      totalProfitSol: this.totalProfitSol,
      totalTrades: this.totalTrades,
      walletBalanceSol: this.walletBalanceSol,
    };
  }
}

export const store = new Store();
