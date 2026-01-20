import * as fs from "fs";
import * as path from "path";
import { log } from "../shared/logger";

export interface UserStory {
  id: string;
  title: string;
  description?: string;
  acceptanceCriteria: string[];
  priority: number;
  passes: boolean;
  notes?: string;
  completedAt?: string;
}

export interface PRD {
  project: string;
  branchName?: string;
  description: string;
  userStories: UserStory[];
  createdAt?: string;
  updatedAt?: string;
}

const PRD_FILENAME = "prd.json";

function getSisyphusDir(projectDir: string): string {
  return path.join(projectDir, ".sisyphus");
}

function getPrdPath(projectDir: string): string {
  return path.join(getSisyphusDir(projectDir), PRD_FILENAME);
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function readPrd(projectDir: string): PRD | null {
  const prdPath = getPrdPath(projectDir);

  if (fs.existsSync(prdPath)) {
    try {
      const content = fs.readFileSync(prdPath, "utf-8");
      const prd = JSON.parse(content) as PRD;
      log(`Read PRD`, {
        project: prd.project,
        stories: prd.userStories.length,
      });
      return prd;
    } catch (err) {
      log(`Failed to read PRD`, { error: String(err) });
    }
  }

  return null;
}

export function writePrd(projectDir: string, prd: PRD): void {
  const dir = getSisyphusDir(projectDir);
  ensureDir(dir);
  const prdPath = getPrdPath(projectDir);

  prd.updatedAt = new Date().toISOString();
  if (!prd.createdAt) {
    prd.createdAt = prd.updatedAt;
  }

  try {
    fs.writeFileSync(prdPath, JSON.stringify(prd, null, 2));
    log(`Wrote PRD`, { project: prd.project, stories: prd.userStories.length });
  } catch (err) {
    log(`Failed to write PRD`, { error: String(err) });
  }
}

export function createPrdFromTask(task: string, projectName?: string): PRD {
  return {
    project: projectName ?? "Ralph Loop Task",
    description: task,
    userStories: [
      {
        id: "US-001",
        title: "Complete the requested task",
        description: task,
        acceptanceCriteria: [
          "Task is fully implemented",
          "All tests pass (if applicable)",
          "No errors or warnings",
          "Code is production-ready",
        ],
        priority: 1,
        passes: false,
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function getIncompleteStories(prd: PRD): UserStory[] {
  return prd.userStories
    .filter((s) => !s.passes)
    .sort((a, b) => a.priority - b.priority);
}

export function getCompletedStories(prd: PRD): UserStory[] {
  return prd.userStories.filter((s) => s.passes);
}

export function getNextStory(prd: PRD): UserStory | null {
  const incomplete = getIncompleteStories(prd);
  return incomplete.length > 0 ? incomplete[0] : null;
}

export function markStoryComplete(
  projectDir: string,
  storyId: string,
  notes?: string
): boolean {
  const prd = readPrd(projectDir);
  if (!prd) return false;

  const story = prd.userStories.find((s) => s.id === storyId);
  if (!story) return false;

  story.passes = true;
  story.completedAt = new Date().toISOString();
  if (notes) {
    story.notes = notes;
  }

  writePrd(projectDir, prd);
  log(`Marked story ${storyId} as complete`);
  return true;
}

export function addStory(projectDir: string, story: UserStory): boolean {
  const prd = readPrd(projectDir);
  if (!prd) return false;

  // Ensure unique ID
  const existingIds = new Set(prd.userStories.map((s) => s.id));
  if (existingIds.has(story.id)) {
    // Generate new ID
    let counter = prd.userStories.length + 1;
    while (existingIds.has(`US-${String(counter).padStart(3, "0")}`)) {
      counter++;
    }
    story.id = `US-${String(counter).padStart(3, "0")}`;
  }

  prd.userStories.push(story);
  writePrd(projectDir, prd);
  log(`Added story ${story.id}: ${story.title}`);
  return true;
}

export function getPrdStatus(prd: PRD): {
  total: number;
  completed: number;
  remaining: number;
  percentComplete: number;
} {
  const completed = prd.userStories.filter((s) => s.passes).length;
  const total = prd.userStories.length;
  return {
    total,
    completed,
    remaining: total - completed,
    percentComplete: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

export function formatPrdStatusMessage(prd: PRD): string {
  const status = getPrdStatus(prd);
  const nextStory = getNextStory(prd);

  let message = `PRD Status: ${status.completed}/${status.total} stories complete (${status.percentComplete}%)`;

  if (nextStory) {
    message += `\nNext story: ${nextStory.id} - ${nextStory.title}`;
    if (nextStory.acceptanceCriteria.length > 0) {
      message += `\nAcceptance criteria:`;
      nextStory.acceptanceCriteria.forEach((c, i) => {
        message += `\n  ${i + 1}. ${c}`;
      });
    }
  }

  return message;
}

export function generateStoryContextPrompt(prd: PRD): string {
  const nextStory = getNextStory(prd);
  if (!nextStory) {
    return "All stories are complete! Verify everything works and output the completion promise.";
  }

  const status = getPrdStatus(prd);

  return `## Current PRD Context

**Project**: ${prd.project}
**Progress**: ${status.completed}/${status.total} stories (${status.percentComplete}%)

### Current Story: ${nextStory.id} - ${nextStory.title}

${nextStory.description || ""}

**Acceptance Criteria**:
${nextStory.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join("\n")}

---

When this story is complete:
1. Update .sisyphus/prd.json to set "passes": true for ${nextStory.id}
2. Add any learnings to .sisyphus/progress.txt
3. Move to the next story or output completion promise if all done`;
}
