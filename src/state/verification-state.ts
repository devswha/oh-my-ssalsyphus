import * as fs from "fs";
import * as path from "path";
import { log } from "../shared/logger";

export interface VerificationState {
  pending: boolean;
  original_task: string;
  completion_claim: string;
  verification_attempts: number;
  max_verification_attempts: number;
  oracle_feedback: string | null;
  last_attempt_at: string | null;
  session_id: string;
}

const STATE_FILENAME = "ralph-verification.json";

function getSisyphusDir(projectDir: string): string {
  return path.join(projectDir, ".sisyphus");
}

function getStatePath(projectDir: string): string {
  return path.join(getSisyphusDir(projectDir), STATE_FILENAME);
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function readVerificationState(projectDir: string): VerificationState | null {
  const statePath = getStatePath(projectDir);

  if (fs.existsSync(statePath)) {
    try {
      const content = fs.readFileSync(statePath, "utf-8");
      const state = JSON.parse(content) as VerificationState;
      log(`Read verification state`, {
        pending: state.pending,
        attempts: state.verification_attempts,
      });
      return state;
    } catch (err) {
      log(`Failed to read verification state`, { error: String(err) });
    }
  }

  return null;
}

export function writeVerificationState(projectDir: string, state: VerificationState): void {
  const dir = getSisyphusDir(projectDir);
  ensureDir(dir);
  const statePath = getStatePath(projectDir);

  try {
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    log(`Wrote verification state`, {
      pending: state.pending,
      attempts: state.verification_attempts,
    });
  } catch (err) {
    log(`Failed to write verification state`, { error: String(err) });
  }
}

export function clearVerificationState(projectDir: string): void {
  const statePath = getStatePath(projectDir);

  if (fs.existsSync(statePath)) {
    try {
      fs.unlinkSync(statePath);
      log(`Cleared verification state`);
    } catch (err) {
      log(`Failed to clear verification state`, { error: String(err) });
    }
  }
}

export function createVerificationState(
  sessionId: string,
  originalTask: string,
  completionClaim: string,
  maxAttempts: number = 3
): VerificationState {
  return {
    pending: true,
    original_task: originalTask,
    completion_claim: completionClaim,
    verification_attempts: 0,
    max_verification_attempts: maxAttempts,
    oracle_feedback: null,
    last_attempt_at: null,
    session_id: sessionId,
  };
}

export function updateVerificationAttempt(
  projectDir: string,
  state: VerificationState,
  feedback: string | null,
  approved: boolean
): void {
  state.verification_attempts++;
  state.last_attempt_at = new Date().toISOString();
  state.oracle_feedback = feedback;

  if (approved) {
    state.pending = false;
  }

  writeVerificationState(projectDir, state);
}
