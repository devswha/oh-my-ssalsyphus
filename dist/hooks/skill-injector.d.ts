/**
 * Skill Injector Hook
 *
 * Automatically detects context and injects skill prompts.
 */
import type { PluginInput } from "@opencode-ai/plugin";
export interface SkillInjection {
    skill: "frontend-ui-ux" | "git-master" | null;
    prompt: string | null;
}
export declare function createSkillInjector(_ctx: PluginInput): {
    /**
     * Detect context and return appropriate skill injection
     */
    detectAndInject(sessionID: string, messageText: string): SkillInjection;
};
