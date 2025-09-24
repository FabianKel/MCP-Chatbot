import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import fs from "fs/promises";
import path from "path";
import 'dotenv/config';

interface StdioServerParameters {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
}

interface ClientParameters {
  transport?: StdioClientTransport;
  url?: string;
  name: string;
  version: string;
  title?: string;
  websiteUrl?: string;
  icons?: Array<{
    src: string;
    mimeType?: string;
    sizes?: string;
    [x: string]: unknown;
  }>;
}

export type MCPConfigEntry =
  | {
      name: string;
      type: "stdio";
      command: string;
      args: string[];
      cwd?: string;
      env?: Record<string, string>;
    }
  | {
      name: string;
      type: "url";
      url: string;
    };

export async function loadMcpConfig(configPath = "src/mcp_config.json") {
  try {
    const raw = await fs.readFile(configPath, "utf8");
    const cfg = JSON.parse(raw) as MCPConfigEntry[];
    return cfg;
  } catch (err) {
    console.error(`Failed to load MCP config from ${configPath}:`, err);
    throw err;
  }
}

export async function createClientsFromConfig(
  configPath = "src/mcp_config.json"
) {
  const cfg = await loadMcpConfig(configPath);
  const clients: Record<string, { client: Client; entry: MCPConfigEntry }> = {};

  for (const entry of cfg) {
    try {
      if (entry.type === "stdio") {
        const transportConfig: StdioServerParameters = {
          command: entry.command,
          args: entry.args,
        };

        if (entry.cwd !== undefined) {
          transportConfig.cwd = entry.cwd;
        }

        if (entry.env) {
          const envVars: Record<string, string> = {};
          for (const key in entry.env) {
            const envValue = process.env[key] || entry.env[key];
            if (!envValue) {
              console.error(`Error: Environment variable ${key} is missing for ${entry.name}.`);
              throw new Error(`Missing environment variable ${key}`);
            }
            envVars[key] = envValue;
          }
          transportConfig.env = envVars;
        }

        const transport = new StdioClientTransport(transportConfig);
        const client = new Client({
          name: entry.name,
          version: "1.0.0",
        });

        await client.connect(transport);
        clients[entry.name] = { client, entry };
        console.log(`Connected MCP client for ${entry.name} (stdio)`);
      } else if (entry.type === "url") {
          const baseUrl = new URL(entry.url);

          try {
            const client = new Client({
              name: entry.name,
              version: "1.0.0",
            });

            const transport = new StreamableHTTPClientTransport(baseUrl) as unknown as Transport;
            await client.connect(transport);

            clients[entry.name] = { client, entry };
            console.log(`Connected MCP client for ${entry.name} (Streamable HTTP: ${entry.url})`);
          } catch (err) {
            console.warn(`Streamable HTTP failed for ${entry.name}, falling back to SSE:`, err);

            const client = new Client({
              name: entry.name,
              version: "1.0.0",
            });

            const sseTransport = new SSEClientTransport(baseUrl) as unknown as Transport;
            await client.connect(sseTransport);

            clients[entry.name] = { client, entry };
            console.log(`Connected MCP client for ${entry.name} (SSE: ${entry.url})`);
          }
        }


    }catch (err) {
      console.error(`Failed to connect to MCP ${entry.name}:`, err);
    }
  }

  return clients;
}