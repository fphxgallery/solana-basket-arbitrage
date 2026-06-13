import fs from "fs";
import path from "path";
import { basketStore } from "./basket-store.js";
import { store } from "./store.js";
import { getSolUsd } from "./value-history.js";

const CONFIG_PATH = path.resolve(process.env.DATA_DIR ?? "./data", "telegram.json");

interface TelegramConfig {
  token: string;
  chatId: string;
  reportEnabled?: boolean;
  reportTime?: string | null; // "HH:MM" 24h, server local time
}

let config: TelegramConfig | null = null;

function load(): TelegramConfig | null {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) as TelegramConfig;
    }
  } catch { /* ignore */ }
  return null;
}

function save(cfg: TelegramConfig | null) {
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    if (cfg) {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
    } else {
      try { fs.unlinkSync(CONFIG_PATH); } catch { /* already gone */ }
    }
  } catch (e) {
    console.error("[telegram] save failed:", e);
  }
}

config = load();

export function setTelegramConfig(token: string, chatId: string) {
  config = { ...(config ?? {}), token, chatId };
  save(config);
}

export function clearTelegramConfig() {
  config = null;
  save(null);
}

export function getTelegramStatus(): {
  configured: boolean;
  chatId?: string;
  reportEnabled: boolean;
  reportTime: string | null;
} {
  return {
    configured: !!config?.token,
    chatId: config?.chatId,
    reportEnabled: config?.reportEnabled ?? false,
    reportTime: config?.reportTime ?? null,
  };
}

export function setReportSchedule(enabled: boolean, time: string | null) {
  if (!config) return; // no-op if telegram not configured
  config = { ...config, reportEnabled: enabled, reportTime: time };
  save(config);
}

export function getReportSchedule(): { enabled: boolean; time: string | null } {
  return {
    enabled: config?.reportEnabled ?? false,
    time: config?.reportTime ?? null,
  };
}

/** Fire-and-forget Telegram message. Silently swallows errors. */
export async function notify(message: string): Promise<void> {
  if (!config?.token || !config?.chatId) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${config.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: config.chatId, text: message, parse_mode: "HTML" }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("[telegram] send failed:", err);
    }
  } catch (e) {
    console.error("[telegram] notify failed:", e);
  }
}

/** Send the daily portfolio report. */
export async function sendDailyReport(): Promise<void> {
  if (!config?.token || !config?.chatId) return;

  const { holdings, totalValueSol, totalValueUsd, baselineTimestamp, pnlUsd, pnlPctUsd, hwmValueUsd, hwmCapturedAt } = basketStore;
  const basketConfig = basketStore.config;
  const solUsd = await getSolUsd();
  const walletSol = store.walletBalanceSol;

  const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  let msg = `📊 <b>Daily Report — ${date}</b>\n`;

  if (totalValueUsd > 0) {
    msg += `\n💼 Portfolio: <b>$${totalValueUsd.toFixed(2)}</b>`;
    if (totalValueSol > 0) msg += ` (${totalValueSol.toFixed(4)} SOL)`;
    msg += `\n`;
  }
  if (solUsd > 0) msg += `💲 SOL = $${solUsd.toFixed(2)}\n`;

  if (pnlUsd != null && pnlPctUsd != null) {
    const sign = pnlUsd >= 0 ? "+" : "-";
    const pctStr = pnlPctUsd >= 0 ? `+${pnlPctUsd.toFixed(2)}%` : `${pnlPctUsd.toFixed(2)}%`;
    msg += `📈 P&amp;L: <b>${sign}$${Math.abs(pnlUsd).toFixed(2)}</b> (${pctStr})`;
    if (baselineTimestamp) {
      const since = new Date(baselineTimestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      msg += ` since ${since}`;
    }
    msg += `\n`;
  }

  if (basketConfig.hwmEnabled && hwmValueUsd != null && hwmCapturedAt != null) {
    const elapsedDays = (Date.now() - hwmCapturedAt) / 86_400_000;
    const halfLife = basketConfig.hwmHalfLifeDays ?? 7;
    const toHalfLife = halfLife - elapsedDays;
    const timeStr = toHalfLife > 0
      ? (toHalfLife >= 1 ? `${toHalfLife.toFixed(1)}d` : `${(toHalfLife * 24).toFixed(0)}h`) + " to ½"
      : "past ½-life";
    msg += `🏔 Peak: <b>$${hwmValueUsd.toFixed(2)}</b> (${timeStr})\n`;
  }

  if (walletSol != null) {
    msg += `🏦 Wallet: ${walletSol.toFixed(4)} SOL`;
    if (solUsd > 0) msg += ` ($${(walletSol * solUsd).toFixed(2)})`;
    msg += `\n`;
  }

  if (holdings.length > 0) {
    msg += `\n<b>Holdings</b>\n<code>`;
    // Find longest symbol for padding
    const maxSym = Math.max(...holdings.map((h) => h.symbol.length), 6);
    for (const h of holdings) {
      const sym = h.symbol.padEnd(maxSym);
      const cur = `${h.currentWeight.toFixed(1)}%`.padStart(6);
      const tgt = `${h.targetWeight.toFixed(1)}%`.padStart(6);
      const drift = h.driftPct >= 0
        ? `+${h.driftPct.toFixed(1)}%`
        : `${h.driftPct.toFixed(1)}%`;
      msg += `${sym}  ${cur} → ${tgt}  (${drift})\n`;
    }
    msg += `</code>`;
  }

  await notify(msg);
}
