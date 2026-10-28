import type { Config } from "../config/index.js";

export class TelegramNotificationError extends Error {
  constructor(
    message: string,
    readonly statusCode = 502,
  ) {
    super(message);
    this.name = "TelegramNotificationError";
  }
}

export function missingTelegramSettings(config: Config) {
  return (["TG_NOTIFY_BOT_TOKEN", "TG_NOTIFY_BOT_CHAT"] as const).filter(
    (name) => !config[name]?.trim(),
  );
}

export async function notifyNewVisitor(config: Config) {
  const missing = missingTelegramSettings(config);

  if (missing.length)
    throw new TelegramNotificationError(
      `Telegram notifications require ${missing.join(" and ")}.`,
      503,
    );

  const response = await fetch(
    `https://api.telegram.org/bot${config.TG_NOTIFY_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.TG_NOTIFY_BOT_CHAT,
        text: "[AI Agent Showcase] Новый посетитель",
      }),
      signal: AbortSignal.timeout(5000),
    },
  );

  const result = await response.json();

  if (!response.ok || result.ok !== true) {
    const code = Number(result.error_code) || response.status;

    const reason =
      code === 401
        ? "Check TG_NOTIFY_BOT_TOKEN."
        : code === 400 || code === 403
          ? "Check TG_NOTIFY_BOT_CHAT and the bot's access to that chat."
          : "Check Telegram availability and rate limits.";

    throw new TelegramNotificationError(
      `Telegram rejected the notification (${code}). ${reason}`,
    );
  }
}
