// Repositorio: https://github.com/FabianKel/MCP-Chatbot

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadCSV } from "./dataLoader.js";
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Define el BasePath relativo al directorio del script actual
const BasePath = join(dirname(fileURLToPath(import.meta.url)), 'data');

// Usa el BasePath para cargar los archivos
const players = await loadCSV(join(BasePath, 'players.csv'));
const transfers = await loadCSV(join(BasePath, 'transfers.csv'));
const clubs = await loadCSV(join(BasePath, 'clubs.csv'));
const appearances = await loadCSV(join(BasePath, 'appearances.csv'));


// 1. Definir el server
const server = new McpServer({ name: "FootballTransfers", version: "1.0.0" });


//2. Definir las herramientas

function getClubName(clubId: string) {
  const club = clubs.find((c) => c.club_id === clubId);
  return club ? `Club ${club.club_id} (${club.domestic_competition_id})` : clubId;
}


//a) Buscar transferencias de un jugador
server.tool(
  "get-player-transfers",
  "Get all transfers of a player",
  {
    playerName: z.string().describe("Name of the player"),
  },
  async ({ playerName }) => {
    const playerTransfers = transfers.filter((t) =>
      t.player_name.toLowerCase().includes(playerName.toLowerCase())
    );

    if (playerTransfers.length === 0) {
      return {
        content: [{ type: "text", text: `No transfers found for ${playerName}` }],
      };
    }

    const transferText = playerTransfers
      .map(
        (t) =>
          `${t.player_name} moved from ${t.from_club_name} to ${t.to_club_name} on ${t.transfer_date} (season ${t.transfer_season}) for ${t.transfer_fee || "unknown fee"} (market value: ${t.market_value_in_eur || "n/a"} €)`
      )
      .join("\n");

    return {
      content: [{ type: "text", text: transferText }],
    };
  }
);

// b) Stats de un jugador en un club/año
server.tool(
  "get-player-stats",
  "Get stats of a player in a given club",
  {
    playerName: z.string(),
    clubId: z.string(),
  },
  async ({ playerName, clubId }) => {
    const player = players.find((p) =>
      p.name?.toLowerCase().includes(playerName.toLowerCase())
    );
    if (!player) {
      return { content: [{ type: "text", text: `No player found: ${playerName}` }] };
    }

    const stats = appearances.filter(
      (a) => a.player_id === player.player_id && a.player_club_id === clubId
    );

    return {
      content: [
        {
          type: "text",
          text: `${player.name} played ${stats.length} matches for club ${clubId}.`,
        },
      ],
    };
  }
);

// c) Historial de clubes
server.tool(
  "get-career-path",
  "Get the clubs and years where a player has played",
  {
    playerName: z.string(),
  },
  async ({ playerName }) => {
    const player = players.find((p) =>
      p.name?.toLowerCase().includes(playerName.toLowerCase())
    );
    if (!player) {
      return { content: [{ type: "text", text: `Player not found: ${playerName}` }] };
    }

    const playerAppearances = appearances.filter(
      (a) => a.player_id === player.player_id
    );

    const clubsPlayed = [...new Set(playerAppearances.map((a) => a.player_club_id))];

    const summary = clubsPlayed
      .map((cid) => `Played at club ${cid}`)
      .join("\n");

    return {
      content: [{ type: "text", text: summary || "No data available." }],
    };
  }
);

server.tool(
  "get-last-transfer",
  "Get the most recent transfer of a player",
  {
    playerName: z.string(),
  },
  async ({ playerName }) => {
    const playerTransfers = transfers
      .filter((t) =>
        t.player_name.toLowerCase().includes(playerName.toLowerCase())
      )
      .sort((a, b) => new Date(b.transfer_date).getTime() - new Date(a.transfer_date).getTime());

    if (playerTransfers.length === 0) {
      return {
        content: [{ type: "text", text: `No transfers found for ${playerName}` }],
      };
    }

    const last = playerTransfers[0];

    return {
      content: [
        {
          type: "text",
          text: `${last.player_name} last moved from ${last.from_club_name} to ${last.to_club_name} on ${last.transfer_date} (season ${last.transfer_season}), fee: ${last.transfer_fee}, market value: ${last.market_value_in_eur} €`,
        },
      ],
    };
  }
);


server.tool(
  "players-in-clubs",
  "Find players who have played in ALL the given clubs (with transfer order)",
  {
    clubs: z.array(z.string()).min(2, "Please provide at least 2 clubs"),
  },
  async ({ clubs }) => {
    const playersByClub = new Map<string, any[]>();

    // Agrupamos transferencias por jugador
    for (const t of transfers) {
      if (!playersByClub.has(t.player_id)) playersByClub.set(t.player_id, []);
      playersByClub.get(t.player_id)!.push(t);
    }

    const requiredClubs = clubs.map((c) => c.toLowerCase());
    const result: string[] = [];

    for (const [_, history] of playersByClub.entries()) {
      // ordenar cronológicamente
      const sorted = history.sort(
        (a, b) =>
          new Date(a.transfer_date).getTime() - new Date(b.transfer_date).getTime()
      );

      // Todos los clubes donde pasó el jugador
      const clubsPlayed = sorted.flatMap((t) => [
        t.from_club_name?.toLowerCase(),
        t.to_club_name?.toLowerCase(),
      ]);

      // Verificar que el jugador pasó por TODOS los clubes solicitados
      const hasAll = requiredClubs.every((club) =>
        clubsPlayed.includes(club)
      );

      if (hasAll) {
        const playerName = sorted[0].player_name;
        const career = sorted
          .map(
            (t) =>
              `${t.from_club_name} → ${t.to_club_name} (${t.transfer_date}, season ${t.transfer_season})`
          )
          .join("\n   ");

        result.push(`📌 ${playerName}\n   ${career}`);
      }
    }

    if (result.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No players found who played in all of: ${clubs.join(", ")}`,
          },
        ],
      };
    }

    return { content: [{ type: "text", text: result.join("\n\n") }] };
  }
);



server.tool(
  "player-career-summary",
  "Get career summary of a player",
  {
    playerName: z.string(),
  },
  async ({ playerName }) => {
    const history = transfers
      .filter((t) =>
        t.player_name.toLowerCase().includes(playerName.toLowerCase())
      )
      .sort(
        (a, b) =>
          new Date(a.transfer_date).getTime() - new Date(b.transfer_date).getTime()
      );

    if (history.length === 0) {
      return {
        content: [
          { type: "text", text: `No career data found for ${playerName}` },
        ],
      };
    }

    const clubs: Set<string> = new Set();
    const moves = history
      .map((t) => {
        clubs.add(t.from_club_name);
        clubs.add(t.to_club_name);
        return `${t.from_club_name} → ${t.to_club_name} (${t.transfer_date}, season ${t.transfer_season}, fee: ${t.transfer_fee || "n/a"})`;
      })
      .join("\n");

    const summary = `Career of ${history[0].player_name}:
Total transfers: ${history.length}
Unique clubs: ${clubs.size}
Clubs: ${Array.from(clubs).filter(Boolean).join(", ")}

Transfers:
${moves}`;

    return { content: [{ type: "text", text: summary }] };
  }
);



// 3. Conectar el server

const transport = new StdioServerTransport();
await server.connect(transport);


//Para inspector usar: npx @modelcontextprotocol/inspector npx -y tsx transfermarkt-server.ts