import fs from "fs/promises";
const LOG_PATH = "chatlog.json";

export async function appendLog(entry: any) {
  try {
    let logs: any[] = [];
    try {
      const raw = await fs.readFile(LOG_PATH, "utf8");
      logs = JSON.parse(raw);
    } catch {
      logs = [];
    }
    logs.push({ timestamp: new Date().toISOString(), ...entry });
    await fs.writeFile(LOG_PATH, JSON.stringify(logs, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to write log:", err);
  }
}
