import readline from "node:readline";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createLLMSession } from "./llmClient.js";
import { appendLog } from "./logManager.js";
import {
  createClientsFromConfig,
  type MCPConfigEntry,
} from "./mcpManager.js";

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

interface MCPClientRecord {
  client: Client;
  entry: MCPConfigEntry;
}

async function main() {
  console.log("Starting MCP-aware Chatbot (TypeScript)...");

  // 1. Cargar servidores MCP desde la configuración
  console.log("Loading MCP servers from config...");
  let clients: Record<string, MCPClientRecord>;
  try {
    clients = await createClientsFromConfig();
  } catch (err) {
    console.error("Failed to load MCP servers:", err);
    process.exit(1);
  }

  // 2. Preparar mapa reducido para el LLM (client + lista de tools)
  const mcpClients: Record<
    string,
    { client: Client; tools: MCPTool[] }
  > = {};

  for (const [name, record] of Object.entries(clients)) {
    try {
      const response = await record.client.listTools();
      const tools = (response.tools ?? []) as MCPTool[];
      mcpClients[name] = {
        client: record.client,
        tools,
      };
    } catch (err) {
      console.warn(`[MCP] ⚠️ Could not fetch tools for ${name}:`, err);
      mcpClients[name] = { client: record.client, tools: [] };
    }
  }

  // 3. Crear sesión LLM con awareness de MCPs
  const llm = createLLMSession(
    "You are an assistant that can answer general questions and orchestrate MCP servers when needed.",
    mcpClients
  );

  // 4. CLI loop
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "> ",
  });

  console.log("");
  console.log("Commands:");
  console.log("  /servers               -> List MCP servers");
  console.log("  /tools <serverName>    -> List tools on that server");
  console.log(
    '  /call <server> <tool> <jsonArgs>   -> Call tool, e.g. /call transfermarkt get-player-transfers {"playerName":"Romelu Lukaku"}'
  );
  console.log("  /history               -> Show LLM local conversation history");
  console.log("  /exit                  -> Quit");
  console.log("");
  rl.prompt();

  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }

    // Manejar comandos integrados
    if (trimmed === "/exit") {
      console.log("Bye!");
      process.exit(0);
    }

    if (trimmed === "/servers") {
      console.log("MCP servers loaded:");
      const serverNames = Object.keys(clients);
      if (serverNames.length === 0) {
        console.log(" - No servers loaded.");
      } else {
        for (const name of serverNames) {
          const clientRecord = clients[name];
          if (clientRecord) {
            console.log(` - ${name} (type: ${clientRecord.entry.type})`);
          }
        }
      }
      rl.prompt();
      return;
    }

    if (trimmed.startsWith("/tools")) {
      const parts = trimmed.split(/\s+/);
      if (parts.length !== 2) {
        console.log("Usage: /tools <serverName>");
        rl.prompt();
        return;
      }
      const serverName = parts[1];
      if (!serverName) {
        console.log("Server name is required.");
        rl.prompt();
        return;
      }
      const entry = clients[serverName];
      if (!entry) {
        console.log(`[MCP] ❌ Server not found: ${serverName}`);
        rl.prompt();
        return;
      }
      try {
        const response = await entry.client.listTools();
        const list = (response.tools ?? []) as MCPTool[];
        if (!Array.isArray(list)) {
          console.error(`[MCP] ❌ Unexpected response from ${serverName}.listTools:`, list);
          rl.prompt();
          return;
        }
        console.log(`Tools on ${serverName}:`);
        if (list.length === 0) {
          console.log(" - No tools available.");
        } else {
          for (const tool of list) {
            console.log(` - ${tool.name}: ${tool.description ?? "No description"}`);
          }
        }
      } catch (err) {
        console.error(`[MCP] ❌ Failed to list tools on ${serverName}:`, err);
      }
      rl.prompt();
      return;
    }

    if (trimmed.startsWith("/call")) {
      const re = /^\/call\s+(\S+)\s+(\S+)\s+(.+)/s;
      const match = trimmed.match(re);
      if (!match) {
        console.log('Usage: /call <server> <tool> <jsonArgs>');
        rl.prompt();
        return;
      }
      const [, serverName, toolName, jsonArgsStr] = match;
      if (!serverName || !toolName || !jsonArgsStr) {
        console.log('Invalid command format. Usage: /call <server> <tool> <jsonArgs>');
        rl.prompt();
        return;
      }
      const entry = clients[serverName];
      if (!entry) {
        console.log(`[MCP] ❌ Server not found: ${serverName}`);
        rl.prompt();
        return;
      }
      let argsObj: Record<string, unknown>;
      try {
        argsObj = JSON.parse(jsonArgsStr);
        if (typeof argsObj !== "object" || argsObj === null) {
          console.log("[MCP] ❌ Invalid JSON: Arguments must be an object.");
          rl.prompt();
          return;
        }
      } catch (err) {
        console.log("[MCP] ❌ Invalid JSON in arguments:", err);
        rl.prompt();
        return;
      }
      try {
        console.log(`[MCP] Calling ${serverName}.${toolName} with`, argsObj);
        const result = await entry.client.callTool({
          name: toolName,
          arguments: argsObj,
        });
        console.log(`[MCP] ✅ Result from ${serverName}.${toolName}:`);
        console.log(JSON.stringify(result, null, 2));

        await appendLog({
          type: "mcp_call",
          server: serverName,
          tool: toolName,
          arguments: argsObj,
          result,
        });
      } catch (err) {
        console.error(`[MCP] ❌ Failed to call ${serverName}.${toolName}:`, err);
      }
      rl.prompt();
      return;
    }

    if (trimmed === "/history") {
      try {
        const history = llm.getHistory();
        console.log("LLM history:");
        console.log(history || " - No history available.");
      } catch (err) {
        console.error("Failed to retrieve history:", err);
      }
      rl.prompt();
      return;
    }

    // de default: enviar mensaje al LLM
    try {
      const userText = trimmed;
      console.log(`[LLM] User ->`, userText);
      await appendLog({ type: "user_message", text: userText });

      const answer = await llm.ask(userText);
      console.log("[LLM] Assistant ->", answer);

      // Intentar parsear JSON
      let parsed: { action: string; args: Record<string, unknown> };
      try {
        parsed = JSON.parse(answer);
      } catch {
        // No es JSON -> solo imprimir
        await appendLog({ type: "assistant_message", text: answer, user: userText });
        rl.prompt();
        return;
      }

      if (parsed?.action && parsed?.args) {
        const [serverName, toolName] = parsed.action.split(".");
        if (serverName && toolName && clients[serverName]) {
          console.log(`[MCP] 🚀 Calling ${serverName}.${toolName} with`, parsed.args);
          const result = await clients[serverName].client.callTool({
            name: toolName,
            arguments: parsed.args,
          });
          console.log(`[MCP] ✅ Result from ${serverName}.${toolName}:`);
          console.log(JSON.stringify(result, null, 2));

          await appendLog({
            type: "mcp_call",
            server: serverName,
            tool: toolName,
            arguments: parsed.args,
            result,
          });
        } else {
          console.log("[MCP] ❌ Unknown server/tool in action:", parsed.action);
        }
      } else {
        await appendLog({ type: "assistant_message", text: answer, user: userText });
      }
    } catch (err) {
      console.error("[LLM] ❌ Error during LLM interaction:", err);
    }


    rl.prompt();
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});