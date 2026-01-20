import type { PluginInput } from "@opencode-ai/plugin";
import { log } from "../shared/logger";
import type { RalphLoopConfig } from "../config";
import type { ActiveMode } from "./system-prompt-injector";
import { getContinuationMessage } from "./continuation-messages";
import {
  readRalphState,
  writeRalphState,
  clearRalphState,
  createRalphState,
  updateRalphStateIteration,
  markRalphStateComplete,
} from "../state/ralph-state";
import {
  readPrd as readPrdFromManager,
  writePrd as writePrdFromManager,
  createPrdFromTask,
  getNextStory,
  getPrdStatus,
  generateStoryContextPrompt,
  type PRD,
  type UserStory,
} from "../prd/prd-manager";
import { initializeProgress, formatProgressContext } from "../prd/progress-tracker";
import * as path from "path";

// Re-export types for backward compatibility
export type { PRD, UserStory };

interface RalphLoopState {
  sessionID: string;
  prompt: string;
  iteration: number;
  maxIterations: number;
  completionPromise: string;
  isActive: boolean;
  startedAt: number;
  mode: "ralph-loop" | "ultrawork-ralph";
  prdPath?: string;
}

interface RalphLoopOptions {
  config?: RalphLoopConfig;
  onModeChange?: (sessionID: string, mode: ActiveMode, task?: string) => void;
}

const states = new Map<string, RalphLoopState>();
const COMPLETION_PROMISE = "<promise>TASK_COMPLETE</promise>";
const LEGACY_COMPLETION_PROMISE = "<promise>DONE</promise>";
const PRD_FILENAME = "prd.json";

export function createRalphLoopHook(ctx: PluginInput, options: RalphLoopOptions = {}) {
  const maxIterations = options.config?.default_max_iterations ?? 50;
  const isEnabled = options.config?.enabled !== false;

  const getSisyphusDir = (): string => {
    return path.join(ctx.directory, ".sisyphus");
  };

  const getPrdPath = (): string => {
    return path.join(getSisyphusDir(), PRD_FILENAME);
  };

  // Use the new PRD manager functions
  const readPrd = (): PRD | null => {
    return readPrdFromManager(ctx.directory);
  };

  const writePrd = (prd: PRD): void => {
    writePrdFromManager(ctx.directory, prd);
  };

  // Restore state from file on initialization
  const restorePersistedState = (): void => {
    const persistedState = readRalphState(ctx.directory);
    if (persistedState && persistedState.active) {
      log(`Restoring ralph loop from persisted state`, {
        iteration: persistedState.iteration,
        sessionId: persistedState.session_id,
      });

      const state: RalphLoopState = {
        sessionID: persistedState.session_id,
        prompt: persistedState.prompt,
        iteration: persistedState.iteration,
        maxIterations: persistedState.max_iterations,
        completionPromise: persistedState.completion_promise,
        isActive: true,
        startedAt: new Date(persistedState.started_at).getTime(),
        mode: persistedState.prd_mode ? "ralph-loop" : "ralph-loop",
        prdPath: getPrdPath(),
      };

      states.set(persistedState.session_id, state);
    }
  };

  // Try to restore state on hook creation
  restorePersistedState();

  const startLoop = (
    sessionID: string,
    prompt: string,
    opts?: {
      maxIterations?: number;
      mode?: "ralph-loop" | "ultrawork-ralph";
    }
  ): boolean => {
    if (!isEnabled) {
      log(`Ralph loop disabled`, { sessionID });
      return false;
    }

    if (states.has(sessionID)) {
      log(`Ralph loop already active`, { sessionID });
      return false;
    }

    const mode = opts?.mode ?? "ralph-loop";

    let prd = readPrd();
    if (!prd) {
      prd = createPrdFromTask(prompt);
      writePrd(prd);
      log(`Created initial PRD`, { sessionID });
    }
    initializeProgress(ctx.directory, prompt);

    const state: RalphLoopState = {
      sessionID,
      prompt,
      iteration: 0,
      maxIterations: opts?.maxIterations ?? maxIterations,
      completionPromise: COMPLETION_PROMISE,
      isActive: true,
      startedAt: Date.now(),
      mode,
      prdPath: getPrdPath(),
    };

    states.set(sessionID, state);

    // Persist state to file for cross-session recovery
    const persistedState = createRalphState(
      sessionID,
      prompt,
      state.maxIterations,
      true // prd_mode
    );
    writeRalphState(ctx.directory, persistedState);

    options.onModeChange?.(sessionID, mode, prompt);

    log(`Ralph loop started`, {
      sessionID,
      prompt: prompt.substring(0, 50),
      maxIterations: state.maxIterations,
      mode,
    });

    ctx.client.tui
      .showToast({
        body: {
          title: mode === "ultrawork-ralph" ? "Ultrawork-Ralph Activated" : "Ralph Loop Started",
          message: `Task: ${prompt.substring(0, 50)}...`,
          variant: "success" as const,
          duration: 3000,
        },
      })
      .catch(() => {});

    return true;
  };

  const cancelLoop = (sessionID: string): boolean => {
    const state = states.get(sessionID);
    if (!state) {
      log(`No active ralph loop to cancel`, { sessionID });
      return false;
    }

    states.delete(sessionID);

    // Clear persisted state
    clearRalphState(ctx.directory);

    options.onModeChange?.(sessionID, null);

    log(`Ralph loop cancelled`, { sessionID, iteration: state.iteration });

    ctx.client.tui
      .showToast({
        body: {
          title: "Ralph Loop Cancelled",
          message: `Stopped after ${state.iteration} iterations`,
          variant: "warning" as const,
          duration: 3000,
        },
      })
      .catch(() => {});

    return true;
  };

  const getState = (sessionID?: string): RalphLoopState | null => {
    if (sessionID) {
      return states.get(sessionID) ?? null;
    }
    for (const state of states.values()) {
      if (state.isActive) return state;
    }
    return null;
  };

  const checkCompletionInContent = (content: string): boolean => {
    return (
      content.includes(COMPLETION_PROMISE) || content.includes(LEGACY_COMPLETION_PROMISE)
    );
  };

  const event = async (input: {
    event: { type: string; properties?: unknown };
  }): Promise<void> => {
    const { event } = input;
    const props = event.properties as Record<string, unknown> | undefined;

    if (event.type === "session.idle") {
      const sessionID = props?.sessionID as string | undefined;
      if (!sessionID) return;

      const state = states.get(sessionID);
      if (!state || !state.isActive) return;

      state.iteration++;

      // Update persisted state
      const prd = readPrd();
      const nextStory = prd ? getNextStory(prd) : null;
      updateRalphStateIteration(ctx.directory, {
        active: true,
        iteration: state.iteration,
        max_iterations: state.maxIterations,
        completion_promise: state.completionPromise,
        started_at: new Date(state.startedAt).toISOString(),
        prompt: state.prompt,
        session_id: sessionID,
        prd_mode: true,
        current_story_id: nextStory?.id ?? null,
        last_activity_at: new Date().toISOString(),
      }, nextStory?.id);

      if (state.iteration >= state.maxIterations) {
        log(`Ralph loop max iterations reached`, {
          sessionID,
          iteration: state.iteration,
        });
        states.delete(sessionID);
        clearRalphState(ctx.directory);
        options.onModeChange?.(sessionID, null);

        ctx.client.tui
          .showToast({
            body: {
              title: "Ralph Loop Safety Limit",
              message: `Max iterations (${state.maxIterations}) reached`,
              variant: "warning" as const,
              duration: 5000,
            },
          })
          .catch(() => {});
        return;
      }

      const prdStatus = prd ? getPrdStatus(prd) : null;
      const progressContext = formatProgressContext(ctx.directory);

      log(`Ralph loop continuing`, {
        sessionID,
        iteration: state.iteration,
        maxIterations: state.maxIterations,
        incompleteStories: prdStatus?.remaining ?? 0,
      });

      // Use varied continuation messages
      const continuePrompt = getContinuationMessage({
        completedCount: prdStatus?.completed ?? 0,
        totalCount: prdStatus?.total ?? 1,
        nextTask: nextStory ? `${nextStory.id} - ${nextStory.title}` : undefined,
        iteration: state.iteration,
        maxIterations: state.maxIterations,
        mode: state.mode,
      });

      // Add PRD context
      const prdContext = prd ? generateStoryContextPrompt(prd) : "";
      const fullPrompt = `${continuePrompt}

Original task: ${state.prompt}

${prdContext}

${progressContext}

**REMINDER**:
- Check .sisyphus/prd.json for user stories
- Update story "passes" to true when complete
- Log learnings in .sisyphus/progress.txt
- Only output the promise tag when ALL stories pass`;

      try {
        await ctx.client.session.prompt({
          path: { id: sessionID },
          body: {
            parts: [{ type: "text", text: fullPrompt }],
          },
          query: { directory: ctx.directory },
        });
      } catch (err) {
        log(`Ralph loop injection failed`, { sessionID, error: String(err) });
      }
    }

    if (event.type === "message.updated" || event.type === "message.created") {
      const info = props?.info as Record<string, unknown> | undefined;
      const sessionID = info?.sessionID as string | undefined;
      const role = info?.role as string | undefined;

      if (!sessionID || role !== "assistant") return;

      const state = states.get(sessionID);
      if (!state || !state.isActive) return;

      try {
        const messagesResp = await ctx.client.session.messages({
          path: { id: sessionID },
        });
        const messages = (messagesResp.data ?? []) as Array<{
          info?: { role?: string };
          parts?: Array<{ type: string; text?: string }>;
        }>;

        const lastAssistant = [...messages]
          .reverse()
          .find((m) => m.info?.role === "assistant");
        if (!lastAssistant?.parts) return;

        const content = lastAssistant.parts
          .filter((p) => p.type === "text" && p.text)
          .map((p) => p.text)
          .join("\n");

        if (checkCompletionInContent(content)) {
          log(`Ralph loop completion detected`, { sessionID });
          states.delete(sessionID);

          // Mark persisted state as complete
          markRalphStateComplete(ctx.directory, {
            active: false,
            iteration: state.iteration,
            max_iterations: state.maxIterations,
            completion_promise: state.completionPromise,
            started_at: new Date(state.startedAt).toISOString(),
            prompt: state.prompt,
            session_id: sessionID,
            prd_mode: true,
            current_story_id: null,
            last_activity_at: new Date().toISOString(),
          });

          options.onModeChange?.(sessionID, null);

          const duration = Date.now() - state.startedAt;
          const minutes = Math.floor(duration / 60000);
          const seconds = Math.floor((duration % 60000) / 1000);

          ctx.client.tui
            .showToast({
              body: {
                title: "Ralph Loop Completed!",
                message: `Task finished in ${state.iteration} iterations (${minutes}m ${seconds}s)`,
                variant: "success" as const,
                duration: 5000,
              },
            })
            .catch(() => {});
        }
      } catch {
      }
    }

    if (event.type === "session.deleted") {
      const sessionInfo = props?.info as { id?: string } | undefined;
      if (sessionInfo?.id) {
        states.delete(sessionInfo.id);
      }
    }
  };

  return {
    startLoop,
    cancelLoop,
    getState,
    event,
    readPrd,
    writePrd,
    checkCompletionInContent,
  };
}
