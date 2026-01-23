import type { PluginInput } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { log } from "../shared/logger";
import { getAgent, isAlias, getCanonicalName } from "../agents";

export interface OmcOrchestratorOptions {
  delegationEnforcement?: 'strict' | 'warn' | 'off';
  auditLogEnabled?: boolean;
}

interface DelegationAuditEntry {
  timestamp: string;
  sessionId: string;
  agentRequested: string;
  agentResolved: string;
  taskDescription: string;
  toolsRequested?: string[];
  blocked: boolean;
  reason?: string;
}

const TOOL_RESTRICTIONS: Record<string, string[]> = {
  architect: ["Write", "Edit"],
  "architect-low": ["Write", "Edit"],
  "architect-medium": ["Write", "Edit"],
  planner: ["Write", "Edit"],
  analyst: ["Write", "Edit"],
  critic: ["Write", "Edit"],
  vision: ["Write", "Edit"],
  explore: ["Write", "Edit"],
  "explore-medium": ["Write", "Edit"],
  researcher: ["Write", "Edit"],
  "researcher-low": ["Write", "Edit"],
  // EXECUTOR agents - block Task (no delegation)
  executor: ["Task"],
  "executor-low": ["Task"],
  "executor-high": ["Task"],
};

const ALLOWED_DIRECT_WRITE_PATTERNS = [
  /^\.omc\//,
  /^\.claude\//,
  /CLAUDE\.md$/,
  /AGENTS\.md$/,
];

const WARNED_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".c", ".cpp", ".h", ".svelte", ".vue"];

function getAuditLogPath(projectDir: string): string {
  return path.join(projectDir, ".omc", "logs", "delegation-audit.jsonl");
}

function ensureLogDir(projectDir: string): void {
  const logDir = path.join(projectDir, ".omc", "logs");
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
}

function writeAuditEntry(projectDir: string, entry: DelegationAuditEntry): void {
  ensureLogDir(projectDir);
  const logPath = getAuditLogPath(projectDir);
  fs.appendFileSync(logPath, JSON.stringify(entry) + "\n");
}

export function createOmcOrchestratorHook(
  ctx: PluginInput,
  options: OmcOrchestratorOptions = {}
) {
  const {
    delegationEnforcement = 'warn',
    auditLogEnabled = true
  } = options;

  return {
    "tool.execute.before": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { args: Record<string, unknown> }
    ): Promise<void> => {
      // Handle Write/Edit tool warnings (OMCO-006)
      if (input.tool === "write" || input.tool === "Write" ||
          input.tool === "edit" || input.tool === "Edit") {
        const filePath = output.args.file_path as string;
        if (filePath) {
          // Check if file should trigger a warning
          const isAllowed = ALLOWED_DIRECT_WRITE_PATTERNS.some(pattern => pattern.test(filePath));
          const ext = path.extname(filePath);
          const shouldWarn = !isAllowed && WARNED_EXTENSIONS.includes(ext);

          if (shouldWarn) {
            log("[omc-orchestrator] Direct write to source file detected", {
              tool: input.tool,
              file: filePath,
              sessionID: input.sessionID,
            });
          }
        }
      }

      // Only intercept task tool (agent delegation)
      if (input.tool !== "task" && input.tool !== "Task") return;

      const args = output.args;
      const agentType = args.subagent_type as string | undefined;
      const prompt = args.prompt as string | undefined;
      const tools = args.tools as Record<string, boolean> | undefined;

      if (!agentType) return;

      // Resolve agent name (handle aliases)
      const canonicalName = isAlias(agentType)
        ? getCanonicalName(agentType)
        : agentType;

      const agent = getAgent(canonicalName);

      if (!agent) {
        log("[omc-orchestrator] Unknown agent requested", {
          agentRequested: agentType,
          sessionID: input.sessionID,
        });
        return;
      }

      // Check tool restrictions
      const restrictedTools = TOOL_RESTRICTIONS[canonicalName] || [];
      const blockedTools: string[] = [];

      if (tools && restrictedTools.length > 0) {
        for (const restrictedTool of restrictedTools) {
          if (tools[restrictedTool] === true || tools[restrictedTool.toLowerCase()] === true) {
            blockedTools.push(restrictedTool);
            if (delegationEnforcement === 'strict') {
              tools[restrictedTool] = false;
              tools[restrictedTool.toLowerCase()] = false;
            }
          }
        }
      }

      // Log if violations found
      if (blockedTools.length > 0) {
        const action = delegationEnforcement === 'strict' ? 'BLOCKED' : 'WARNED';
        log(`[omc-orchestrator] Tool restriction ${action}`, {
          agent: canonicalName,
          blockedTools,
          enforcement: delegationEnforcement,
          sessionID: input.sessionID,
        });
      }

      // Write audit log
      if (auditLogEnabled) {
        const entry: DelegationAuditEntry = {
          timestamp: new Date().toISOString(),
          sessionId: input.sessionID,
          agentRequested: agentType,
          agentResolved: canonicalName,
          taskDescription: (prompt || "").substring(0, 200),
          toolsRequested: tools ? Object.keys(tools).filter(k => tools[k]) : undefined,
          blocked: delegationEnforcement === 'strict' && blockedTools.length > 0,
          reason: blockedTools.length > 0
            ? `Tools restricted for ${canonicalName}: ${blockedTools.join(', ')}`
            : undefined,
        };

        try {
          writeAuditEntry(ctx.directory, entry);
        } catch (err) {
          log("[omc-orchestrator] Failed to write audit log", { error: String(err) });
        }
      }
    },
  };
}
