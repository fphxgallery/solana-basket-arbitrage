import fs from "fs";
import path from "path";

const CONFIG_PATH = path.resolve(process.env.DATA_DIR ?? "./data", "telegram.json");

interface TelegramConfig {
  token: string;
  chatId: string;
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
  config = { token, chatId };
  save(config);
}

export function clearTelegramConfig() {
  config = null;
  save(null);
}

export function getTelegramStatus(): { configured: boolean; chatId?: string } {
  return config
    ? { configured: true, chatId: config.chatId }
    : { configured: false };
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
