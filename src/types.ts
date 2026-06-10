export interface JupiterQuote {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee: null | { amount: string; feeBps: number };
  priceImpactPct: string;
  routePlan: RoutePlan[];
  contextSlot: number;
  timeTaken: number;
}

export interface RoutePlan {
  swapInfo: {
    ammKey: string;
    label: string;
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
    feeAmount: string;
    feeMint: string;
  };
  percent: number;
}

export interface ArbOpportunity {
  quotes: JupiterQuote[];       // one per leg
  route: string[];              // mint addresses [WSOL, TOKEN, ..., WSOL]
  routeLabels: string[];        // human-readable ["SOL", "TOKEN", ..., "SOL"]
  dexLabels: string[];          // DEX used per leg ["Raydium", "Meteora", ...]
  inputLamports: bigint;
  outputLamports: bigint;
  profitLamports: bigint;
  profitBps: number;
}

export interface SwapResponse {
  swapTransaction: string;
  lastValidBlockHeight: number;
  prioritizationFeeLamports: number;
}
