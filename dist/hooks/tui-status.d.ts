import type { PluginInput } from "@opencode-ai/plugin";
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
interface AgentStatus {
    name: string;
    status: "running" | "completed" | "failed";
    startTime: number;
    endTime?: number;
}
export declare function createTuiStatusHook(ctx: PluginInput, options?: TuiStatusOptions): {
    showToast: (opts: ToastOptions) => Promise<void>;
    notifyAgentStarted: (agentName: string, task?: string) => Promise<void>;
    notifyAgentCompleted: (agentName: string, success?: boolean) => Promise<void>;
    notifyModeChange: (mode: string, active: boolean) => Promise<void>;
    notifyPhaseChange: (phase: string, current: number, total: number) => Promise<void>;
    notifyIteration: (mode: string, current: number, max: number) => Promise<void>;
    getActiveAgents: () => AgentStatus[];
    "tool.execute.before": (input: {
        tool: string;
        sessionID: string;
        callID: string;
    }, output: {
        args: Record<string, unknown>;
    }) => Promise<void>;
    "tool.execute.after": (input: {
        tool: string;
        sessionID: string;
        callID: string;
    }, output: {
        title: string;
        output: string;
        metadata: any;
    }) => Promise<void>;
};
export {};
