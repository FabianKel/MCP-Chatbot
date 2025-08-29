// src/llmClient.ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export function startSession() {
    return {
        ask: async (input: string, context: string[]) => {
        const history = context.join("\n");
        const response = await client.messages.create({
            model: "claude-3-sonnet-20240229",
            max_tokens: 300,
            messages: [{ role: "user", content: `${history}\nUsuario: ${input}` }],
        });
        if (response != undefined){
            const message = response.content[0].text
            return response.content[0].text;
        }
    
    },
  };
}
