import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {z} from 'zod';

// 1. Crear el server
const server = new McpServer({
    name: 'Demo',
    version: '1.0.0'
})

//2. Definir las herramientas
// Aquí llamaré la api
server.tool(
    'fetch-match',
    'Tool to fetch soccer match data',
    {
        city: z.string().describe('City name'),
    },
    async ({ city }) => {
        return {
            content : [
                {
                    type: 'text',
                    text: `The weather in ${city} is rainny`
                }
            ]
        }
    }
)

// 3. Escuchar las conexiones del cliente
const transport = new StdioServerTransport()
await server.connect(transport)