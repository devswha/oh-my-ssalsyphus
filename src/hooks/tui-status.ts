import type { PluginInput } from "@opencode-ai/plugin";
import { log } from "../shared/logger";

export interface TuiStatusOptions {
  enabled?: boolean;
  showAgentNotifications?: boolean;
  showModeChanges?: boolean;
  toastDuration?: number;
  trackMetrics?: boolean;
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
  task?: string;
  callID?: string;
}

// Performance metrics tracking
interface AgentMetrics {
  totalCalls: number;
  successCount: number;
  failureCount: number;
  totalDurationMs: number;
  avgDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  lastCallTime: number;
}

// Session metrics
interface SessionMetrics {
  sessionStartTime: number;
  totalAgentCalls: number;
  totalSuccesses: number;
  totalFailures: number;
  agentMetrics: Map<string, AgentMetrics>;
}

const activeAgents = new Map<string, AgentStatus>();
const sessionMetrics: SessionMetrics = {
  sessionStartTime: Date.now(),
  totalAgentCalls: 0,
  totalSuccesses: 0,
  totalFailures: 0,
  agentMetrics: new Map(),
};

export function createTuiStatusHook(
  ctx: PluginInput,
  options: TuiStatusOptions = {}
) {
  const {
    enabled = true,
    showAgentNotifications = true,
    showModeChanges = true,
    toastDuration = 3000,
    trackMetrics = true,
  } = options;

  // Update metrics when an agent completes
  function updateMetrics(agentName: string, durationMs: number, success: boolean): void {
    if (!trackMetrics) return;

    sessionMetrics.totalAgentCalls++;
    if (success) {
      sessionMetrics.totalSuccesses++;
    } else {
      sessionMetrics.totalFailures++;
    }

    let metrics = sessionMetrics.agentMetrics.get(agentName);
    if (!metrics) {
      metrics = {
        totalCalls: 0,
        successCount: 0,
        failureCount: 0,
        totalDurationMs: 0,
        avgDurationMs: 0,
        minDurationMs: Infinity,
        maxDurationMs: 0,
        lastCallTime: 0,
      };
      sessionMetrics.agentMetrics.set(agentName, metrics);
    }

    metrics.totalCalls++;
    if (success) {
      metrics.successCount++;
    } else {
      metrics.failureCount++;
    }
    metrics.totalDurationMs += durationMs;
    metrics.avgDurationMs = metrics.totalDurationMs / metrics.totalCalls;
    metrics.minDurationMs = Math.min(metrics.minDurationMs, durationMs);
    metrics.maxDurationMs = Math.max(metrics.maxDurationMs, durationMs);
    metrics.lastCallTime = Date.now();

    log("[tui-status] Metrics updated", {
      agent: agentName,
      durationMs,
      success,
      totalCalls: metrics.totalCalls,
      avgDurationMs: metrics.avgDurationMs.toFixed(0),
    });
  }

  // Get formatted metrics summary
  function getMetricsSummary(): string {
    const sessionDuration = ((Date.now() - sessionMetrics.sessionStartTime) / 1000).toFixed(0);
    const lines: string[] = [
      `📊 Session Metrics (${sessionDuration}s)`,
      `Total: ${sessionMetrics.totalAgentCalls} calls | ✅ ${sessionMetrics.totalSuccesses} | ❌ ${sessionMetrics.totalFailures}`,
      "",
    ];

    if (sessionMetrics.agentMetrics.size > 0) {
      lines.push("Per-Agent Stats:");
      for (const [name, m] of sessionMetrics.agentMetrics.entries()) {
        const avgSec = (m.avgDurationMs / 1000).toFixed(1);
        const minSec = m.minDurationMs === Infinity ? "0" : (m.minDurationMs / 1000).toFixed(1);
        const maxSec = (m.maxDurationMs / 1000).toFixed(1);
        lines.push(`  ${getAgentEmoji(name)} ${name}: ${m.totalCalls}x | avg ${avgSec}s | ${minSec}-${maxSec}s`);
      }
    }

    return lines.join("\n");
  }

  // Get metrics as structured data
  function getMetrics(): {
    session: Omit<SessionMetrics, "agentMetrics">;
    agents: Record<string, AgentMetrics>;
  } {
    const agents: Record<string, AgentMetrics> = {};
    for (const [name, metrics] of sessionMetrics.agentMetrics.entries()) {
      agents[name] = { ...metrics };
    }
    return {
      session: {
        sessionStartTime: sessionMetrics.sessionStartTime,
        totalAgentCalls: sessionMetrics.totalAgentCalls,
        totalSuccesses: sessionMetrics.totalSuccesses,
        totalFailures: sessionMetrics.totalFailures,
      },
      agents,
    };
  }

  // Reset metrics (for testing or new session)
  function resetMetrics(): void {
    sessionMetrics.sessionStartTime = Date.now();
    sessionMetrics.totalAgentCalls = 0;
    sessionMetrics.totalSuccesses = 0;
    sessionMetrics.totalFailures = 0;
    sessionMetrics.agentMetrics.clear();
  }

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
  async function notifyAgentStarted(agentName: string, task?: string, callID?: string): Promise<void> {
    if (!showAgentNotifications) return;

    // Use callID as key if provided, otherwise use agentName (for backwards compat)
    const key = callID || agentName;
    activeAgents.set(key, {
      name: agentName,
      status: "running",
      startTime: Date.now(),
      task,
      callID,
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
  async function notifyAgentCompleted(agentName: string, success: boolean = true, callID?: string): Promise<void> {
    if (!showAgentNotifications) return;

    // Use callID as key if provided, otherwise use agentName (for backwards compat)
    const key = callID || agentName;
    const agent = activeAgents.get(key);
    if (agent) {
      agent.status = success ? "completed" : "failed";
      agent.endTime = Date.now();
      const durationMs = agent.endTime - agent.startTime;
      const durationSec = (durationMs / 1000).toFixed(1);

      // Update metrics
      updateMetrics(agent.name, durationMs, success);

      await showToast({
        title: success ? "✅ Agent Completed" : "❌ Agent Failed",
        message: `${agent.name} (${durationSec}s)`,
        variant: success ? "success" : "error",
        duration: 2000,
      });

      // Clean up after a delay
      setTimeout(() => activeAgents.delete(key), 5000);
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

    // Metrics API
    getMetrics,
    getMetricsSummary,
    resetMetrics,

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

          // Use callID to track individual agent calls
          await notifyAgentStarted(agentName, taskSummary, input.callID);

          log("[tui-status] Agent spawned", {
            sessionID: input.sessionID,
            callID: input.callID,
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
        // Try to find the agent by callID first
        const agentByCallID = activeAgents.get(input.callID);

        if (agentByCallID) {
          const success = !output.output?.toLowerCase().includes("error") &&
                         !output.output?.toLowerCase().includes("failed");
          await notifyAgentCompleted(agentByCallID.name, success, input.callID);
        } else {
          // Fallback: try to get agent name from metadata
          const metadata = output.metadata as Record<string, unknown> | undefined;
          const agentName = metadata?.agent_name as string | undefined;
          if (agentName) {
            const success = !output.output?.toLowerCase().includes("error") &&
                           !output.output?.toLowerCase().includes("failed");
            await notifyAgentCompleted(agentName, success);
          }
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
