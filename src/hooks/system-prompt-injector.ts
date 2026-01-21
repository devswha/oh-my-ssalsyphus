import type { PluginInput } from "@opencode-ai/plugin";
import { log } from "../shared/logger";
import {
  ULTRAWORK_SYSTEM_PROMPT,
  RALPH_LOOP_SYSTEM_PROMPT,
  ULTRAWORK_RALPH_SYSTEM_PROMPT,
} from "../prompts/ultrawork";
import type { SkillInjection } from "./skill-injector";

export type ActiveMode = "ultrawork" | "ralph-loop" | "ultrawork-ralph" | null;

interface ModeState {
  mode: ActiveMode;
  sessionID: string;
  startedAt: number;
  task?: string;
}

const sessionModes = new Map<string, ModeState>();
const sessionSkills = new Map<string, SkillInjection>();

export function createSystemPromptInjector(_ctx: PluginInput) {
  const setMode = (sessionID: string, mode: ActiveMode, task?: string): void => {
    if (mode === null) {
      sessionModes.delete(sessionID);
      log(`Mode cleared`, { sessionID });
    } else {
      sessionModes.set(sessionID, {
        mode,
        sessionID,
        startedAt: Date.now(),
        task,
      });
      log(`Mode set`, { sessionID, mode, task: task?.substring(0, 50) });
    }
  };

  const getMode = (sessionID: string): ModeState | undefined => {
    return sessionModes.get(sessionID);
  };

  const clearMode = (sessionID: string): void => {
    sessionModes.delete(sessionID);
  };

  const setSkillInjection = (sessionID: string, injection: SkillInjection): void => {
    if (injection.skill) {
      sessionSkills.set(sessionID, injection);
      log(`Skill injection set`, { sessionID, skill: injection.skill });
    }
  };

  const getSkillInjection = (sessionID: string): SkillInjection | undefined => {
    return sessionSkills.get(sessionID);
  };

  const clearSkillInjection = (sessionID: string): void => {
    sessionSkills.delete(sessionID);
  };

  const getSystemPromptForMode = (mode: ActiveMode): string | null => {
    switch (mode) {
      case "ultrawork":
        return ULTRAWORK_SYSTEM_PROMPT;
      case "ralph-loop":
        return RALPH_LOOP_SYSTEM_PROMPT;
      case "ultrawork-ralph":
        return ULTRAWORK_RALPH_SYSTEM_PROMPT;
      default:
        return null;
    }
  };

  const systemTransformHook = async (
    input: { sessionID: string },
    output: { system: string[] }
  ): Promise<void> => {
    // Inject mode prompts
    const state = sessionModes.get(input.sessionID);
    if (state?.mode) {
      const systemPrompt = getSystemPromptForMode(state.mode);
      if (systemPrompt) {
        output.system.push(systemPrompt);
        log(`Injected system prompt`, { sessionID: input.sessionID, mode: state.mode });
      }
    }

    // Inject skill prompts
    const skillInjection = sessionSkills.get(input.sessionID);
    if (skillInjection?.prompt) {
      output.system.push(skillInjection.prompt);
      log(`Injected skill prompt`, { sessionID: input.sessionID, skill: skillInjection.skill });
    }
  };

  return {
    setMode,
    getMode,
    clearMode,
    getSystemPromptForMode,
    setSkillInjection,
    getSkillInjection,
    clearSkillInjection,
    "experimental.chat.system.transform": systemTransformHook,
  };
}
