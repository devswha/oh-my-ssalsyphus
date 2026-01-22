import type { PluginInput } from "@opencode-ai/plugin";
import { log } from "../shared/logger";

export interface TuiStatusOptions {
  enabled?: boolean;
  showAgentNotifications?: boolean;
  showModeChanges?: boolean;
  toastDuration?: number;
}

type ToastVariant = "info" | "success" | "warning" | "error";

interface ToastOptions {
  title?: string;
  message: string;
  variant: ToastVariant;
  duration?: number;
}

// Agent status tracking
interface AgentStatus {
  name: string;
  status: "running" | "completed" | "failed";
  startTime: number;
  endTime?: number;
}

const activeAgents = new Map<string, AgentStatus>();

export function createTuiStatusHook(
  ctx: PluginInput,
  options: TuiStatusOptions = {}
) {
  const {
    enabled = true,
    showAgentNotifications = true,
    showModeChanges = true,
    toastDuration = 3000,
  } = options;

  // Show toast notification
  async function showToast(opts: ToastOptions): Promise<void> {
    if (!enabled) return;

    try {
      await ctx.client.tui.showToast({
        body: {
          title: opts.title,
          message: opts.message,
          variant: opts.variant,
          duration: opts.duration ?? toastDuration,
        },
      });
    } catch (error) {
      log("[tui-status] Failed to show toast", { error });
    }
  }

  // Notify agent started
  async function notifyAgentStarted(agentName: string, task?: string): Promise<void> {
    if (!showAgentNotifications) return;

    activeAgents.set(agentName, {
      name: agentName,
      status: "running",
      startTime: Date.now(),
    });

    const emoji = getAgentEmoji(agentName);
    const shortTask = task ? `: ${task.substring(0, 40)}${task.length > 40 ? "..." : ""}` : "";

    await showToast({
      title: `${emoji} Agent Started`,
      message: `${agentName}${shortTask}`,
      variant: "info",
      duration: 2000,
    });
  }

  // Notify agent completed
  async function notifyAgentCompleted(agentName: string, success: boolean = true): Promise<void> {
    if (!showAgentNotifications) return;

    const agent = activeAgents.get(agentName);
    if (agent) {
      agent.status = success ? "completed" : "failed";
      agent.endTime = Date.now();
      const duration = ((agent.endTime - agent.startTime) / 1000).toFixed(1);

      await showToast({
        title: success ? "✅ Agent Completed" : "❌ Agent Failed",
        message: `${agentName} (${duration}s)`,
        variant: success ? "success" : "error",
        duration: 2000,
      });

      // Clean up after a delay
      setTimeout(() => activeAgents.delete(agentName), 5000);
    }
  }

  // Notify mode change
  async function notifyModeChange(mode: string, active: boolean): Promise<void> {
    if (!showModeChanges) return;

    const modeEmoji: Record<string, string> = {
      autopilot: "🤖",
      "ralph-loop": "🔄",
      "ultrawork-ralph": "⚡🔄",
      ultrawork: "⚡",
      ultraqa: "🧪",
      ralplan: "📋",
    };

    const emoji = modeEmoji[mode] || "🔧";

    await showToast({
      title: active ? `${emoji} Mode Activated` : `${emoji} Mode Deactivated`,
      message: mode.toUpperCase(),
      variant: active ? "info" : "warning",
      duration: 3000,
    });
  }

  // Notify phase change (for autopilot)
  async function notifyPhaseChange(phase: string, current: number, total: number): Promise<void> {
    const phaseEmoji: Record<string, string> = {
      expansion: "📝",
      planning: "📋",
      execution: "🔨",
      qa: "🧪",
      validation: "✅",
      complete: "🎉",
    };

    const emoji = phaseEmoji[phase] || "▶️";

    await showToast({
      title: `${emoji} Phase ${current}/${total}`,
      message: phase.charAt(0).toUpperCase() + phase.slice(1),
      variant: "info",
      duration: 2500,
    });
  }

  // Notify iteration (for loops)
  async function notifyIteration(mode: string, current: number, max: number): Promise<void> {
    await showToast({
      title: `🔄 ${mode} Iteration`,
      message: `${current}/${max}`,
      variant: "info",
      duration: 1500,
    });
  }

  // Get status summary
  function getActiveAgents(): AgentStatus[] {
    return Array.from(activeAgents.values());
  }

  return {
    // Public API
    showToast,
    notifyAgentStarted,
    notifyAgentCompleted,
    notifyModeChange,
    notifyPhaseChange,
    notifyIteration,
    getActiveAgents,

    // Hook handler for tool.execute.before - detect agent spawning
    "tool.execute.before": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { args: Record<string, unknown> }
    ): Promise<void> => {
      if (!enabled || !showAgentNotifications) return;

      // Detect Task tool usage (agent spawning)
      if (input.tool === "Task" || input.tool === "task") {
        const subagentType = output.args?.subagent_type as string | undefined;
        const prompt = output.args?.prompt as string | undefined;

        if (subagentType) {
          // Extract agent name from subagent_type (e.g., "oh-my-claudecode:executor" -> "executor")
          const agentName = subagentType.includes(":")
            ? subagentType.split(":").pop() || subagentType
            : subagentType;

          // Extract task summary from prompt
          const taskSummary = prompt?.split("\n")[0]?.substring(0, 50);

          await notifyAgentStarted(agentName, taskSummary);

          log("[tui-status] Agent spawned", {
            sessionID: input.sessionID,
            agent: agentName,
            task: taskSummary,
          });
        }
      }
    },

    // Hook handler for tool.execute.after - detect agent completion
    "tool.execute.after": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { title: string; output: string; metadata: any }
    ): Promise<void> => {
      if (!enabled || !showAgentNotifications) return;

      // Detect Task tool completion
      if (input.tool === "Task" || input.tool === "task") {
        const metadata = output.metadata as Record<string, unknown> | undefined;
        const agentName = metadata?.agent_name as string | undefined;
        const success = !output.output?.toLowerCase().includes("error") &&
                       !output.output?.toLowerCase().includes("failed");

        if (agentName) {
          await notifyAgentCompleted(agentName, success);
        }
      }
    },
  };
}

// Helper to get emoji for agent type
function getAgentEmoji(agentName: string): string {
  const emojiMap: Record<string, string> = {
    // Analysis
    architect: "🏗️",
    "architect-low": "🏗️",
    "architect-medium": "🏗️",
    analyst: "🔍",
    critic: "📝",

    // Execution
    executor: "⚙️",
    "executor-low": "⚙️",
    "executor-high": "⚙️",

    // Search
    explore: "🔎",
    "explore-medium": "🔎",

    // Research
    researcher: "📚",
    "researcher-low": "📚",

    // Frontend
    designer: "🎨",
    "designer-low": "🎨",
    "designer-high": "🎨",

    // Documentation
    writer: "✍️",

    // Testing
    "qa-tester": "🧪",
    "build-fixer": "🔧",
    "build-fixer-low": "🔧",

    // Security
    "security-reviewer": "🔒",
    "security-reviewer-low": "🔒",

    // Data Science
    scientist: "🔬",
    "scientist-low": "🔬",
    "scientist-high": "🔬",

    // Vision
    vision: "👁️",

    // Planning
    planner: "📋",
  };

  return emojiMap[agentName] || "🤖";
}
