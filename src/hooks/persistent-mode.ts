/**
 * Persistent Mode Handler
 *
 * Unified handler for persistent work modes: ultrawork, ralph-loop, and todo-continuation.
 * This module intercepts session.idle events and enforces work continuation based on:
 * 1. Active ralph-loop with incomplete promise
 * 2. Active ultrawork mode with pending todos
 * 3. Any pending todos (general enforcement)
 *
 * Priority order: Ralph Loop > Ultrawork > Todo Continuation
 *
 * Based on oh-my-claude-sisyphus persistent-mode hook.
 */

import type { PluginInput } from "@opencode-ai/plugin";
import { log } from "../shared/logger";
import {
  readUltraworkState,
  clearUltraworkState,
  updateUltraworkStateChecked,
} from "../state/ultrawork-state";
import {
  readRalphState,
  clearRalphState,
} from "../state/ralph-state";
import { getContinuationMessage } from "./continuation-messages";
import { formatNotepadContext, pruneOldEntries } from "./notepad";

// ============================================================================
// Types
// ============================================================================

export interface PersistentModeResult {
  /** Whether to inject a continuation message */
  shouldContinue: boolean;
  /** Message to inject into context */
  message: string;
  /** Which mode triggered the continuation */
  mode: "ralph-loop" | "ultrawork" | "todo-continuation" | "none";
  /** Additional metadata */
  metadata?: {
    todoCount?: number;
    iteration?: number;
    maxIterations?: number;
    reinforcementCount?: number;
    todoContinuationAttempts?: number;
  };
}

export interface PersistentModeOptions {
  /** Maximum todo-continuation attempts before giving up (prevents infinite loops) */
  maxTodoContinuationAttempts?: number;
  /** Whether to inject notepad context */
  injectNotepadContext?: boolean;
  /** Whether to prune old entries on session start */
  pruneOnStart?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_TODO_CONTINUATION_ATTEMPTS = 5;

// Track todo-continuation attempts per session to prevent infinite loops
const todoContinuationAttempts = new Map<string, number>();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get or increment todo-continuation attempt counter
 */
function trackTodoContinuationAttempt(sessionId: string): number {
  const current = todoContinuationAttempts.get(sessionId) || 0;
  const next = current + 1;
  todoContinuationAttempts.set(sessionId, next);
  return next;
}

/**
 * Reset todo-continuation attempt counter (call when todos actually change)
 */
export function resetTodoContinuationAttempts(sessionId: string): void {
  todoContinuationAttempts.delete(sessionId);
}

// ============================================================================
// Check Functions
// ============================================================================

/**
 * Check Ralph Loop state and determine if it should continue
 */
function checkRalphLoop(
  projectDir: string,
  sessionId?: string
): PersistentModeResult | null {
  const state = readRalphState(projectDir);

  if (!state || !state.active) {
    return null;
  }

  // Check if this is the right session
  if (state.session_id && sessionId && state.session_id !== sessionId) {
    return null;
  }

  // Check max iterations
  if (state.iteration >= state.max_iterations) {
    clearRalphState(projectDir);
    log(`Ralph loop max iterations reached`, {
      iteration: state.iteration,
      maxIterations: state.max_iterations,
    });
    return {
      shouldContinue: false,
      message: `[RALPH LOOP STOPPED] Max iterations (${state.max_iterations}) reached without completion promise.`,
      mode: "none",
    };
  }

  // Continue the loop
  const continuationMessage = getContinuationMessage({
    completedCount: 0,
    totalCount: 1,
    iteration: state.iteration,
    maxIterations: state.max_iterations,
    mode: state.prd_mode ? "ralph-loop" : "ralph-loop",
  });

  return {
    shouldContinue: true,
    message: `<ralph-loop-continuation>

[RALPH LOOP - ITERATION ${state.iteration}/${state.max_iterations}]

${continuationMessage}

Original task: ${state.prompt}

**REMINDER**:
- Check .sisyphus/prd.json for user stories
- Update story "passes" to true when complete
- Only output <promise>TASK_COMPLETE</promise> when ALL stories pass

</ralph-loop-continuation>

---

`,
    mode: "ralph-loop",
    metadata: {
      iteration: state.iteration,
      maxIterations: state.max_iterations,
    },
  };
}

/**
 * Check Ultrawork state and determine if it should reinforce
 */
function checkUltrawork(
  projectDir: string,
  sessionId?: string,
  hasIncompleteTodos?: boolean
): PersistentModeResult | null {
  const state = readUltraworkState(projectDir);

  if (!state || !state.active) {
    return null;
  }

  // If bound to a session, only reinforce for that session
  if (state.session_id && sessionId && state.session_id !== sessionId) {
    return null;
  }

  // If no incomplete todos, ultrawork can complete
  if (!hasIncompleteTodos) {
    clearUltraworkState(projectDir, true);
    log(`Ultrawork completed - all tasks done`);
    return {
      shouldContinue: false,
      message: `[ULTRAWORK COMPLETE] All tasks finished. Ultrawork mode deactivated. Well done!`,
      mode: "none",
    };
  }

  // Reinforce ultrawork mode
  updateUltraworkStateChecked(projectDir, state);

  return {
    shouldContinue: true,
    message: `<ultrawork-persistence>

[ULTRAWORK MODE STILL ACTIVE - Reinforcement #${state.reinforcement_count + 1}]

Your ultrawork session is NOT complete. Incomplete todos remain.

REMEMBER THE ULTRAWORK RULES:
- **PARALLEL**: Fire independent calls simultaneously - NEVER wait sequentially
- **BACKGROUND FIRST**: Use Task(run_in_background=true) for exploration (10+ concurrent)
- **TODO**: Track EVERY step. Mark complete IMMEDIATELY after each
- **VERIFY**: Check ALL requirements met before done
- **NO Premature Stopping**: ALL TODOs must be complete

Continue working on the next pending task. DO NOT STOP until all tasks are marked complete.

Original task: ${state.original_prompt}

</ultrawork-persistence>

---

`,
    mode: "ultrawork",
    metadata: {
      reinforcementCount: state.reinforcement_count,
    },
  };
}

/**
 * Check for incomplete todos (baseline enforcement)
 */
function checkTodoContinuation(
  sessionId: string,
  todoCount: number,
  totalCount: number,
  nextTask?: string,
  options?: PersistentModeOptions
): PersistentModeResult | null {
  if (todoCount === 0) {
    // Reset counter when todos are cleared
    resetTodoContinuationAttempts(sessionId);
    return null;
  }

  const maxAttempts =
    options?.maxTodoContinuationAttempts ?? DEFAULT_MAX_TODO_CONTINUATION_ATTEMPTS;
  const attemptCount = trackTodoContinuationAttempt(sessionId);

  if (attemptCount > maxAttempts) {
    // Too many attempts - agent appears stuck, allow stop but warn
    log(`Todo continuation limit reached`, { attempts: attemptCount, maxAttempts });
    return {
      shouldContinue: false,
      message: `[TODO CONTINUATION LIMIT] Attempted ${maxAttempts} continuations without progress. ${todoCount} tasks remain incomplete. Consider reviewing the stuck tasks or asking the user for guidance.`,
      mode: "none",
      metadata: {
        todoCount,
        todoContinuationAttempts: attemptCount,
      },
    };
  }

  const continuationMessage = getContinuationMessage({
    completedCount: totalCount - todoCount,
    totalCount,
    nextTask,
    mode: "todo",
  });

  const attemptInfo =
    attemptCount > 1
      ? `\n[Continuation attempt ${attemptCount}/${maxAttempts}]`
      : "";

  return {
    shouldContinue: true,
    message: `<todo-continuation>

${continuationMessage}

[Status: ${todoCount} of ${totalCount} tasks remaining]${attemptInfo}

</todo-continuation>

---

`,
    mode: "todo-continuation",
    metadata: {
      todoCount,
      todoContinuationAttempts: attemptCount,
    },
  };
}

// ============================================================================
// Main Check Function
// ============================================================================

/**
 * Main persistent mode checker
 * Checks all persistent modes in priority order and returns appropriate action
 */
export async function checkPersistentModes(
  ctx: PluginInput,
  sessionId: string,
  options?: PersistentModeOptions
): Promise<PersistentModeResult> {
  const projectDir = ctx.directory;

  // Prune old notepad entries if enabled
  if (options?.pruneOnStart) {
    pruneOldEntries(projectDir);
  }

  // Get todos
  let todos: Array<{ status: string; content?: string }> = [];
  try {
    const response = await ctx.client.session.todo({ path: { id: sessionId } });
    todos = (response.data ?? response) as typeof todos;
  } catch {
    // Ignore errors - proceed without todo info
  }

  const todoCount = todos.filter(
    (t) => t.status !== "completed" && t.status !== "cancelled"
  ).length;
  const totalCount = todos.length;
  const nextTask = todos.find(
    (t) => t.status === "pending" || t.status === "in_progress"
  )?.content;
  const hasIncompleteTodos = todoCount > 0;

  // Priority 1: Ralph Loop (explicit loop mode)
  const ralphResult = checkRalphLoop(projectDir, sessionId);
  if (ralphResult?.shouldContinue) {
    // Add notepad context if enabled
    if (options?.injectNotepadContext) {
      const notepadContext = formatNotepadContext(projectDir);
      if (notepadContext) {
        ralphResult.message = notepadContext + "\n" + ralphResult.message;
      }
    }
    return ralphResult;
  }

  // Priority 2: Ultrawork Mode (performance mode with persistence)
  const ultraworkResult = checkUltrawork(projectDir, sessionId, hasIncompleteTodos);
  if (ultraworkResult?.shouldContinue) {
    // Add notepad context if enabled
    if (options?.injectNotepadContext) {
      const notepadContext = formatNotepadContext(projectDir);
      if (notepadContext) {
        ultraworkResult.message = notepadContext + "\n" + ultraworkResult.message;
      }
    }
    return ultraworkResult;
  }

  // Priority 3: Todo Continuation (baseline enforcement)
  if (hasIncompleteTodos) {
    const todoContResult = checkTodoContinuation(
      sessionId,
      todoCount,
      totalCount,
      nextTask,
      options
    );
    if (todoContResult?.shouldContinue) {
      // Add notepad context if enabled
      if (options?.injectNotepadContext) {
        const notepadContext = formatNotepadContext(projectDir);
        if (notepadContext) {
          todoContResult.message = notepadContext + "\n" + todoContResult.message;
        }
      }
      return todoContResult;
    }
    if (todoContResult) {
      return todoContResult;
    }
  }

  // No continuation needed
  return {
    shouldContinue: false,
    message: "",
    mode: "none",
  };
}

// ============================================================================
// Hook Factory
// ============================================================================

/**
 * Create the persistent mode hook
 */
export function createPersistentModeHook(
  ctx: PluginInput,
  options?: PersistentModeOptions
) {
  return {
    /**
     * Check persistent modes on session.idle
     */
    checkOnIdle: async (sessionId: string): Promise<PersistentModeResult> => {
      return checkPersistentModes(ctx, sessionId, options);
    },

    /**
     * Reset continuation attempts (call when todos change)
     */
    resetAttempts: (sessionId: string): void => {
      resetTodoContinuationAttempts(sessionId);
    },
  };
}
