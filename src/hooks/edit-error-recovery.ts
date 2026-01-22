import type { PluginInput } from "@opencode-ai/plugin";
import { log } from "../shared/logger";

export interface EditErrorRecoveryOptions {
  enabled?: boolean;
  maxRetries?: number;
  showToasts?: boolean;
}

// Error patterns for different tool types
const EDIT_ERROR_PATTERNS = [
  /old_string.*not.*found/i,
  /no.*match.*found/i,
  /file.*not.*found/i,
  /permission.*denied/i,
  /cannot.*edit/i,
  /edit.*failed/i,
];

const READ_ERROR_PATTERNS = [
  /ENOENT/i,
  /file.*not.*found/i,
  /permission.*denied/i,
  /cannot.*read/i,
];

const BASH_ERROR_PATTERNS = [
  /ETIMEDOUT/i,
  /ECONNREFUSED/i,
  /rate.*limit/i,
  /429/i,
  /503/i,
  /502/i,
];

// Error classification
type ErrorType =
  | "string_not_found"
  | "file_not_found"
  | "permission_denied"
  | "timeout"
  | "rate_limit"
  | "connection_error"
  | "unknown";

interface ErrorState {
  tool: string;
  consecutiveErrors: number;
  lastErrorFile?: string;
  lastErrorType: ErrorType;
  lastErrorTime: number;
  retryCount: number;
}

interface SessionErrorTracking {
  errors: Map<string, ErrorState>; // keyed by tool+file combo
  totalErrors: number;
  lastErrorTime: number;
}

// Retry configuration per error type
const RETRY_CONFIG: Record<ErrorType, { maxRetries: number; backoffMs: number[] }> = {
  string_not_found: { maxRetries: 2, backoffMs: [500, 1000] },
  file_not_found: { maxRetries: 1, backoffMs: [1000] },
  permission_denied: { maxRetries: 0, backoffMs: [] },
  timeout: { maxRetries: 3, backoffMs: [1000, 2000, 4000] },
  rate_limit: { maxRetries: 3, backoffMs: [2000, 5000, 10000] },
  connection_error: { maxRetries: 2, backoffMs: [1000, 3000] },
  unknown: { maxRetries: 1, backoffMs: [1000] },
};

const sessionTracking = new Map<string, SessionErrorTracking>();

export function createEditErrorRecoveryHook(
  ctx: PluginInput,
  options: EditErrorRecoveryOptions = {}
) {
  const { enabled = true, maxRetries = 3, showToasts = true } = options;

  function getSessionTracking(sessionId: string): SessionErrorTracking {
    if (!sessionTracking.has(sessionId)) {
      sessionTracking.set(sessionId, {
        errors: new Map(),
        totalErrors: 0,
        lastErrorTime: 0,
      });
    }
    return sessionTracking.get(sessionId)!;
  }

  function classifyError(tool: string, errorOutput: string): ErrorType {
    if (tool === "Edit" || tool === "edit") {
      if (/old_string.*not.*found/i.test(errorOutput)) return "string_not_found";
      if (/file.*not.*found/i.test(errorOutput) || /ENOENT/i.test(errorOutput)) return "file_not_found";
      if (/permission/i.test(errorOutput)) return "permission_denied";
    }

    if (tool === "Read" || tool === "read") {
      if (/ENOENT/i.test(errorOutput) || /file.*not.*found/i.test(errorOutput)) return "file_not_found";
      if (/permission/i.test(errorOutput)) return "permission_denied";
    }

    if (tool === "Bash" || tool === "bash") {
      if (/ETIMEDOUT/i.test(errorOutput)) return "timeout";
      if (/rate.*limit/i.test(errorOutput) || /429/i.test(errorOutput)) return "rate_limit";
      if (/ECONNREFUSED/i.test(errorOutput) || /502|503/i.test(errorOutput)) return "connection_error";
    }

    return "unknown";
  }

  function isRecoverableError(tool: string, errorOutput: string): boolean {
    if (tool === "Edit" || tool === "edit") {
      return EDIT_ERROR_PATTERNS.some(p => p.test(errorOutput));
    }
    if (tool === "Read" || tool === "read") {
      return READ_ERROR_PATTERNS.some(p => p.test(errorOutput));
    }
    if (tool === "Bash" || tool === "bash") {
      return BASH_ERROR_PATTERNS.some(p => p.test(errorOutput));
    }
    return false;
  }

  function getErrorKey(tool: string, filePath?: string): string {
    return `${tool}:${filePath || "unknown"}`;
  }

  async function showToast(title: string, message: string, variant: "info" | "warning" | "error"): Promise<void> {
    if (!showToasts) return;
    try {
      await ctx.client.tui.showToast({
        body: { title, message, variant, duration: 3000 },
      });
    } catch {
      // Ignore toast errors
    }
  }

  function getRecoveryHint(errorType: ErrorType, tool: string, file?: string): string {
    const hints: Record<ErrorType, string> = {
      string_not_found: `Re-read ${file || "the file"} to get current content before editing`,
      file_not_found: `Verify the file path exists: ${file || "unknown"}`,
      permission_denied: `Check file permissions for: ${file || "unknown"}`,
      timeout: "Consider increasing timeout or breaking into smaller operations",
      rate_limit: "Wait before retrying - rate limit hit",
      connection_error: "Check network connectivity",
      unknown: `Review the error for ${tool} operation`,
    };
    return hints[errorType];
  }

  function getErrorStats(sessionId: string): {
    totalErrors: number;
    errorsByType: Record<string, number>;
    recentErrors: ErrorState[];
  } {
    const tracking = getSessionTracking(sessionId);
    const errorsByType: Record<string, number> = {};
    const recentErrors: ErrorState[] = [];

    for (const error of tracking.errors.values()) {
      errorsByType[error.lastErrorType] = (errorsByType[error.lastErrorType] || 0) + 1;
      if (Date.now() - error.lastErrorTime < 60000) {
        recentErrors.push(error);
      }
    }

    return {
      totalErrors: tracking.totalErrors,
      errorsByType,
      recentErrors,
    };
  }

  function clearErrorState(sessionId: string, key?: string): void {
    const tracking = getSessionTracking(sessionId);
    if (key) {
      tracking.errors.delete(key);
    } else {
      tracking.errors.clear();
      tracking.totalErrors = 0;
    }
  }

  return {
    // Public API
    getErrorStats,
    clearErrorState,

    "tool.execute.after": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { title: string; output: string; metadata: any }
    ): Promise<void> => {
      if (!enabled) return;

      const tool = input.tool;
      const errorOutput = output.output || "";
      const metadata = output.metadata as Record<string, unknown> | undefined;
      const filePath = metadata?.file_path as string | undefined;

      // Check if this is a recoverable error
      if (!isRecoverableError(tool, errorOutput)) {
        // Successful operation - clear error state for this tool+file combo
        const key = getErrorKey(tool, filePath);
        const tracking = getSessionTracking(input.sessionID);
        if (tracking.errors.has(key)) {
          const state = tracking.errors.get(key)!;
          if (state.consecutiveErrors > 0) {
            log("[error-recovery] Operation succeeded after errors, clearing state", {
              sessionID: input.sessionID,
              tool,
              file: filePath,
              previousErrors: state.consecutiveErrors,
            });
            tracking.errors.delete(key);
          }
        }
        return;
      }

      // Error detected - track it
      const errorType = classifyError(tool, errorOutput);
      const key = getErrorKey(tool, filePath);
      const tracking = getSessionTracking(input.sessionID);
      const retryConfig = RETRY_CONFIG[errorType];

      let state = tracking.errors.get(key);
      if (!state) {
        state = {
          tool,
          consecutiveErrors: 0,
          lastErrorType: errorType,
          lastErrorTime: Date.now(),
          retryCount: 0,
        };
        tracking.errors.set(key, state);
      }

      state.consecutiveErrors++;
      state.lastErrorFile = filePath;
      state.lastErrorType = errorType;
      state.lastErrorTime = Date.now();
      tracking.totalErrors++;
      tracking.lastErrorTime = Date.now();

      log("[error-recovery] Error detected", {
        sessionID: input.sessionID,
        tool,
        file: filePath,
        errorType,
        consecutiveErrors: state.consecutiveErrors,
        retryCount: state.retryCount,
        maxRetries: Math.min(retryConfig.maxRetries, maxRetries),
      });

      // Check if we can retry
      const effectiveMaxRetries = Math.min(retryConfig.maxRetries, maxRetries);
      const canRetry = state.retryCount < effectiveMaxRetries;

      if (canRetry) {
        state.retryCount++;
        const backoffMs = retryConfig.backoffMs[state.retryCount - 1] || retryConfig.backoffMs[retryConfig.backoffMs.length - 1] || 1000;

        log("[error-recovery] Preparing retry", {
          sessionID: input.sessionID,
          retryAttempt: state.retryCount,
          backoffMs,
          hint: getRecoveryHint(errorType, tool, filePath),
        });

        await showToast(
          "🔄 Auto-Retry",
          `${tool}: ${errorType.replace(/_/g, " ")} - retrying (${state.retryCount}/${effectiveMaxRetries})`,
          "warning"
        );

        // Note: Actual retry mechanism depends on OpenCode's plugin API capabilities
        // This logs the intent - the actual retry would need OpenCode API support
      } else {
        log("[error-recovery] Max retries reached", {
          sessionID: input.sessionID,
          tool,
          file: filePath,
          errorType,
          totalAttempts: state.retryCount + 1,
        });

        await showToast(
          "❌ Recovery Failed",
          `${tool}: ${getRecoveryHint(errorType, tool, filePath)}`,
          "error"
        );

        // Reset retry count for future attempts
        state.retryCount = 0;
      }
    },
  };
}
