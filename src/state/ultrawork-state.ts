import * as fs from "fs";
import * as path from "path";
import { log } from "../shared/logger";

export interface UltraworkState {
  active: boolean;
  started_at: string;
  original_prompt: string;
  session_id: string;
  reinforcement_count: number;
  last_checked_at: string;
}

const STATE_FILENAME = "ultrawork-state.json";
const GLOBAL_STATE_DIR = path.join(process.env.HOME || "", ".opencode");

function getOmcDir(projectDir: string): string {
  return path.join(projectDir, ".omc");
}

function getStatePath(projectDir: string): string {
  return path.join(getOmcDir(projectDir), STATE_FILENAME);
}

function getGlobalStatePath(): string {
  return path.join(GLOBAL_STATE_DIR, STATE_FILENAME);
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function readUltraworkState(projectDir: string): UltraworkState | null {
  const localPath = getStatePath(projectDir);
  const globalPath = getGlobalStatePath();

  // Try local first, then global
  for (const statePath of [localPath, globalPath]) {
    if (fs.existsSync(statePath)) {
      try {
        const content = fs.readFileSync(statePath, "utf-8");
        const state = JSON.parse(content) as UltraworkState;
        log(`Read ultrawork state from ${statePath}`, { active: state.active });
        return state;
      } catch (err) {
        log(`Failed to read ultrawork state from ${statePath}`, { error: String(err) });
      }
    }
  }

  return null;
}

export function writeUltraworkState(
  projectDir: string,
  state: UltraworkState,
  writeGlobal: boolean = false
): void {
  // Write to local project state
  const localDir = getOmcDir(projectDir);
  ensureDir(localDir);
  const localPath = getStatePath(projectDir);

  try {
    fs.writeFileSync(localPath, JSON.stringify(state, null, 2));
    log(`Wrote ultrawork state to ${localPath}`);
  } catch (err) {
    log(`Failed to write ultrawork state to ${localPath}`, { error: String(err) });
  }

  // Optionally write to global state for cross-session persistence
  if (writeGlobal) {
    ensureDir(GLOBAL_STATE_DIR);
    const globalPath = getGlobalStatePath();
    try {
      fs.writeFileSync(globalPath, JSON.stringify(state, null, 2));
      log(`Wrote ultrawork state to global ${globalPath}`);
    } catch (err) {
      log(`Failed to write global ultrawork state`, { error: String(err) });
    }
  }
}

export function clearUltraworkState(projectDir: string, clearGlobal: boolean = false): void {
  const localPath = getStatePath(projectDir);
  const globalPath = getGlobalStatePath();

  if (fs.existsSync(localPath)) {
    try {
      fs.unlinkSync(localPath);
      log(`Cleared ultrawork state from ${localPath}`);
    } catch (err) {
      log(`Failed to clear ultrawork state`, { error: String(err) });
    }
  }

  if (clearGlobal && fs.existsSync(globalPath)) {
    try {
      fs.unlinkSync(globalPath);
      log(`Cleared global ultrawork state`);
    } catch (err) {
      log(`Failed to clear global ultrawork state`, { error: String(err) });
    }
  }
}

export function createUltraworkState(
  sessionId: string,
  originalPrompt: string
): UltraworkState {
  return {
    active: true,
    started_at: new Date().toISOString(),
    original_prompt: originalPrompt,
    session_id: sessionId,
    reinforcement_count: 0,
    last_checked_at: new Date().toISOString(),
  };
}

export function updateUltraworkStateChecked(
  projectDir: string,
  state: UltraworkState
): void {
  state.last_checked_at = new Date().toISOString();
  state.reinforcement_count++;
  writeUltraworkState(projectDir, state);
}
