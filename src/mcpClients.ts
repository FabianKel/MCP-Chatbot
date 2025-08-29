// src/mcpClients.ts
import { McpClient } from "@modelcontextprotocol/sdk";

// Aquí luego se pueden conectar los oficiales (filesystem, git)
export async function connectMcpClients() {
  console.log("🔌 Conectando a servidores MCP...");

  // Ejemplo para tu futuro custom server:
  // const client = new McpClient({ url: "http://localhost:4000" });
  // await client.connect();

  return {
    // fsServer: client1,
    // gitServer: client2,
  };
}
