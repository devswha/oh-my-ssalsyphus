import { tool, type PluginInput, type ToolDefinition } from "@opencode-ai/plugin";
import type { BackgroundManager, ModelConfig } from "./background-manager";
import { getAgent, listAgentNames, getCanonicalName, isAlias } from "../agents";
import { log } from "../shared/logger";

export function createCallOmcoAgent(ctx: PluginInput, manager: BackgroundManager): ToolDefinition {
  // Generate dynamic agent list for description
  const agentNames = listAgentNames();
  const agentList = agentNames.map(name => {
    const agent = getAgent(name);
    const aliasNote = isAlias(name) ? ` (alias for ${getCanonicalName(name)})` : "";
    return `- ${name}${aliasNote}: ${agent?.description || "Agent"}`;
  }).join("\n");

  return tool({
    description: `Spawn specialized agent for delegation. run_in_background REQUIRED (true=async with task_id, false=sync).

Available agents:
${agentList}

Prompts MUST be in English. Use \`background_output\` for async results.`,
    args: {
      description: tool.schema.string().describe("Short description of task"),
      prompt: tool.schema.string().describe("Task prompt"),
      subagent_type: tool.schema
        .string()
        .describe(`Agent type to spawn. Available: ${agentNames.join(", ")}`),
      run_in_background: tool.schema.boolean().describe("Run async (true) or sync (false)"),
      session_id: tool.schema.string().optional().describe("Existing session to continue"),
    },
    async execute(args, context) {
      const { description, prompt, subagent_type, run_in_background } = args;

      // OMCO-001: Validate agent exists
      const agent = getAgent(subagent_type);
      if (!agent) {
        return JSON.stringify({
          status: "failed",
          error: `Unknown agent type: ${subagent_type}. Available: ${listAgentNames().join(", ")}`,
        });
      }

      // OMCO-002: Inject agent system prompt
      const enhancedPrompt = `${agent.systemPrompt}\n\n---\n\n${prompt}`;

      // OMCO-003: Get parent session model to inherit provider/model
      const parentModel = await manager.getParentSessionModel(context.sessionID);

      if (run_in_background) {
        const task = await manager.createTask(
          context.sessionID,
          description,
          enhancedPrompt,
          subagent_type,
          parentModel
        );

        return JSON.stringify({
          task_id: task.id,
          session_id: task.sessionID,
          status: "running",
          message: `Background agent task launched. Use background_output with task_id="${task.id}" to get results.`,
        });
      }

      try {
        const sessionResp = await ctx.client.session.create({
          body: {
            parentID: context.sessionID,
            title: `${subagent_type}: ${description}`,
          },
          query: { directory: ctx.directory },
        });

        const sessionID = (sessionResp.data as { id?: string })?.id ?? (sessionResp as { id?: string }).id;
        if (!sessionID) throw new Error("Failed to create session");

        // Build prompt body with parent model if available
        const promptBody: {
          parts: Array<{ type: "text"; text: string }>;
          model?: ModelConfig;
        } = {
          parts: [{ type: "text" as const, text: enhancedPrompt }],
        };

        if (parentModel) {
          promptBody.model = parentModel;
          log(`Using parent model for sync agent call`, { subagent_type, ...parentModel });
        }

        const promptResp = await ctx.client.session.prompt({
          path: { id: sessionID },
          body: promptBody,
          query: { directory: ctx.directory },
        });

        // Check for HTTP-level errors
        if (promptResp.error) {
          return JSON.stringify({
            session_id: sessionID,
            status: "failed",
            error: `Prompt failed: ${JSON.stringify(promptResp.error)}`,
          });
        }

        const promptData = promptResp.data as {
          info?: {
            role?: string;
            error?: { name: string; data?: { providerID?: string; message?: string } };
          };
          parts?: Array<{ type: string; text?: string }>;
        } | undefined;

        // Check for provider auth errors (401)
        if (promptData?.info?.error) {
          const err = promptData.info.error;
          const errMsg = err.data?.message || err.name || "Unknown error";
          return JSON.stringify({
            session_id: sessionID,
            status: "failed",
            error: `[${err.name}] ${errMsg}`,
          });
        }

        const result = promptData?.parts
          ?.filter((p) => p.type === "text" && p.text)
          .map((p) => p.text)
          .join("\n") || "";

        return JSON.stringify({
          session_id: sessionID,
          status: "completed",
          result,
        });
      } catch (err) {
        return JSON.stringify({
          status: "failed",
          error: String(err),
        });
      }
    },
  });
}
