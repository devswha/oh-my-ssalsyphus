import type { PluginInput } from "@opencode-ai/plugin";
export interface EditErrorRecoveryOptions {
    enabled?: boolean;
    maxRetries?: number;
    showToasts?: boolean;
}
type ErrorType = "string_not_found" | "file_not_found" | "permission_denied" | "timeout" | "rate_limit" | "connection_error" | "unknown";
interface ErrorState {
    tool: string;
    consecutiveErrors: number;
    lastErrorFile?: string;
    lastErrorType: ErrorType;
    lastErrorTime: number;
    retryCount: number;
}
export declare function createEditErrorRecoveryHook(ctx: PluginInput, options?: EditErrorRecoveryOptions): {
    getErrorStats: (sessionId: string) => {
        totalErrors: number;
        errorsByType: Record<string, number>;
        recentErrors: ErrorState[];
    };
    clearErrorState: (sessionId: string, key?: string) => void;
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
