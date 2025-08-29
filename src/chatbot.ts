// src/chatbot.ts
import { startSession } from "./llmClient.js";
import { logInteraction } from "./logManager.js";
import { connectMcpClients } from "./mcpClients.js";
import readline from "readline";

async function main() {
  console.log("Chatbot MCP iniciado...\n");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Inicializar LLM y MCP clients
  const llmSession = await startSession();
  const mcpClients = await connectMcpClients();

  const context: string[] = []; // Para mantener historial de la conversación

  rl.on("line", async (input: string) => {
    if (input.toLowerCase() === "salir") {
      console.log("Cerrando chatbot...");
      rl.close();
      return;
    }

    // Guardar en historial
    context.push(`Usuario: ${input}`);

    // Enviar al LLM
    const response = await llmSession.ask(input, context);
    context.push(`Bot: ${response}`);

    console.log(`${response}`);

    // Guardar log
    await logInteraction(input, response);
  });
}

main();
