/**
 * Skill Injector Hook
 *
 * Automatically detects context and injects skill prompts.
 */

import type { PluginInput } from "@opencode-ai/plugin";
import { log } from "../shared/logger";

// Frontend UI/UX skill prompt
const FRONTEND_SKILL_PROMPT = `## Frontend UI/UX Guidelines (Auto-Activated)

You are a designer who learned to code. You see what pure developers miss—spacing, color harmony, micro-interactions.

### Design Process

Before coding, commit to a **BOLD aesthetic direction**:
1. **Purpose**: What problem does this solve?
2. **Tone**: Pick an extreme (minimal, maximalist, retro-futuristic, organic, luxury, playful)
3. **Differentiation**: What's the ONE thing someone will remember?

### Aesthetic Guidelines

**Typography**: Choose distinctive fonts. AVOID: Arial, Inter, Roboto, system fonts.
**Color**: Commit to a cohesive palette. AVOID: purple gradients on white (AI slop).
**Motion**: Focus on high-impact moments. Use CSS-only where possible.
**Spatial Composition**: Unexpected layouts. Asymmetry. Overlap. Diagonal flow.

### Anti-Patterns (NEVER)
- Generic fonts (Inter, Roboto, Arial)
- Cliched color schemes (purple gradients on white)
- Predictable layouts
- Cookie-cutter design
`;

// Git master skill prompt
const GIT_SKILL_PROMPT = `## Git Master Guidelines (Auto-Activated)

You are a Git expert. Core principle: **Multiple Commits by Default**

### Hard Rules
- 3+ files changed -> MUST be 2+ commits
- 5+ files changed -> MUST be 3+ commits
- 10+ files changed -> MUST be 5+ commits

### Style Detection (First Step)

Before committing, analyze the last 30 commits:
\`\`\`bash
git log -30 --oneline
\`\`\`

Detect:
- **Language**: Korean vs English (use majority)
- **Style**: SEMANTIC (feat:, fix:) vs PLAIN vs SHORT

### Commit Splitting Rules

| Criterion | Action |
|-----------|--------|
| Different directories/modules | SPLIT |
| Different component types | SPLIT |
| Can be reverted independently | SPLIT |
| Different concerns (UI/logic/config/test) | SPLIT |

### Rebase Safety
- NEVER rebase main/master
- Use \`--force-with-lease\` (never \`--force\`)
`;

// Keywords for detection
const FRONTEND_KEYWORDS = [
  "ui", "component", "frontend", "css", "styling", "layout", "design",
  "button", "form", "modal", "tailwind", "react", "vue", "angular",
  "styled", "animation", "responsive", "mobile", "desktop", "theme",
  "color", "font", "typography", "spacing", "margin", "padding",
  "gradient", "shadow", "border", "hover", "focus", "dark mode", "light mode"
];

const GIT_KEYWORDS = [
  "commit", "git", "push", "pull", "branch", "merge", "rebase",
  "pr", "pull request", "cherry-pick", "stash", "diff", "log",
  "checkout", "reset", "blame", "bisect", "amend", "squash",
  "history", "remote", "origin"
];

export interface SkillInjection {
  skill: "frontend-ui-ux" | "git-master" | null;
  prompt: string | null;
}

export function createSkillInjector(_ctx: PluginInput) {
  return {
    /**
     * Detect context and return appropriate skill injection
     */
    detectAndInject(sessionID: string, messageText: string): SkillInjection {
      const lowerText = messageText.toLowerCase();

      // Check for frontend/UI context
      const hasFrontendContext = FRONTEND_KEYWORDS.some(keyword =>
        lowerText.includes(keyword)
      );

      // Check for git context
      const hasGitContext = GIT_KEYWORDS.some(keyword =>
        lowerText.includes(keyword)
      );

      // Priority: Git > Frontend (git is more specific)
      if (hasGitContext) {
        log("[skill-injector] Detected git context", { sessionID });
        return {
          skill: "git-master",
          prompt: GIT_SKILL_PROMPT,
        };
      }

      if (hasFrontendContext) {
        log("[skill-injector] Detected frontend context", { sessionID });
        return {
          skill: "frontend-ui-ux",
          prompt: FRONTEND_SKILL_PROMPT,
        };
      }

      return { skill: null, prompt: null };
    },
  };
}
