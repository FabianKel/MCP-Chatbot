import express from "express";

const app = express();
app.use(express.json());

function rpcResponse(id: string | number, result: any) {
  return {
    jsonrpc: "2.0",
    id,
    result,
  };
}

function rpcError(id: string | number, code: number, message: string) {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message },
  };
}

app.post("/", (req, res) => {
  const { id, method, params } = req.body;

  if (method === "initialize") {
    return res.json(
      rpcResponse(id, {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: "remote-random",
          version: "1.0.0",
        },
      })
    );
  }

    if (method === "tools/list") {
        return res.json(
            rpcResponse(id, {
            tools: [
                {
                name: "get-random",
                description: "Returns a random number between 1 and 9",
                inputSchema: {
                    type: "object",
                    properties: {}, // sin inputs
                },
                },
            ],
            })
        );
    }


  if (method === "tools/call") {
    if (params?.name === "get-random") {
      const randomNumber = Math.floor(Math.random() * 9) + 1;
      return res.json(
        rpcResponse(id, {
          content: [
            {
              type: "text",
              text: String(randomNumber),
            },
          ],
        })
      );
    }
    return res.json(rpcError(id, -32601, "Tool not found"));
  }

  return res.json(rpcError(id, -32601, "Method not found"));
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Remote MCP server running on port ${port}`);
});
