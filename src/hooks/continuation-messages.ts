/**
 * Continuation message variants to prevent pattern fatigue
 * and provide contextual reminders
 */

export interface ContinuationContext {
  completedCount: number;
  totalCount: number;
  nextTask?: string;
  iteration?: number;
  maxIterations?: number;
  mode?: "todo" | "ralph-loop" | "ultrawork-ralph";
}

const TODO_CONTINUATION_MESSAGES = [
  `[SYSTEM REMINDER - TODO CONTINUATION]

Incomplete tasks remain in your todo list. Continue working on the next pending task.

- Proceed without asking for permission
- Mark each task complete when finished
- Do not stop until all tasks are done`,

  `[THE BOULDER NEVER STOPS]

Like Sisyphus, you are bound to your task list. The boulder does not rest until it reaches the summit.

There are still pending tasks. Pick up where you left off and continue.

- Check your todo list for the next item
- Work through each task systematically
- Only rest when ALL tasks show "completed"`,

  `[SISYPHUS REMINDER]

Your work is not yet complete. The mountain awaits.

Remaining tasks need your attention. Resume working now.

- No need to ask for permission
- Execute the next pending task
- The loop continues until completion`,

  `[CONTINUATION REQUIRED]

Task list incomplete. Resume execution.

You stopped before finishing. This is a reminder to continue.

- Review your todo list
- Start the next pending item
- Keep working until done`,

  `[TASK PERSISTENCE ACTIVE]

Unfinished business detected. Re-engaging.

Your todo list still has pending items. Time to get back to work.

- Don't wait for instructions
- Pick up the next task
- Complete everything before stopping`,
];

const RALPH_CONTINUATION_MESSAGES = [
  `[RALPH LOOP CONTINUATION]

You stopped without completing your promise. The work is NOT done yet.

Continue working on incomplete items. Do not stop until you can truthfully output:
\`<promise>TASK_COMPLETE</promise>\``,

  `[RALPH LOOP - THE PROMISE BINDS YOU]

The loop cannot be broken until you have earned your release.

Your promise tag awaits. Keep working until you can honestly claim completion.

Remember: The promise is not just a tag - it's a commitment to quality.`,

  `[RALPH LOOP - PERSISTENCE REQUIRED]

You have not yet earned your \`<promise>TASK_COMPLETE</promise>\`.

Review the PRD. Check what remains. Continue executing.

The loop will release you only when the work is truly done.`,

  `[RALPH LOOP - CONTINUE OR VERIFY]

Either:
1. Continue working on remaining tasks, OR
2. If you believe you're done, output the completion promise

But be warned: false completion claims will be verified by Architect.`,

  `[RALPH LOOP - SISYPHEAN PERSISTENCE]

The boulder rolls. The work continues. The loop persists.

Check .omc/prd.json for remaining stories.
Log your progress in .omc/progress.txt.
Only the completion promise ends the loop.`,
];

const ULTRAWORK_RALPH_MESSAGES = [
  `[ULTRAWORK-RALPH - MAXIMUM INTENSITY CONTINUATION]

PARALLEL EVERYTHING. DELEGATE AGGRESSIVELY. NEVER WAIT.

You stopped, but the boulder still rolls. Resume at MAXIMUM INTENSITY.

The combined modes demand:
- Ultrawork's parallel execution
- Ralph's completion guarantee

Both conditions must be met. Continue NOW.`,

  `[ULTRAWORK-RALPH - THE ULTIMATE MODE CONTINUES]

This is not a drill. This is ULTRAWORK-RALPH.

Resume work immediately. Fire off multiple agents. Background everything.

The loop does not release you until Architect-verified completion.`,

  `[ULTRAWORK-RALPH - PERSISTENCE × INTENSITY]

The most powerful mode will not be denied.

CONTINUE:
- Launch parallel tasks
- Delegate to specialists
- Never wait for results
- Keep the pressure on

The promise awaits your earned completion.`,
];

/**
 * Get a contextual continuation message
 */
export function getContinuationMessage(context: ContinuationContext): string {
  const { completedCount, totalCount, nextTask, iteration, maxIterations, mode } =
    context;

  // Select message pool based on mode
  let messages: string[];
  switch (mode) {
    case "ultrawork-ralph":
      messages = ULTRAWORK_RALPH_MESSAGES;
      break;
    case "ralph-loop":
      messages = RALPH_CONTINUATION_MESSAGES;
      break;
    default:
      messages = TODO_CONTINUATION_MESSAGES;
  }

  // Select a message (rotate based on iteration or random)
  const index = iteration
    ? iteration % messages.length
    : Math.floor(Math.random() * messages.length);
  let message = messages[index];

  // Append status information
  const statusLine = `\n\n[Status: ${completedCount}/${totalCount} completed, ${totalCount - completedCount} remaining]`;
  message += statusLine;

  // Add next task hint if available
  if (nextTask) {
    message += `\n[Next: ${nextTask}]`;
  }

  // Add iteration info for ralph loop
  if (iteration !== undefined && maxIterations !== undefined) {
    message += `\n[Iteration: ${iteration}/${maxIterations}]`;
  }

  return message;
}

/**
 * Get a progress summary message
 */
export function getProgressSummary(context: ContinuationContext): string {
  const { completedCount, totalCount } = context;
  const remaining = totalCount - completedCount;
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  if (remaining === 0) {
    return `All ${totalCount} tasks completed (100%)`;
  }

  return `${completedCount}/${totalCount} tasks (${percent}%) - ${remaining} remaining`;
}

/**
 * Get a short toast message
 */
export function getToastMessage(context: ContinuationContext): string {
  const remaining = context.totalCount - context.completedCount;
  return `${remaining} task${remaining === 1 ? "" : "s"} remaining`;
}
