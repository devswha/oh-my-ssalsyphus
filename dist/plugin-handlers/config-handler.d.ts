import type { PluginInput } from "@opencode-ai/plugin";
import type { OmoOmcsConfig } from "../config";
interface AgentConfig {
    model?: string;
    temperature?: number;
    top_p?: number;
    topP?: number;
    topK?: number;
    prompt?: string;
    description?: string;
    color?: string;
    mode?: "subagent" | "primary" | "all";
    maxSteps?: number;
    tools?: Record<string, boolean>;
    disable?: boolean;
}
interface CommandConfig {
    template: string;
    description?: string;
    agent?: string;
    model?: string;
    subtask?: boolean;
}
interface OpenCodeConfig {
    default_agent?: string;
    agent?: Record<string, AgentConfig | undefined>;
    command?: Record<string, CommandConfig>;
    [key: string]: unknown;
}
export interface ConfigHandlerDeps {
    ctx: PluginInput;
    pluginConfig: OmoOmcsConfig;
}
export declare function createConfigHandler(deps: ConfigHandlerDeps): (config: OpenCodeConfig) => Promise<void>;
export {};
