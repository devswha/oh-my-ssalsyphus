import type { PluginInput } from "@opencode-ai/plugin";
import { log } from "../shared/logger";
import {
  readVerificationState,
  writeVerificationState,
  clearVerificationState,
  createVerificationState,
  updateVerificationAttempt,
  type VerificationState,
} from "../state/verification-state";
import { readPrd, getPrdStatus } from "../prd/prd-manager";

const COMPLETION_PROMISE = "<promise>TASK_COMPLETE</promise>";
const LEGACY_COMPLETION_PROMISE = "<promise>DONE</promise>";
const ORACLE_APPROVED = "<oracle-approved>VERIFIED_COMPLETE</oracle-approved>";

export interface RalphVerifierOptions {
  maxVerificationAttempts?: number;
  oracleModel?: string;
  onVerified?: (sessionID: string) => void;
  onRejected?: (sessionID: string, feedback: string) => void;
}

export function createRalphVerifierHook(
  ctx: PluginInput,
  options: RalphVerifierOptions = {}
) {
  const maxAttempts = options.maxVerificationAttempts ?? 3;

  const checkForCompletionClaim = (content: string): string | null => {
    if (content.includes(COMPLETION_PROMISE)) {
      return COMPLETION_PROMISE;
    }
    if (content.includes(LEGACY_COMPLETION_PROMISE)) {
      return LEGACY_COMPLETION_PROMISE;
    }
    return null;
  };

  const checkForOracleVerdict = (
    content: string
  ): { approved: boolean; feedback: string } | null => {
    if (content.includes(ORACLE_APPROVED)) {
      return { approved: true, feedback: "Oracle verified completion." };
    }

    const rejectedMatch = content.match(
      /<oracle-rejected>([\s\S]*?)<\/oracle-rejected>/
    );
    if (rejectedMatch) {
      return { approved: false, feedback: rejectedMatch[1].trim() };
    }

    return null;
  };

  const buildVerificationPrompt = (
    state: VerificationState,
    prdContext: string
  ): string => {
    return `[ORACLE VERIFICATION REQUEST]

You are the Oracle, tasked with verifying task completion.

## Original Task
${state.original_task}

## Completion Claim
${state.completion_claim}

## PRD Status
${prdContext}

## Verification Checklist
1. Are ALL acceptance criteria in the PRD met?
2. Is the implementation complete (not partial)?
3. Are there any obvious errors or issues?
4. Would this be considered "done" by professional standards?

## Your Response
If APPROVED, output exactly: ${ORACLE_APPROVED}

If REJECTED, output:
<oracle-rejected>
[Specific feedback on what is missing or needs improvement]
</oracle-rejected>

Be thorough but fair. Only reject if there are genuine issues.`;
  };

  const spawnOracleVerification = async (
    sessionID: string,
    state: VerificationState
  ): Promise<void> => {
    log(`Spawning Oracle for verification`, {
      sessionID,
      attempt: state.verification_attempts + 1,
    });

    const prd = readPrd(ctx.directory);
    const prdContext = prd
      ? `${getPrdStatus(prd).completed}/${getPrdStatus(prd).total} stories complete`
      : "No PRD found";

    const verificationPrompt = buildVerificationPrompt(state, prdContext);

    try {
      // Inject verification prompt into the session
      await ctx.client.session.prompt({
        path: { id: sessionID },
        body: {
          parts: [{ type: "text", text: verificationPrompt }],
        },
        query: { directory: ctx.directory },
      });

      log(`Oracle verification prompt injected`, { sessionID });
    } catch (err) {
      log(`Failed to inject Oracle verification`, {
        sessionID,
        error: String(err),
      });
    }
  };

  const handleCompletionClaim = async (
    sessionID: string,
    claim: string,
    originalTask: string
  ): Promise<void> => {
    let state = readVerificationState(ctx.directory);

    if (!state) {
      state = createVerificationState(sessionID, originalTask, claim, maxAttempts);
      writeVerificationState(ctx.directory, state);
    }

    if (state.verification_attempts >= state.max_verification_attempts) {
      log(`Max verification attempts reached, auto-approving`, { sessionID });
      clearVerificationState(ctx.directory);
      options.onVerified?.(sessionID);

      await ctx.client.tui
        .showToast({
          body: {
            title: "Task Auto-Approved",
            message: `Max verification attempts (${maxAttempts}) reached`,
            variant: "warning" as const,
            duration: 5000,
          },
        })
        .catch(() => {});
      return;
    }

    await spawnOracleVerification(sessionID, state);
  };

  const handleOracleVerdict = async (
    sessionID: string,
    verdict: { approved: boolean; feedback: string }
  ): Promise<void> => {
    const state = readVerificationState(ctx.directory);
    if (!state) return;

    updateVerificationAttempt(ctx.directory, state, verdict.feedback, verdict.approved);

    if (verdict.approved) {
      log(`Oracle approved completion`, { sessionID });
      clearVerificationState(ctx.directory);
      options.onVerified?.(sessionID);

      await ctx.client.tui
        .showToast({
          body: {
            title: "Task Verified Complete!",
            message: "Oracle has verified your work",
            variant: "success" as const,
            duration: 5000,
          },
        })
        .catch(() => {});
    } else {
      log(`Oracle rejected completion`, { sessionID, feedback: verdict.feedback });
      options.onRejected?.(sessionID, verdict.feedback);

      // Inject feedback as continuation prompt
      const feedbackPrompt = `[ORACLE VERIFICATION REJECTED]

The Oracle has reviewed your completion claim and found issues:

${verdict.feedback}

Please address these issues and try again. When complete, output the completion promise again.

Attempt ${state.verification_attempts}/${state.max_verification_attempts}`;

      try {
        await ctx.client.session.prompt({
          path: { id: sessionID },
          body: {
            parts: [{ type: "text", text: feedbackPrompt }],
          },
          query: { directory: ctx.directory },
        });
      } catch (err) {
        log(`Failed to inject Oracle feedback`, {
          sessionID,
          error: String(err),
        });
      }

      await ctx.client.tui
        .showToast({
          body: {
            title: "Verification Failed",
            message: `Oracle found issues (${state.verification_attempts}/${maxAttempts})`,
            variant: "error" as const,
            duration: 5000,
          },
        })
        .catch(() => {});
    }
  };

  const event = async (input: {
    event: { type: string; properties?: unknown };
  }): Promise<void> => {
    const { event } = input;
    const props = event.properties as Record<string, unknown> | undefined;

    if (event.type === "message.updated" || event.type === "message.created") {
      const info = props?.info as Record<string, unknown> | undefined;
      const sessionID = info?.sessionID as string | undefined;
      const role = info?.role as string | undefined;

      if (!sessionID || role !== "assistant") return;

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

        // Check for Oracle verdict first
        const verdict = checkForOracleVerdict(content);
        if (verdict) {
          await handleOracleVerdict(sessionID, verdict);
          return;
        }

        // Check for completion claim
        const completionClaim = checkForCompletionClaim(content);
        if (completionClaim) {
          const state = readVerificationState(ctx.directory);
          // Only trigger verification if not already pending
          if (!state?.pending) {
            // Extract original task from ralph state or use a default
            const originalTask = "Complete the assigned task";
            await handleCompletionClaim(sessionID, completionClaim, originalTask);
          }
        }
      } catch (err) {
        log(`Error processing message for verification`, {
          sessionID,
          error: String(err),
        });
      }
    }

    if (event.type === "session.deleted") {
      const sessionInfo = props?.info as { id?: string } | undefined;
      if (sessionInfo?.id) {
        const state = readVerificationState(ctx.directory);
        if (state?.session_id === sessionInfo.id) {
          clearVerificationState(ctx.directory);
        }
      }
    }
  };

  const isPendingVerification = (): boolean => {
    const state = readVerificationState(ctx.directory);
    return state?.pending ?? false;
  };

  const cancelVerification = (): void => {
    clearVerificationState(ctx.directory);
    log(`Verification cancelled`);
  };

  return {
    event,
    isPendingVerification,
    cancelVerification,
    checkForCompletionClaim,
    checkForOracleVerdict,
  };
}
