import type { Agent, Message, Part } from "@opencode-ai/sdk/dist/gen/types.gen.js";

/**
 * Verify an agent is registered. app.agents() returns Array<Agent>.
 */
export function expectAgentRegistered(agents: Array<Agent>, agentName: string): void {
  const found = agents.find(a => a.name === agentName);
  if (!found) {
    const available = agents.map(a => a.name).join(", ");
    throw new Error(`Agent "${agentName}" not found. Available: ${available}`);
  }
}

/**
 * Extract all assistant text from messages.
 * session.messages() returns Array<{ info: Message, parts: Array<Part> }>
 * Message = UserMessage | AssistantMessage
 * AssistantMessage has role: "assistant"
 * Parts include TextPart with { type: "text", text: string }
 */
export function getAssistantTextFromMessages(
  messages: Array<{ info: Message; parts: Array<Part> }> | undefined
): string {
  if (!messages) return "";

  return messages
    .filter(m => m.info.role === "assistant")
    .flatMap(m => m.parts)
    .filter((p): p is Extract<Part, { type: "text" }> => p.type === "text")
    .map(p => p.text)
    .join("\n");
}
