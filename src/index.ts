import type { Plugin, PluginInput } from "@opencode-ai/plugin";
import { createTodoContinuationEnforcer } from "./hooks/todo-continuation-enforcer";
import { createKeywordDetectorHook } from "./hooks/keyword-detector";
import { createRalphLoopHook } from "./hooks/ralph-loop";
import { createSessionRecoveryHook } from "./hooks/session-recovery";
import { createAgentUsageReminderHook } from "./hooks/agent-usage-reminder";
import { createSystemPromptInjector } from "./hooks/system-prompt-injector";
import { createPersistentModeHook } from "./hooks/persistent-mode";
import { createRememberTagProcessor } from "./hooks/remember-tag-processor";
import { initNotepad, formatNotepadContext } from "./hooks/notepad";
import { createBackgroundManager } from "./tools/background-manager";
import { createBackgroundTools } from "./tools/background-tools";
import { createCallOmoAgent } from "./tools/call-omo-agent";
import { builtinTools } from "./tools/builtin";
import { loadConfig } from "./config";
import { setMainSessionID } from "./shared/session-state";

let mainSessionID: string | undefined;

const OmoOmcsPlugin: Plugin = async (ctx: PluginInput) => {
  const config = loadConfig(ctx.directory);
  const disabledHooks = new Set(config.disabled_hooks ?? []);
  const isHookEnabled = (hookName: string) => !disabledHooks.has(hookName);

  const backgroundManager = createBackgroundManager(ctx, config.background_task);

  const systemPromptInjector = isHookEnabled("system-prompt-injector")
    ? createSystemPromptInjector(ctx)
    : null;

  const todoContinuationEnforcer = isHookEnabled("todo-continuation-enforcer")
    ? createTodoContinuationEnforcer(ctx, { backgroundManager })
    : null;

  const ralphLoop = isHookEnabled("ralph-loop")
    ? createRalphLoopHook(ctx, {
        config: config.ralph_loop,
        onModeChange: (sessionID, mode, task) => {
          systemPromptInjector?.setMode(sessionID, mode, task);
          if (mode === "ralph-loop" || mode === "ultrawork-ralph") {
            ralphLoop?.startLoop(sessionID, task ?? "Complete the task", {
              mode: mode as "ralph-loop" | "ultrawork-ralph",
            });
          }
        },
      })
    : null;

  const keywordDetector = isHookEnabled("keyword-detector")
    ? createKeywordDetectorHook(ctx, {
        onModeChange: (sessionID, mode, task) => {
          systemPromptInjector?.setMode(sessionID, mode, task);
          if (mode === "ralph-loop" || mode === "ultrawork-ralph") {
            ralphLoop?.startLoop(sessionID, task ?? "Complete the task", {
              mode: mode as "ralph-loop" | "ultrawork-ralph",
            });
          }
        },
      })
    : null;

  const sessionRecovery = isHookEnabled("session-recovery")
    ? createSessionRecoveryHook(ctx)
    : null;

  const agentUsageReminder = isHookEnabled("agent-usage-reminder")
    ? createAgentUsageReminderHook(ctx)
    : null;

  if (sessionRecovery && todoContinuationEnforcer) {
    sessionRecovery.setOnAbortCallback(todoContinuationEnforcer.markRecovering);
    sessionRecovery.setOnRecoveryCompleteCallback(
      todoContinuationEnforcer.markRecoveryComplete
    );
  }

  // Persistent Mode Hook (unified continuation handler)
  // Can be used for alternative continuation logic or session.idle handling
  const _persistentModeHook = isHookEnabled("persistent-mode")
    ? createPersistentModeHook(ctx, {
        maxTodoContinuationAttempts: 5,
        injectNotepadContext: true,
        pruneOnStart: true,
      })
    : null;
  // Note: persistentModeHook can be used via _persistentModeHook.checkOnIdle(sessionId)
  void _persistentModeHook; // Silence unused variable warning

  // Remember Tag Processor Hook
  const rememberTagProcessor = isHookEnabled("remember-tag-processor")
    ? createRememberTagProcessor(ctx, {
        taskToolOnly: true,
        toolNames: ["Task", "task", "call_omo_agent"],
      })
    : null;

  // Initialize notepad on startup
  initNotepad(ctx.directory);

  const backgroundTools = createBackgroundTools(backgroundManager, ctx.client);
  const callOmoAgent = createCallOmoAgent(ctx, backgroundManager);

  return {
    tool: {
      ...builtinTools,
      ...backgroundTools,
      call_omo_agent: callOmoAgent,
    },

    "chat.message": async (input, output) => {
      await keywordDetector?.["chat.message"]?.(input, output);
    },

    "experimental.chat.system.transform": async (input, output) => {
      await systemPromptInjector?.["experimental.chat.system.transform"]?.(input, output);
    },

    event: async (input) => {
      const { event } = input;
      const props = event.properties as Record<string, unknown> | undefined;

      await todoContinuationEnforcer?.handler(input);
      await ralphLoop?.event(input);

      if (event.type === "session.created") {
        const sessionInfo = props?.info as { id?: string; parentID?: string } | undefined;
        if (!sessionInfo?.parentID) {
          mainSessionID = sessionInfo?.id;
          setMainSessionID(mainSessionID);
        }

        // Inject notepad context on session start (for main session only)
        if (sessionInfo?.id && !sessionInfo?.parentID) {
          const notepadContext = formatNotepadContext(ctx.directory);
          if (notepadContext) {
            ctx.client.session
              .prompt({
                path: { id: sessionInfo.id },
                body: {
                  parts: [
                    {
                      type: "text",
                      text: `<session-restore>\n\n${notepadContext}\n</session-restore>`,
                    },
                  ],
                },
                query: { directory: ctx.directory },
              })
              .catch(() => {});
          }
        }
      }

      if (event.type === "session.deleted") {
        const sessionInfo = props?.info as { id?: string } | undefined;
        if (sessionInfo?.id === mainSessionID) {
          mainSessionID = undefined;
          setMainSessionID(undefined);
        }
        if (sessionInfo?.id) {
          systemPromptInjector?.clearMode(sessionInfo.id);
        }
      }

      if (event.type === "session.error" && sessionRecovery) {
        const error = props?.error;
        if (sessionRecovery.isRecoverableError(error)) {
          const sessionID = props?.sessionID as string | undefined;
          await sessionRecovery.handleSessionRecovery({ sessionID, error });
        }
      }
    },

    "tool.execute.before": async (_input, output) => {
      if (_input.tool === "task") {
        const args = output.args as Record<string, unknown>;
        args.tools = {
          ...(args.tools as Record<string, boolean> | undefined),
          delegate_task: false,
        };
      }
    },

    "tool.execute.after": async (input, output) => {
      await agentUsageReminder?.["tool.execute.after"]?.(input, output);
      // Cast output to compatible type for remember tag processor
      const toolOutput = output as { result?: unknown };
      await rememberTagProcessor?.["tool.execute.after"]?.(input, toolOutput);
    },
  };
};

export default OmoOmcsPlugin;

export type { OmoOmcsConfig } from "./config";
export { getMainSessionID } from "./shared/session-state";
