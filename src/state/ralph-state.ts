import * as fs from "fs";
import * as path from "path";
import { log } from "../shared/logger";

export interface RalphState {
  active: boolean;
  iteration: number;
  max_iterations: number;
  completion_promise: string;
  started_at: string;
  prompt: string;
  session_id: string;
  prd_mode: boolean;
  current_story_id: string | null;
  last_activity_at: string;
}

const STATE_FILENAME = "ralph-state.json";

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

export function readRalphState(projectDir: string): RalphState | null {
  const statePath = getStatePath(projectDir);

  if (fs.existsSync(statePath)) {
    try {
      const content = fs.readFileSync(statePath, "utf-8");
      const state = JSON.parse(content) as RalphState;
      log(`Read ralph state from ${statePath}`, {
        active: state.active,
        iteration: state.iteration,
      });
      return state;
    } catch (err) {
      log(`Failed to read ralph state`, { error: String(err) });
    }
  }

  return null;
}

export function writeRalphState(projectDir: string, state: RalphState): void {
  const dir = getSisyphusDir(projectDir);
  ensureDir(dir);
  const statePath = getStatePath(projectDir);

  try {
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    log(`Wrote ralph state`, { iteration: state.iteration, active: state.active });
  } catch (err) {
    log(`Failed to write ralph state`, { error: String(err) });
  }
}

export function clearRalphState(projectDir: string): void {
  const statePath = getStatePath(projectDir);

  if (fs.existsSync(statePath)) {
    try {
      fs.unlinkSync(statePath);
      log(`Cleared ralph state`);
    } catch (err) {
      log(`Failed to clear ralph state`, { error: String(err) });
    }
  }
}

export function createRalphState(
  sessionId: string,
  prompt: string,
  maxIterations: number = 50,
  prdMode: boolean = true
): RalphState {
  return {
    active: true,
    iteration: 0,
    max_iterations: maxIterations,
    completion_promise: "<promise>TASK_COMPLETE</promise>",
    started_at: new Date().toISOString(),
    prompt,
    session_id: sessionId,
    prd_mode: prdMode,
    current_story_id: null,
    last_activity_at: new Date().toISOString(),
  };
}

export function updateRalphStateIteration(
  projectDir: string,
  state: RalphState,
  currentStoryId?: string
): void {
  state.iteration++;
  state.last_activity_at = new Date().toISOString();
  if (currentStoryId !== undefined) {
    state.current_story_id = currentStoryId;
  }
  writeRalphState(projectDir, state);
}

export function markRalphStateComplete(projectDir: string, state: RalphState): void {
  state.active = false;
  state.last_activity_at = new Date().toISOString();
  writeRalphState(projectDir, state);
}
