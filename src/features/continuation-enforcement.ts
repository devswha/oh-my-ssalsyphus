/**
 * Continuation Enforcement Feature
 *
 * Ensures agents complete all tasks before stopping:
 * - Monitors todo list for incomplete items
 * - Adds reminders to continue when tasks remain
 * - Prevents premature stopping
 * - Provides background task execution guidance
 */

import type { HookDefinition, HookContext, HookResult } from '../shared/types.js';
import { getBackgroundTaskGuidance, DEFAULT_MAX_BACKGROUND_TASKS } from './background-tasks.js';

/**
 * Messages to remind agents to continue
 */
const CONTINUATION_REMINDERS = [
  'You have incomplete tasks remaining. Please continue working until all tasks are complete.',
  'There are still pending items in your task list. Do not stop until everything is done.',
  'REMINDER: Check your todo list - you still have work to do.',
  'Continue working - some tasks are still incomplete.',
  'Please verify all tasks are complete before stopping.'
];

/**
 * Get a random continuation reminder
 */
function getRandomReminder(): string {
  return CONTINUATION_REMINDERS[Math.floor(Math.random() * CONTINUATION_REMINDERS.length)];
}

/**
 * Create a continuation enforcement hook
 *
 * This hook intercepts stop attempts and checks if there are
 * incomplete tasks. If so, it blocks the stop and reminds
 * the agent to continue.
 */
export function createContinuationHook(): HookDefinition {
  return {
    event: 'Stop',
    handler: async (_context: HookContext): Promise<HookResult> => {
      // In a real implementation, this would check the actual todo state
      // For now, we'll provide the structure for integration

      // The hook would examine:
      // 1. The current todo list state
      // 2. Any explicitly stated completion criteria
      // 3. The conversation history for incomplete work

      // Placeholder logic - in practice, integrate with actual todo tracking
      const hasIncompleteTasks = false; // Would be dynamically determined

      if (hasIncompleteTasks) {
        return {
          continue: false,
          message: getRandomReminder()
        };
      }

      return {
        continue: true
      };
    }
  };
}

/**
 * System prompt addition for continuation enforcement
 */
export const continuationSystemPromptAddition = `
## Continuation Enforcement

CRITICAL RULES - You MUST follow these:

1. **Never Stop with Incomplete Work**
   - Before stopping, verify ALL tasks in your todo list are complete
   - Check that all requested features are implemented
   - Ensure tests pass (if applicable)
   - Verify no error messages remain unaddressed

2. **Task Completion Verification**
   - Mark tasks complete ONLY when fully done
   - If blocked, create a new task describing the blocker
   - If a task fails, don't mark it complete - fix it

3. **Quality Gates**
   - Code compiles/runs without errors
   - All requested functionality works
   - No obvious bugs or issues remain

4. **When to Stop**
   You may ONLY stop when:
   - All tasks in the todo list are marked complete
   - User explicitly says "stop" or "that's enough"
   - You've verified the work meets requirements

5. **If Uncertain**
   - Ask the user for clarification
   - Create a verification task
   - Continue investigating rather than stopping prematurely
${getBackgroundTaskGuidance(DEFAULT_MAX_BACKGROUND_TASKS)}
`;

/**
 * Check prompt for signals that all work is done
 */
export function detectCompletionSignals(response: string): {
  claimed: boolean;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
} {
  const completionPatterns = [
    /all (?:tasks?|work|items?) (?:are |is )?(?:now )?(?:complete|done|finished)/i,
    /I(?:'ve| have) (?:completed|finished|done) (?:all|everything)/i,
    /everything (?:is|has been) (?:complete|done|finished)/i,
    /no (?:more|remaining|outstanding) (?:tasks?|work|items?)/i
  ];

  const uncertaintyPatterns = [
    /(?:should|might|could) (?:be|have)/i,
    /I think|I believe|probably|maybe/i,
    /unless|except|but/i
  ];

  const hasCompletion = completionPatterns.some(p => p.test(response));
  const hasUncertainty = uncertaintyPatterns.some(p => p.test(response));

  if (!hasCompletion) {
    return {
      claimed: false,
      confidence: 'high',
      reason: 'No completion claim detected'
    };
  }

  if (hasUncertainty) {
    return {
      claimed: true,
      confidence: 'low',
      reason: 'Completion claimed with uncertainty language'
    };
  }

  return {
    claimed: true,
    confidence: 'high',
    reason: 'Clear completion claim detected'
  };
}

/**
 * Generate a verification prompt to ensure work is complete
 */
export function generateVerificationPrompt(taskSummary: string): string {
  return `Before concluding, please verify the following:

1. Review your todo list - are ALL items marked complete?
2. Have you addressed: ${taskSummary}
3. Are there any errors or issues remaining?
4. Does the implementation meet the original requirements?

If everything is truly complete, confirm by saying "All tasks verified complete."
If anything remains, continue working on it.`;
}
