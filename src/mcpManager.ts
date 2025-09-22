import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
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
      }
    } catch (err) {
      console.error(`Failed to connect to MCP ${entry.name}:`, err);
    }
  }

  return clients;
}