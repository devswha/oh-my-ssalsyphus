import { execSync } from "child_process";

function isOpenCodeInstalled(): boolean {
  try {
    execSync("which opencode", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function isE2EEnabled(): boolean {
  return process.env.OMCO_E2E_ENABLED === "true";
}

function isLLMEnabled(): boolean {
  return process.env.OMCO_E2E_LLM === "true";
}

// These are MODULE-LEVEL CONSTANTS evaluated at import time.
// They MUST be synchronous for describe.skipIf() to work.
export const canRunServerTests: boolean = isOpenCodeInstalled() && isE2EEnabled();
export const canRunLLMTests: boolean = canRunServerTests && isLLMEnabled();

// Provider credential check is ASYNC and must be done inside beforeAll.
// If credentials are missing, tests within the describe block should be skipped
// via test-level conditionals or by setting a flag.
export { isOpenCodeInstalled, isE2EEnabled, isLLMEnabled };
