/**
 * Shared session pause state for coordinating abort handling across hooks.
 * When user presses ESC (triggers MessageAbortedError), the session is paused
 * and remains paused until explicitly resumed or user sends a new prompt.
 */

import { log } from "../shared/logger";

interface SessionPauseState {
  isPaused: boolean;
  pausedAt: number | null;
  pauseReason: 'user_abort' | 'error' | 'explicit' | null;
}

const pauseStates = new Map<string, SessionPauseState>();

/**
 * Pause a session, preventing automatic continuations.
 * Called when MessageAbortedError is detected (user pressed ESC).
 */
export function pauseSession(
  sessionId: string,
  reason: SessionPauseState['pauseReason'] = 'user_abort'
): void {
  pauseStates.set(sessionId, {
    isPaused: true,
    pausedAt: Date.now(),
    pauseReason: reason,
  });
  log(`Session paused`, { sessionId, reason });
}

/**
 * Check if a session is currently paused.
 */
export function isSessionPaused(sessionId: string): boolean {
  return pauseStates.get(sessionId)?.isPaused ?? false;
}

/**
 * Get the pause state for a session.
 */
export function getSessionPauseState(sessionId: string): SessionPauseState | undefined {
  return pauseStates.get(sessionId);
}

/**
 * Resume a session, allowing automatic continuations.
 * Called when user sends a new prompt or explicitly resumes.
 */
export function resumeSession(sessionId: string): void {
  const state = pauseStates.get(sessionId);
  if (state?.isPaused) {
    log(`Session resumed`, { sessionId, wasPausedFor: Date.now() - (state.pausedAt ?? 0) });
  }
  pauseStates.delete(sessionId);
}

/**
 * Clear session state when session is deleted.
 */
export function clearSessionPauseState(sessionId: string): void {
  pauseStates.delete(sessionId);
}
