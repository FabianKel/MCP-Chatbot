// src/logManager.ts
import fs from "fs/promises";

const LOG_FILE = "chatlog.json";

export async function logInteraction(user: string, bot: string) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    user,
    bot,
  };

  try {
    let logs: any[] = [];
    try {
      const data = await fs.readFile(LOG_FILE, "utf-8");
      logs = JSON.parse(data);
    } catch {
      logs = [];
    }

    logs.push(logEntry);
    await fs.writeFile(LOG_FILE, JSON.stringify(logs, null, 2));
  } catch (err) {
    console.error("Error guardando log:", err);
  }
}
