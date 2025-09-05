# **Transfermarkt-MCP Chatbot**

This MCP project includes:
- **Local MCP server** based on Transfermarkt data
- **More Soon**

## How to run the Local Server:

### **Requirements and Dependencies:**
- **``Python``**:
    - Pandas, mlcroissant
    ```bash
    pip install pandas mlcroissant
    ```
- **``TS``**:
    - @modelcontextprotocol
    ```
    npm install @modelcontextprotocol/sdk
    npm install zod
    ```

---
### **Step-by-Step Explanation**
1. Make sure you have all datasets stored locally in the following path: [src/servers/transfermarkt-server/data/](src/servers/transfermarkt-server/data)
    - To download the required datasets, run the [dataUpdate Jupyter Notebook](src/servers/transfermarkt-server/dataUpdate.ipynb)
    it takes about **20-30** minutes. Please read the notebook cells carefully for additional instructions.
2. Once you have all datasets, you can try the MCP Server either offline with **Inspector** or connected to your favorite **AI client** (example: Claude Desktop).
    * **Offline** with `@modelcontextprotocol/Inspector`
      1. Run the Inspector with:
          ```bash
          npx @modelcontextprotocol/inspector npx -y tsx transfermarkt-server.ts
          ```
          >Usually runs at **[http://localhost:6274/](http://localhost:6274/)**

          ![alt text](/readme-assets/InspectorEx1.png)
      2. Make sure the labels show this info:
          - **Transport Type:** ``STDIO``
          - **Command:** ``npx``
          - **Arguments:** ``-y tsx transfermarkt-server.ts``
          Then you can click on **`Connect`**
      3. If everything is working, select **``List Tools``** to see all available tools:
      ![alt text](/readme-assets/InspectorEx2.png)
      4. Now you can test any MCP tool by providing the requested input.
      ![alt text](/readme-assets/InspectorEx3.png)

    * **With Claude Desktop**
      1. Open Claude Desktop.
        ![alt text](/readme-assets/ClaudeEx1.png)
      2. Go to **``Settings>Developer>Edit Config``**
        ![alt text](/readme-assets/ClaudeEx2.png)
      3. **Open the file:** ``Claude/claude_desktop_config.json``
        ![alt text](/readme-assets/ClaudeEx3.png)
      4. **Add the following Json inside the ``mcpServers`` list**
          ```json
          "transfermarkt": {
              "command": "npx",
              "args": [
                  "-y",
                  "tsx",
                  "<PATH_TO_THE_PROJECT>/mcp-chatbot/src/servers/transfermarkt-server/transfermarkt-server.ts"
              ]
          }
          ```
      5. **Restart Claude Desktop and go again to** ``Settings>Developer``
      if everything is fine, you'll see the running tag for the transfermarkt tool.
        ![alt text](/readme-assets/ClaudeEx4.png)
      6. You can now ask questions about soccer transfers and players' careers, as shown below:
      ![alt text](/readme-assets/ClaudeEx5.png)

---

## **Tools Description**

Once the server is running, you have access to the following tools for structured queries over player transfer data:

* **`get-player-transfers`**

  * **Input:** `{ playerName: string }`
  * Returns the full transfer history of a player, including transfer date, season, origin club, destination club, transfer fee, and market value at the time.

* **`get-player-stats`**

  * **Input:** `{ playerName: string, clubId: string }`
  * Returns statistics about a player’s appearances for a given club, such as number of matches played.

* **`get-career-path`**

  * **Input:** `{ playerName: string }`
  * Lists the clubs where a player has played (based on appearances data).

* **`get-last-transfer`**

  * **Input:** `{ playerName: string }`
  * Returns the most recent transfer of a player with details (date, season, origin, destination, fee, and market value).

* **`players-in-clubs`**

  * **Input:** `{ clubs: string[] }` (at least 2 clubs, no upper limit)
  * Finds players who have played for *all* the specified clubs.
  * The response includes a chronological view of their transfers (career path).

* **`player-career-summary`**

  * **Input:** `{ playerName: string }`
  * Provides a career overview of a player:

    * Total transfers
    * Number of unique clubs
    * List of clubs
    * Chronological list of transfers with details (date, season, fee, etc.).
