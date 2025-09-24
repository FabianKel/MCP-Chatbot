import express from "express";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.json());

app.post("/", async (req, res) => {
  const { id, method } = req.body;

  if (method === "initialize") {
    return res.json({
      jsonrpc: "2.0",
      id,
      result: {
        capabilities: { tools: {} },
        protocolVersion: "1.0.0",
        serverInfo: {
          name: "remote-random",
          version: "1.0.0",
        },
      },
    });
  }

  if (method === "listTools") {
    return res.json({
      jsonrpc: "2.0",
      id,
      result: [
        {
          name: "get-random",
          description: "Returns a random number between 1 and 9",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
      ],
    });
  }

  if (method === "callTool") {
    return res.json({
      jsonrpc: "2.0",
      id,
      result: {
        content: [
          {
            type: "text",
            text: String(Math.floor(Math.random() * 9) + 1),
          },
        ],
      },
    });
  }

  res.json({
    jsonrpc: "2.0",
    id,
    error: {
      code: -32601,
      message: "Method not found",
    },
  });
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Remote MCP server running on port ${port}`);
});
