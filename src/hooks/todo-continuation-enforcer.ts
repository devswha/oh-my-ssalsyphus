import type { PluginInput } from "@opencode-ai/plugin";
import type { BackgroundManager } from "../tools/background-manager";
import { log } from "../shared/logger";
import { getMainSessionID } from "../shared/session-state";
import { getContinuationMessage } from "./continuation-messages";
import { isSessionPaused, pauseSession, clearSessionPauseState } from "../state/session-pause-state";

export interface TodoContinuationEnforcerOptions {
  backgroundManager?: BackgroundManager;
  /** Countdown seconds before resuming (default: 2) */
  countdownSeconds?: number;
  /** Skip countdown if completion percentage is above this threshold */
  skipCountdownAbovePercent?: number;
  /** Vary countdown based on task complexity */
  adaptiveCountdown?: boolean;
}

interface Todo {
  content: string;
  status: string;
  priority: string;
  id: string;
}

interface SessionState {
  countdownTimer?: ReturnType<typeof setTimeout>;
  countdownInterval?: ReturnType<typeof setInterval>;
  isRecovering?: boolean;
  countdownStartedAt?: number;
  /** Track consecutive idle events for smarter detection */
  consecutiveIdleCount?: number;
  lastIdleAt?: number;
  /** Message variant index for rotation */
  messageIndex?: number;
}

const DEFAULT_COUNTDOWN_SECONDS = 2;
const TOAST_DURATION_MS = 900;
/** If idle events happen within this window, consider it a rapid sequence */
const RAPID_IDLE_WINDOW_MS = 5000;

function getIncompleteCount(todos: Todo[]): number {
  return todos.filter(t => t.status !== "completed" && t.status !== "cancelled").length;
}

export function createTodoContinuationEnforcer(
  ctx: PluginInput,
  options: TodoContinuationEnforcerOptions = {}
) {
  const { backgroundManager } = options;
  const countdownSeconds = options.countdownSeconds ?? DEFAULT_COUNTDOWN_SECONDS;
  const skipAbovePercent = options.skipCountdownAbovePercent ?? 90;
  const adaptiveCountdown = options.adaptiveCountdown ?? true;
  const sessions = new Map<string, SessionState>();

  function getState(sessionID: string): SessionState {
    let state = sessions.get(sessionID);
    if (!state) {
      state = { consecutiveIdleCount: 0, messageIndex: 0 };
      sessions.set(sessionID, state);
    }
    return state;
  }

  /** Calculate adaptive countdown based on task state */
  function getAdaptiveCountdown(
    todos: Todo[],
    state: SessionState
  ): number {
    if (!adaptiveCountdown) return countdownSeconds;

    const total = todos.length;
    const completed = todos.filter(t => t.status === "completed").length;
    const percentComplete = total > 0 ? (completed / total) * 100 : 0;

    // Skip countdown if almost done (above threshold)
    if (percentComplete >= skipAbovePercent) {
      log(`Skipping countdown: ${percentComplete.toFixed(0)}% complete`);
      return 0;
    }

    // Reduce countdown for rapid consecutive idles (agent is clearly working)
    if (state.consecutiveIdleCount && state.consecutiveIdleCount > 2) {
      return Math.max(1, countdownSeconds - 1);
    }

    // Check if there's an in-progress task (agent might be mid-task)
    const hasInProgress = todos.some(t => t.status === "in_progress");
    if (hasInProgress) {
      // Shorter countdown if clearly mid-task
      return Math.max(1, countdownSeconds - 1);
    }

    return countdownSeconds;
  }

  /** Get the next pending task for context */
  function getNextPendingTask(todos: Todo[]): string | undefined {
    const pending = todos.find(t => t.status === "pending" || t.status === "in_progress");
    return pending?.content;
  }

  function cancelCountdown(sessionID: string): void {
    const state = sessions.get(sessionID);
    if (!state) return;

    if (state.countdownTimer) {
      clearTimeout(state.countdownTimer);
      state.countdownTimer = undefined;
    }
    if (state.countdownInterval) {
      clearInterval(state.countdownInterval);
      state.countdownInterval = undefined;
    }
    state.countdownStartedAt = undefined;
  }

  const markRecovering = (sessionID: string): void => {
    const state = getState(sessionID);
    state.isRecovering = true;
    cancelCountdown(sessionID);
    log(`Session marked as recovering`, { sessionID });
  };

  const markRecoveryComplete = (sessionID: string): void => {
    const state = sessions.get(sessionID);
    if (state) {
      state.isRecovering = false;
      log(`Session recovery complete`, { sessionID });
    }
  };

  async function showCountdownToast(seconds: number, incompleteCount: number): Promise<void> {
    await ctx.client.tui.showToast({
      body: {
        title: "Todo Continuation",
        message: `Resuming in ${seconds}s... (${incompleteCount} tasks remaining)`,
        variant: "warning" as const,
        duration: TOAST_DURATION_MS,
      },
    }).catch(() => {});
  }

  async function injectContinuation(sessionID: string, _incompleteCount: number): Promise<void> {
    const state = sessions.get(sessionID);

    if (state?.isRecovering) {
      log(`Skipped injection: in recovery`, { sessionID });
      return;
    }

    const hasRunningBgTasks = backgroundManager
      ? backgroundManager.getTasksByParentSession(sessionID).some(t => t.status === "running")
      : false;

    if (hasRunningBgTasks) {
      log(`Skipped injection: background tasks running`, { sessionID });
      return;
    }

    let todos: Todo[] = [];
    try {
      const response = await ctx.client.session.todo({ path: { id: sessionID } });
      todos = (response.data ?? response) as Todo[];
    } catch {
      return;
    }

    const freshIncompleteCount = getIncompleteCount(todos);
    if (freshIncompleteCount === 0) {
      log(`Skipped injection: no incomplete todos`, { sessionID });
      // Reset consecutive idle count on completion
      if (state) state.consecutiveIdleCount = 0;
      return;
    }

    const completedCount = todos.length - freshIncompleteCount;
    const nextTask = getNextPendingTask(todos);

    // Get varied continuation message
    const prompt = getContinuationMessage({
      completedCount,
      totalCount: todos.length,
      nextTask,
      mode: "todo",
    });

    // Increment message index for next time
    if (state) {
      state.messageIndex = ((state.messageIndex ?? 0) + 1) % 5;
    }

    try {
      log(`Injecting continuation`, { sessionID, incompleteCount: freshIncompleteCount });

      await ctx.client.session.prompt({
        path: { id: sessionID },
        body: {
          parts: [{ type: "text", text: prompt }],
        },
        query: { directory: ctx.directory },
      });

      log(`Injection successful`, { sessionID });
    } catch (err) {
      log(`Injection failed`, { sessionID, error: String(err) });
    }
  }

  function startCountdown(sessionID: string, incompleteCount: number, todos: Todo[]): void {
    const state = getState(sessionID);
    cancelCountdown(sessionID);

    // Calculate adaptive countdown
    const actualCountdown = getAdaptiveCountdown(todos, state);

    // If countdown is 0, inject immediately
    if (actualCountdown === 0) {
      injectContinuation(sessionID, incompleteCount);
      return;
    }

    let secondsRemaining = actualCountdown;
    showCountdownToast(secondsRemaining, incompleteCount);
    state.countdownStartedAt = Date.now();

    state.countdownInterval = setInterval(() => {
      secondsRemaining--;
      if (secondsRemaining > 0) {
        showCountdownToast(secondsRemaining, incompleteCount);
      }
    }, 1000);

    state.countdownTimer = setTimeout(() => {
      cancelCountdown(sessionID);
      injectContinuation(sessionID, incompleteCount);
    }, actualCountdown * 1000);

    log(`Countdown started`, { sessionID, seconds: actualCountdown, incompleteCount });
  }

  const handler = async ({ event }: { event: { type: string; properties?: unknown } }): Promise<void> => {
    const props = event.properties as Record<string, unknown> | undefined;

    if (event.type === "session.error") {
      const sessionID = props?.sessionID as string | undefined;
      if (!sessionID) return;

      const error = props?.error as { name?: string } | undefined;
      // Only check MessageAbortedError - AbortError is not in SDK types
      if (error?.name === "MessageAbortedError") {
        pauseSession(sessionID, 'user_abort');
        log(`Abort detected - session paused`, { sessionID });
      }

      cancelCountdown(sessionID);
      return;
    }

    if (event.type === "session.idle") {
      const sessionID = props?.sessionID as string | undefined;
      if (!sessionID) return;

      log(`session.idle`, { sessionID });

      const mainSessionID = getMainSessionID();
      const isMainSession = sessionID === mainSessionID;

      if (mainSessionID && !isMainSession) {
        log(`Skipped: not main session`, { sessionID });
        return;
      }

      const state = getState(sessionID);

      // Track consecutive idle events for smarter detection
      const now = Date.now();
      if (state.lastIdleAt && (now - state.lastIdleAt) < RAPID_IDLE_WINDOW_MS) {
        state.consecutiveIdleCount = (state.consecutiveIdleCount ?? 0) + 1;
      } else {
        state.consecutiveIdleCount = 1;
      }
      state.lastIdleAt = now;

      if (state.isRecovering) {
        log(`Skipped: in recovery`, { sessionID });
        return;
      }

      // Check if session is paused (user pressed ESC / abort)
      if (isSessionPaused(sessionID)) {
        log(`Skipped: session is paused`, { sessionID });
        return;
      }

      const hasRunningBgTasks = backgroundManager
        ? backgroundManager.getTasksByParentSession(sessionID).some(t => t.status === "running")
        : false;

      if (hasRunningBgTasks) {
        log(`Skipped: background tasks running`, { sessionID });
        return;
      }

      let todos: Todo[] = [];
      try {
        const response = await ctx.client.session.todo({ path: { id: sessionID } });
        todos = (response.data ?? response) as Todo[];
      } catch {
        return;
      }

      if (!todos || todos.length === 0) {
        log(`No todos`, { sessionID });
        return;
      }

      const incompleteCount = getIncompleteCount(todos);
      if (incompleteCount === 0) {
        log(`All todos complete`, { sessionID, total: todos.length });
        state.consecutiveIdleCount = 0; // Reset on completion
        return;
      }

      startCountdown(sessionID, incompleteCount, todos);
      return;
    }

    if (event.type === "message.updated") {
      const info = props?.info as Record<string, unknown> | undefined;
      const sessionID = info?.sessionID as string | undefined;
      const role = info?.role as string | undefined;

      if (!sessionID) return;

      if (role === "user" || role === "assistant") {
        cancelCountdown(sessionID);
      }
      return;
    }

    if (event.type === "tool.execute.before" || event.type === "tool.execute.after") {
      const sessionID = props?.sessionID as string | undefined;
      if (sessionID) {
        cancelCountdown(sessionID);
      }
      return;
    }

    if (event.type === "session.deleted") {
      const sessionInfo = props?.info as { id?: string } | undefined;
      if (sessionInfo?.id) {
        clearSessionPauseState(sessionInfo.id);
        cancelCountdown(sessionInfo.id);
        sessions.delete(sessionInfo.id);
        log(`Session deleted: cleaned up`, { sessionID: sessionInfo.id });
      }
      return;
    }
  };

  return {
    handler,
    markRecovering,
    markRecoveryComplete,
  };
}
