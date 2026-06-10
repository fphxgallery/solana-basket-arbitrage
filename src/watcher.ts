import WebSocket from "ws";
import { CONFIG, runtimeConfig } from "./config.js";

type SwapCallback = () => void;

export interface Watcher {
  stop: () => void;
}

export function startWatcher(onSwap: SwapCallback): Watcher {
  let ws: WebSocket | null = null;
  let stopped = false;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let reconnectDelay = 1000;

  function connect() {
    if (stopped) return;

    ws = new WebSocket(CONFIG.WS_URL);

    ws.on("open", () => {
      reconnectDelay = 1000;
      console.log("[watcher] connected");

      ws!.send(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "transactionSubscribe",
          params: [
            { accountInclude: [runtimeConfig.TOKEN_MINT], type: "all" },
            {
              commitment: "processed",
              encoding: "jsonParsed",
              transactionDetails: "accounts",
              maxSupportedTransactionVersion: 0,
            },
          ],
        }),
      );
    });

    ws.on("message", (raw: Buffer) => {
      let msg: unknown;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if ((msg as { id?: unknown }).id !== undefined) return;

      const n = msg as {
        method?: string;
        params?: { result?: { transaction?: { accountData?: Array<{ account: string }> } } };
      };

      if (n.method !== "transactionNotification") return;

      const accounts = n.params?.result?.transaction?.accountData?.map((a) => a.account) ?? [];
      if (accounts.some((a) => (CONFIG.DEX_PROGRAMS as unknown as string[]).includes(a))) {
        onSwap();
      }
    });

    ws.on("close", () => {
      if (stopped) return;
      console.warn(`[watcher] disconnected — reconnecting in ${reconnectDelay}ms`);
      reconnectTimer = setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
    });

    ws.on("error", (err) => {
      console.error("[watcher] error:", err.message);
      // terminate forces the "close" event to fire, which triggers reconnect
      ws?.terminate();
    });
  }

  connect();

  return {
    stop() {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
      console.log("[watcher] stopped");
    },
  };
}
