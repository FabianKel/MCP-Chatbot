import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import { appendLog } from "./logManager.js";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { type MCPTool } from "./chatbot.js";

dotenv.config();

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_KEY) {
  console.warn("Warning: ANTHROPIC_API_KEY not found in environment");
}

const anthClient = new Anthropic({ apiKey: ANTHROPIC_KEY });

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

interface MCPClients {
  [name: string]: { client: Client; tools: MCPTool[] };
}

export function createLLMSession(systemPrompt = "", mcpClients?: MCPClients) {
  const history: ChatMessage[] = [];

  // Construir lista de tools disponibles
  const toolsList = mcpClients && Object.keys(mcpClients).length > 0
    ? Object.entries(mcpClients)
        .map(([server, rec]) =>
          `Server "${server}" tools:\n` +
          rec.tools.map(
            (t) => `- ${t.name}: ${t.description ?? "No description"}`
          ).join("\n")
        )
        .join("\n")
    : "No MCP tools available.";

  const basePrompt =
    systemPrompt +
    `\n\nYou have access to external MCP tools. 
If the user asks something that matches a tool, respond in JSON ONLY with this format:

{"action":"<server>.<tool>","args":{...}}

Available tools (use EXACT tool names and argument names as listed):
${toolsList}

Examples:
- To get the last transfer of a player: {"action":"transfermarkt.get-last-transfer","args":{"playerName":"Oliver Giroud"}}
- To get players in specific clubs: {"action":"transfermarkt.players-in-clubs","args":{"clubs":["Juventus","Barcelona"]}}`;

  if (systemPrompt) history.push({ role: "system", content: basePrompt });

  return {
    ask: async (userText: string) => {
      history.push({ role: "user", content: userText });

      const prompt = history
        .map((m) => (m.role === "user" ? `User: ${m.content}` : `${m.content}`))
        .join("\n");

      try {
        const response = await anthClient.messages.create({
          model: "claude-3-haiku-20240307",
          messages: [{ role: "user", content: `${prompt}\nAssistant:` }],
          max_tokens: 512,
        });

        let assistantText = "";
        if (response?.content && response.content.length > 0) {
          const firstBlock = response.content[0];
          if (firstBlock?.type === "text") {
            assistantText = (firstBlock as { text: string }).text.trim();
          }
        }

        if (!assistantText) {
          assistantText = "⚠️ No text returned from LLM";
        }

        // Procesar múltiples objetos JSON
        const jsonObjects: any[] = [];
        const lines = assistantText.split("\n").filter(line => line.trim());
        for (const line of lines) {
          try {
            const maybeObj = JSON.parse(line);
            if (maybeObj && typeof maybeObj === "object" && maybeObj.action && maybeObj.args) {
              jsonObjects.push(maybeObj);
            }
          } catch {
          }
        }

        if (jsonObjects.length > 0) {
          let finalResult = "";
          for (const maybeObj of jsonObjects) {
            console.log(`[LLM] Parsed JSON action:`, maybeObj);
            let [serverName, toolName] = maybeObj.action.split(".");
            
            const entry = mcpClients?.[serverName];
            if (!entry) {
              console.error(`[MCP] Server not found: ${serverName}`);
              finalResult += `\n⚠️ MCP server not found: ${serverName}`;
              continue;
            }

            // Validar que la herramienta existe
            if (!entry.tools.some(t => t.name === toolName)) {
              console.error(`[MCP] Tool not found: ${toolName} on ${serverName}`);
              finalResult += `\n⚠️ MCP tool not found: ${toolName}`;
              continue;
            }

            console.log(`[LLM] Calling MCP tool ${serverName}.${toolName} with`, maybeObj.args);

            try {
              const result = await entry.client.callTool({
                name: toolName,
                arguments: maybeObj.args,
              });

              await appendLog({
                type: "mcp_call",
                server: serverName,
                tool: toolName,
                arguments: maybeObj.args,
                result,
                source: "llm",
              });

              const resultStr = JSON.stringify(result, null, 2);

              // Enviar el resultado de vuelta al LLM para resumirlo
              const summaryPrompt = `Summarize this MCP tool result in a readable format for the user: ${resultStr}`;
              const summaryResponse = await anthClient.messages.create({
                model: "claude-3-haiku-20240307",
                messages: [{ role: "user", content: summaryPrompt }],
                max_tokens: 512,
              });

              let summaryText = "";
              if (summaryResponse?.content && summaryResponse.content.length > 0) {
                const firstBlock = summaryResponse.content[0];
                if (firstBlock?.type === "text") {
                  summaryText = (firstBlock as { text: string }).text.trim();
                }
              }

              history.push({ role: "assistant", content: summaryText });
              finalResult += `\n${summaryText}`;
            } catch (err) {
              console.error(`[MCP] Failed to call ${serverName}.${toolName}:`, err);
              finalResult += `\n⚠️ MCP call failed: ${String(err)}`;
            }
          }
          return finalResult.trim();
        }

        history.push({ role: "assistant", content: assistantText });
        return assistantText;
      } catch (err) {
        console.error("[LLM] Error during LLM call:", err);
        return `⚠️ LLM error: ${String(err)}`;
      }
    },

    getHistory: () => history.map((h) => `${h.role}: ${h.content}`).join("\n"),
  };
}