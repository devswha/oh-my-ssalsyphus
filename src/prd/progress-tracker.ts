import * as fs from "fs";
import * as path from "path";
import { log } from "../shared/logger";
import type { UserStory } from "./prd-manager";

const PROGRESS_FILENAME = "progress.txt";

function getSisyphusDir(projectDir: string): string {
  return path.join(projectDir, ".sisyphus");
}

function getProgressPath(projectDir: string): string {
  return path.join(getSisyphusDir(projectDir), PROGRESS_FILENAME);
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export interface IterationLog {
  iteration: number;
  timestamp: string;
  storyId: string;
  storyTitle: string;
  implementation: string[];
  filesChanged: string[];
  learnings: string[];
}

export interface ProgressData {
  startedAt: string;
  task: string;
  patterns: string[];
  iterations: IterationLog[];
}

export function initializeProgress(projectDir: string, task: string): void {
  const dir = getSisyphusDir(projectDir);
  ensureDir(dir);
  const progressPath = getProgressPath(projectDir);

  if (fs.existsSync(progressPath)) {
    log(`Progress file already exists, skipping initialization`);
    return;
  }

  const content = `# Ralph Progress Log
Started: ${new Date().toISOString()}
Task: ${task}

## Codebase Patterns
(No patterns discovered yet)

---

## Iterations

`;

  fs.writeFileSync(progressPath, content);
  log(`Initialized progress file`);
}

export function readProgress(projectDir: string): string | null {
  const progressPath = getProgressPath(projectDir);

  if (fs.existsSync(progressPath)) {
    try {
      return fs.readFileSync(progressPath, "utf-8");
    } catch (err) {
      log(`Failed to read progress file`, { error: String(err) });
    }
  }

  return null;
}

export function appendIteration(
  projectDir: string,
  iteration: number,
  story: UserStory,
  implementation: string[],
  filesChanged: string[],
  learnings: string[]
): void {
  const progressPath = getProgressPath(projectDir);

  if (!fs.existsSync(progressPath)) {
    initializeProgress(projectDir, "Task in progress");
  }

  const timestamp = new Date().toISOString();
  const iterationEntry = `
## Iteration ${iteration} (${timestamp})
Story: ${story.id} - ${story.title}

### Implementation
${implementation.map((i) => `- ${i}`).join("\n")}

### Files Changed
${filesChanged.map((f) => `- ${f}`).join("\n")}

### Learnings
${learnings.length > 0 ? learnings.map((l) => `- ${l}`).join("\n") : "(None recorded)"}

---
`;

  try {
    fs.appendFileSync(progressPath, iterationEntry);
    log(`Appended iteration ${iteration} to progress`);
  } catch (err) {
    log(`Failed to append to progress file`, { error: String(err) });
  }
}

export function addPattern(projectDir: string, pattern: string): void {
  const progressPath = getProgressPath(projectDir);

  if (!fs.existsSync(progressPath)) {
    initializeProgress(projectDir, "Task in progress");
  }

  try {
    let content = fs.readFileSync(progressPath, "utf-8");

    // Find the patterns section and add the new pattern
    const patternsHeader = "## Codebase Patterns";
    const patternsIdx = content.indexOf(patternsHeader);

    if (patternsIdx === -1) {
      // If patterns section doesn't exist, add it
      content = content.replace(
        "---\n\n## Iterations",
        `## Codebase Patterns\n- ${pattern}\n\n---\n\n## Iterations`
      );
    } else {
      // Find the end of patterns section (next ## or ---)
      const sectionEnd = content.indexOf("---", patternsIdx);
      const patternsSection = content.substring(patternsIdx, sectionEnd);

      // Check if pattern already exists
      if (!patternsSection.includes(pattern)) {
        // Replace placeholder if present
        if (patternsSection.includes("(No patterns discovered yet)")) {
          content = content.replace(
            "(No patterns discovered yet)",
            `- ${pattern}`
          );
        } else {
          // Add new pattern before the ---
          content = content.replace(
            content.substring(patternsIdx, sectionEnd),
            `${patternsSection}- ${pattern}\n\n`
          );
        }
      }
    }

    fs.writeFileSync(progressPath, content);
    log(`Added pattern to progress`);
  } catch (err) {
    log(`Failed to add pattern`, { error: String(err) });
  }
}

export function getProgressSummary(projectDir: string): string {
  const content = readProgress(projectDir);
  if (!content) {
    return "No progress log found.";
  }

  // Extract key information
  const iterations = content.match(/## Iteration \d+/g) || [];
  const patterns = content.match(/^- .+$/gm) || [];

  // Find the most recent iteration
  const lastIterationMatch = content.match(
    /## Iteration (\d+) \([^)]+\)\nStory: ([^\n]+)/
  );

  let summary = `Progress Summary:\n`;
  summary += `- Total iterations: ${iterations.length}\n`;
  summary += `- Patterns discovered: ${patterns.length}\n`;

  if (lastIterationMatch) {
    summary += `- Last iteration: ${lastIterationMatch[1]} (${lastIterationMatch[2]})\n`;
  }

  return summary;
}

export function formatProgressContext(projectDir: string): string {
  const summary = getProgressSummary(projectDir);
  const content = readProgress(projectDir);

  if (!content) {
    return "No progress history available.";
  }

  // Extract patterns section for context injection
  const patternsMatch = content.match(
    /## Codebase Patterns\n([\s\S]*?)(?=\n---|\n## Iterations)/
  );
  const patterns = patternsMatch ? patternsMatch[1].trim() : "(None)";

  return `## Progress Context

${summary}

### Discovered Patterns
${patterns}

---

Remember to:
1. Update progress.txt after completing each story
2. Record any new patterns you discover
3. Note files changed for future reference`;
}
