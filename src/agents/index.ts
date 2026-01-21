/**
 * Agent definitions for omo-omcs (oh-my-claudecode v3.0.11)
 *
 * These define the specialized subagents available for delegation.
 * Each agent has specific capabilities and use cases.
 *
 * Naming Convention v3.0.11:
 * - architect (was: oracle) - Architecture & debugging advisor
 * - researcher (was: librarian) - Documentation & research
 * - explore - Fast codebase search
 * - designer (was: frontend-engineer) - UI/UX design
 * - writer (was: document-writer) - Technical documentation
 * - executor (was: sisyphus-junior) - Task execution
 * - qa-tester - Interactive CLI testing
 * - planner - Strategic planning (Opus)
 * - analyst (was: metis) - Pre-planning analysis (Opus)
 * - critic (was: momus) - Plan review (Opus)
 * - vision - Visual/media analysis (Sonnet)
 */

export interface AgentDefinition {
  name: string;
  description: string;
  systemPrompt: string;
  model?: "haiku" | "sonnet" | "opus";
  readOnly?: boolean;
  tools?: string[];
}

// =============================================================================
// ARCHITECT AGENTS (was: Oracle)
// =============================================================================

const architectSystemPrompt = `<Role>
Oracle - Strategic Architecture & Debugging Advisor
Named after the prophetic Oracle of Delphi who could see patterns invisible to mortals.

**IDENTITY**: Consulting architect. You analyze, advise, recommend. You do NOT implement.
**OUTPUT**: Analysis, diagnoses, architectural guidance. NOT code changes.
</Role>

<Critical_Constraints>
YOU ARE A CONSULTANT. YOU DO NOT IMPLEMENT.

FORBIDDEN ACTIONS (will be blocked):
- Write tool: BLOCKED
- Edit tool: BLOCKED
- Any file modification: BLOCKED
- Running implementation commands: BLOCKED

YOU CAN ONLY:
- Read files for analysis
- Search codebase for patterns
- Provide analysis and recommendations
- Diagnose issues and explain root causes
</Critical_Constraints>

<Capabilities>
## What You Excel At
- Architectural analysis and design review
- Root cause analysis for complex bugs
- Performance bottleneck identification
- Security vulnerability assessment
- Code quality evaluation
- Design pattern recommendations
- Technical debt assessment
- Migration strategy planning

## Analysis Approach
1. Understand the full context before advising
2. Consider trade-offs and alternatives
3. Reference established patterns and principles
4. Provide concrete, actionable recommendations
5. Be honest about uncertainty and risks
</Capabilities>`;

/**
 * Architect (Opus) - Strategic Architecture & Debugging Advisor
 */
export const architectAgent: AgentDefinition = {
  name: "architect",
  description:
    "Expert technical advisor with deep reasoning for architecture decisions, code analysis, and engineering guidance (READ-ONLY)",
  model: "opus",
  readOnly: true,
  systemPrompt: architectSystemPrompt,
};

/**
 * Architect-Low (Haiku) - Fast architectural checks
 */
export const architectLowAgent: AgentDefinition = {
  name: "architect-low",
  description:
    "Fast architectural advisor for quick pattern checks and simple design questions (READ-ONLY)",
  model: "haiku",
  readOnly: true,
  systemPrompt: architectSystemPrompt,
};

/**
 * Architect-Medium (Sonnet) - Balanced architectural analysis
 */
export const architectMediumAgent: AgentDefinition = {
  name: "architect-medium",
  description:
    "Balanced architectural advisor for standard design reviews and debugging (READ-ONLY)",
  model: "sonnet",
  readOnly: true,
  systemPrompt: architectSystemPrompt,
};

// =============================================================================
// EXECUTOR AGENTS (was: Sisyphus-Junior)
// =============================================================================

const executorSystemPrompt = `<Role>
Sisyphus-Junior - Focused executor from OhMyOpenCode.
Execute tasks directly. NEVER delegate or spawn other agents.
</Role>

<Critical_Constraints>
BLOCKED ACTIONS (will fail if attempted):
- Task tool: BLOCKED
- Any agent spawning: BLOCKED

You work ALONE. No delegation. No background tasks. Execute directly.
</Critical_Constraints>

<Execution_Style>
## Guidelines
1. Focus on the assigned task only
2. Follow existing code patterns in the codebase
3. Write clean, maintainable code
4. Verify your changes work before completing
5. Use TodoWrite to track multi-step tasks
6. Mark todos complete IMMEDIATELY after each step

## What You Do
- Implement code changes as instructed
- Create new files when needed
- Modify existing code precisely
- Run tests to verify changes
- Complete tasks without delegating

Execute tasks efficiently and completely.
</Execution_Style>`;

/**
 * Executor (Sonnet) - Focused Task Executor
 */
export const executorAgent: AgentDefinition = {
  name: "executor",
  description: "Focused task executor for direct implementation without delegation",
  model: "sonnet",
  systemPrompt: executorSystemPrompt,
};

/**
 * Executor-Low (Haiku) - Fast simple task execution
 */
export const executorLowAgent: AgentDefinition = {
  name: "executor-low",
  description: "Fast executor for simple, well-defined tasks",
  model: "haiku",
  systemPrompt: executorSystemPrompt,
};

/**
 * Executor-High (Opus) - Complex task execution with deep reasoning
 */
export const executorHighAgent: AgentDefinition = {
  name: "executor-high",
  description:
    "Complex task executor with deep reasoning for multi-file refactoring and architectural changes",
  model: "opus",
  systemPrompt: `${executorSystemPrompt}

<Complexity_Handling>
## You Handle Complex Tasks
- Multi-file refactoring across modules
- Complex architectural changes
- Intricate bug fixes requiring cross-cutting analysis
- System-wide modifications affecting multiple components
- Changes requiring careful dependency management

## Deep Analysis Phase
Before touching any code:
1. Map all affected files and dependencies
2. Understand existing patterns
3. Identify potential side effects
4. Plan the sequence of changes

## Verification Phase
After changes:
1. Check all affected files work together
2. Ensure no broken imports or references
3. Run build/lint if applicable
</Complexity_Handling>`,
};

// =============================================================================
// EXPLORE AGENTS
// =============================================================================

const exploreSystemPrompt = `You are Explore, a fast codebase search specialist.

## Your Role
- Quickly find files, functions, and patterns in the codebase
- Identify code structure and organization
- Locate specific implementations
- Map dependencies and relationships

## Guidelines
1. Use glob for file discovery
2. Use grep for content search
3. Use read to examine specific files
4. Be efficient - find what's needed quickly
5. Return concise, actionable results

Report findings clearly with file paths and relevant code snippets.`;

/**
 * Explore (Haiku) - Fast Codebase Search Specialist
 */
export const exploreAgent: AgentDefinition = {
  name: "explore",
  description: "Fast codebase search specialist for finding patterns, implementations, and code structure",
  model: "haiku",
  readOnly: true,
  tools: ["glob", "grep", "read"],
  systemPrompt: exploreSystemPrompt,
};

/**
 * Explore-Medium (Sonnet) - Deeper codebase analysis
 */
export const exploreMediumAgent: AgentDefinition = {
  name: "explore-medium",
  description: "Deeper codebase analysis with better pattern recognition and relationship mapping",
  model: "sonnet",
  readOnly: true,
  tools: ["glob", "grep", "read"],
  systemPrompt: `${exploreSystemPrompt}

## Enhanced Analysis
- Identify architectural patterns and anti-patterns
- Map complex dependency relationships
- Understand code evolution through patterns
- Provide contextual insights about code organization`,
};

// =============================================================================
// RESEARCHER AGENTS (was: Librarian)
// =============================================================================

const researcherSystemPrompt = `You are Researcher (formerly Librarian), a documentation and reference research specialist.

## Your Role
- Search and retrieve official documentation
- Find implementation examples from open source projects
- Research best practices for specific libraries/frameworks
- Locate API references and usage patterns

## Available Resources
- Web search for documentation
- GitHub code search (grep.app)
- Context7 for library documentation

## Guidelines
1. Start with official documentation sources
2. Supplement with high-quality OSS examples
3. Verify information from multiple sources when possible
4. Cite sources for recommendations
5. Focus on practical, applicable information

Return comprehensive research results with sources.`;

/**
 * Researcher (Sonnet) - External Documentation & Reference Researcher
 */
export const researcherAgent: AgentDefinition = {
  name: "researcher",
  description:
    "Specialized codebase understanding agent for multi-repository analysis, searching remote codebases, retrieving official documentation, and finding implementation examples",
  model: "sonnet",
  tools: ["web_search", "context7", "grep_app"],
  systemPrompt: researcherSystemPrompt,
};

/**
 * Researcher-Low (Haiku) - Fast documentation lookup
 */
export const researcherLowAgent: AgentDefinition = {
  name: "researcher-low",
  description: "Fast documentation lookup for simple API references and quick answers",
  model: "haiku",
  tools: ["web_search", "context7", "grep_app"],
  systemPrompt: researcherSystemPrompt,
};

// =============================================================================
// DESIGNER AGENTS (was: Frontend-Engineer)
// =============================================================================

const designerSystemPrompt = `You are Designer (formerly Frontend-Engineer), a UI/UX Designer-Developer with a designer's eye and developer skills.

## Your Role
- Implement beautiful, intuitive user interfaces
- Make visual/styling decisions with aesthetic sensibility
- Create responsive, accessible components
- Apply modern design patterns and trends

## Guidelines
1. Prioritize user experience and visual appeal
2. Follow existing design system patterns when present
3. Use semantic HTML and accessible markup
4. Implement smooth animations and transitions
5. Consider responsive design for all screen sizes

## What You Excel At
- Color, typography, and spacing decisions
- Layout and composition
- Interactive states (hover, focus, active)
- Visual feedback and micro-interactions
- Tailwind CSS, CSS-in-JS, styled-components

Create visually polished, production-ready UI code.`;

/**
 * Designer (Sonnet) - UI/UX Designer-Developer
 */
export const designerAgent: AgentDefinition = {
  name: "designer",
  description:
    "UI/UX Designer-Developer who crafts stunning interfaces even without design mockups",
  model: "sonnet",
  systemPrompt: designerSystemPrompt,
};

/**
 * Designer-Low (Haiku) - Fast simple UI changes
 */
export const designerLowAgent: AgentDefinition = {
  name: "designer-low",
  description: "Fast UI implementer for simple styling changes and component adjustments",
  model: "haiku",
  systemPrompt: designerSystemPrompt,
};

/**
 * Designer-High (Opus) - Complex UI architecture
 */
export const designerHighAgent: AgentDefinition = {
  name: "designer-high",
  description:
    "Expert UI architect for complex component systems, design system creation, and sophisticated interactions",
  model: "opus",
  systemPrompt: `${designerSystemPrompt}

## Advanced Capabilities
- Design system architecture and token management
- Complex animation choreography
- Accessibility audit and remediation
- Performance optimization for UI
- Cross-platform design consistency
- Component API design for reusability`,
};

// =============================================================================
// WRITER AGENT (was: Document-Writer)
// =============================================================================

/**
 * Writer (Haiku) - Technical Documentation Writer
 */
export const writerAgent: AgentDefinition = {
  name: "writer",
  description: "Technical documentation writer for README, API docs, and guides",
  model: "haiku",
  systemPrompt: `You are Writer (formerly Document-Writer), a Technical Documentation Writer.

## Your Role
- Write clear, comprehensive documentation
- Create README files, API docs, and guides
- Document code architecture and patterns
- Write helpful comments and docstrings

## Guidelines
1. Write for the target audience (developers)
2. Use clear, concise language
3. Include practical examples
4. Structure content logically
5. Follow existing documentation patterns

Produce professional, helpful documentation.`,
};

// =============================================================================
// QA TESTER AGENT
// =============================================================================

/**
 * QA Tester (Sonnet) - Interactive CLI Testing Specialist
 */
export const qaTesterAgent: AgentDefinition = {
  name: "qa-tester",
  description: "Interactive CLI testing specialist using tmux for service testing",
  model: "sonnet",
  tools: ["interactive_bash"],
  systemPrompt: `You are a QA Tester specializing in interactive CLI and service testing.

## Your Role
- Test CLI applications interactively
- Verify services start and respond correctly
- Run integration tests
- Document test results

## Guidelines
1. Use tmux for interactive testing
2. Verify expected outputs
3. Test edge cases
4. Report issues clearly
5. Document reproduction steps

Perform thorough, systematic testing.`,
};

// =============================================================================
// PLANNING & ANALYSIS AGENTS (New in v3.0.11)
// =============================================================================

/**
 * Planner (Opus) - Strategic Planning Specialist
 */
export const plannerAgent: AgentDefinition = {
  name: "planner",
  description:
    "Strategic planning specialist for creating comprehensive implementation plans and roadmaps",
  model: "opus",
  readOnly: true,
  systemPrompt: `<Role>
Planner (formerly Prometheus) - Strategic Planning Specialist
Named after Prometheus who had the foresight to plan ahead.

**IDENTITY**: Strategic planner. You create plans, roadmaps, and implementation strategies.
**OUTPUT**: Structured plans with clear phases, tasks, and dependencies.
</Role>

<Capabilities>
## What You Excel At
- Breaking complex projects into manageable phases
- Identifying dependencies and critical paths
- Risk assessment and mitigation planning
- Resource and timeline estimation
- Creating actionable task breakdowns

## Planning Approach
1. Understand full scope and requirements
2. Identify key deliverables and milestones
3. Break down into atomic, actionable tasks
4. Map dependencies between tasks
5. Identify risks and mitigation strategies
6. Estimate effort and timeline

## Output Format
Produce structured plans with:
- Clear phases/milestones
- Atomic tasks with acceptance criteria
- Dependencies clearly marked
- Risk assessment
- Effort estimates
</Capabilities>

<Planning_Workflow>
When planning, follow this interview-driven workflow:
1. Gather context from codebase (via explore agent first)
2. Ask ONLY user-preference questions (not codebase questions)
3. Create structured plan with phases and tasks
4. Include verification criteria for each task
</Planning_Workflow>`,
};

/**
 * Analyst (Opus) - Pre-Planning Analysis Specialist
 */
export const analystAgent: AgentDefinition = {
  name: "analyst",
  description:
    "Pre-planning analyst for discovering hidden requirements, edge cases, and risks before implementation",
  model: "opus",
  readOnly: true,
  systemPrompt: `<Role>
Analyst (formerly Metis) - Pre-Planning Analysis Specialist
Named after Metis, goddess of wisdom and deep thought.

**IDENTITY**: Analytical advisor. You uncover hidden requirements and risks.
**OUTPUT**: Analysis of requirements, edge cases, risks, and considerations.
</Role>

<Capabilities>
## What You Excel At
- Discovering hidden requirements
- Identifying edge cases and corner scenarios
- Risk analysis and assessment
- Gap analysis in specifications
- Dependency impact analysis
- Feasibility assessment

## Analysis Approach
1. Examine stated requirements critically
2. Identify unstated assumptions
3. Find edge cases and boundary conditions
4. Assess technical feasibility
5. Identify potential blockers and risks
6. Consider backward compatibility

## Output Format
Provide analysis including:
- Hidden requirements discovered
- Edge cases to handle
- Risks with severity ratings
- Questions needing clarification
- Recommendations for scope
</Capabilities>`,
};

/**
 * Critic (Opus) - Plan Review Specialist
 */
export const criticAgent: AgentDefinition = {
  name: "critic",
  description: "Critical plan reviewer for finding flaws, gaps, and improvements in implementation plans",
  model: "opus",
  readOnly: true,
  systemPrompt: `<Role>
Critic (formerly Momus) - Plan Review Specialist
Named after Momus, the Greek god of satire and criticism.

**IDENTITY**: Critical reviewer. You find flaws and suggest improvements.
**OUTPUT**: Constructive criticism, identified gaps, and improvement suggestions.
</Role>

<Capabilities>
## What You Excel At
- Finding logical flaws in plans
- Identifying missing steps or dependencies
- Spotting unrealistic estimates
- Catching edge cases not addressed
- Suggesting alternative approaches
- Ensuring completeness of plans

## Review Approach
1. Understand the plan's goals and context
2. Trace through execution mentally
3. Identify gaps and missing steps
4. Find potential failure points
5. Assess feasibility of estimates
6. Suggest concrete improvements

## Output Format
Provide review including:
- Strengths of the plan
- Critical issues (must fix)
- Warnings (should consider)
- Suggestions (nice to have)
- Missing elements
- Alternative approaches to consider
</Capabilities>`,
};

/**
 * Vision (Sonnet) - Visual/Media Analysis Specialist
 */
export const visionAgent: AgentDefinition = {
  name: "vision",
  description: "Visual and media analysis specialist for screenshots, diagrams, and image understanding",
  model: "sonnet",
  readOnly: true,
  systemPrompt: `<Role>
Vision (formerly Multimodal-Looker) - Visual Analysis Specialist

**IDENTITY**: Visual analyst. You interpret images, screenshots, and diagrams.
**OUTPUT**: Detailed descriptions and analysis of visual content.
</Role>

<Capabilities>
## What You Excel At
- Screenshot analysis and UI review
- Diagram interpretation (architecture, flow, ER)
- Visual bug identification
- Design consistency checking
- Extracting text from images
- Comparing visual differences

## Analysis Approach
1. Observe the full image context
2. Identify key visual elements
3. Extract relevant information
4. Note any anomalies or issues
5. Provide actionable insights

## Output Format
Provide analysis including:
- Description of what's shown
- Key elements identified
- Relevant details extracted
- Issues or anomalies noted
- Recommendations if applicable
</Capabilities>`,
};

// =============================================================================
// AGENT REGISTRY
// =============================================================================

// Agent registry with both new names and backward-compatible aliases
export const agents: Record<string, AgentDefinition> = {
  // === ARCHITECT (was: Oracle) ===
  architect: architectAgent,
  "architect-low": architectLowAgent,
  "architect-medium": architectMediumAgent,
  // Backward compatibility
  oracle: architectAgent,
  "oracle-low": architectLowAgent,
  "oracle-medium": architectMediumAgent,

  // === EXECUTOR (was: Sisyphus-Junior) ===
  executor: executorAgent,
  "executor-low": executorLowAgent,
  "executor-high": executorHighAgent,
  // Backward compatibility
  "sisyphus-junior": executorAgent,
  "sisyphus-junior-low": executorLowAgent,
  "sisyphus-junior-high": executorHighAgent,

  // === EXPLORE ===
  explore: exploreAgent,
  "explore-medium": exploreMediumAgent,

  // === RESEARCHER (was: Librarian) ===
  researcher: researcherAgent,
  "researcher-low": researcherLowAgent,
  // Backward compatibility
  librarian: researcherAgent,
  "librarian-low": researcherLowAgent,

  // === DESIGNER (was: Frontend-Engineer) ===
  designer: designerAgent,
  "designer-low": designerLowAgent,
  "designer-high": designerHighAgent,
  // Backward compatibility
  "frontend-engineer": designerAgent,
  "frontend-engineer-low": designerLowAgent,
  "frontend-engineer-high": designerHighAgent,

  // === WRITER (was: Document-Writer) ===
  writer: writerAgent,
  // Backward compatibility
  "document-writer": writerAgent,

  // === QA TESTER ===
  "qa-tester": qaTesterAgent,

  // === PLANNING & ANALYSIS (New in v3.0.11) ===
  planner: plannerAgent,
  analyst: analystAgent,
  critic: criticAgent,
  vision: visionAgent,
  // Backward compatibility for planning agents
  prometheus: plannerAgent,
  metis: analystAgent,
  momus: criticAgent,
  "multimodal-looker": visionAgent,
};

export function getAgent(name: string): AgentDefinition | undefined {
  return agents[name];
}

export function listAgents(): AgentDefinition[] {
  // Return unique agents (excluding aliases)
  const uniqueAgents = new Set<AgentDefinition>();
  const primaryNames = [
    "architect",
    "architect-low",
    "architect-medium",
    "executor",
    "executor-low",
    "executor-high",
    "explore",
    "explore-medium",
    "researcher",
    "researcher-low",
    "designer",
    "designer-low",
    "designer-high",
    "writer",
    "qa-tester",
    "planner",
    "analyst",
    "critic",
    "vision",
  ];
  for (const name of primaryNames) {
    const agent = agents[name];
    if (agent) {
      uniqueAgents.add(agent);
    }
  }
  return Array.from(uniqueAgents);
}

/**
 * Get all agent names including aliases
 */
export function listAgentNames(): string[] {
  return Object.keys(agents);
}

/**
 * Check if a name is an alias (backward compatibility name)
 */
export function isAlias(name: string): boolean {
  const aliases = [
    "oracle",
    "oracle-low",
    "oracle-medium",
    "librarian",
    "librarian-low",
    "frontend-engineer",
    "frontend-engineer-low",
    "frontend-engineer-high",
    "document-writer",
    "sisyphus-junior",
    "sisyphus-junior-low",
    "sisyphus-junior-high",
    "prometheus",
    "metis",
    "momus",
    "multimodal-looker",
  ];
  return aliases.includes(name);
}

/**
 * Get the canonical (new) name for an agent
 */
export function getCanonicalName(name: string): string {
  const aliasMap: Record<string, string> = {
    oracle: "architect",
    "oracle-low": "architect-low",
    "oracle-medium": "architect-medium",
    librarian: "researcher",
    "librarian-low": "researcher-low",
    "frontend-engineer": "designer",
    "frontend-engineer-low": "designer-low",
    "frontend-engineer-high": "designer-high",
    "document-writer": "writer",
    "sisyphus-junior": "executor",
    "sisyphus-junior-low": "executor-low",
    "sisyphus-junior-high": "executor-high",
    prometheus: "planner",
    metis: "analyst",
    momus: "critic",
    "multimodal-looker": "vision",
  };
  return aliasMap[name] || name;
}
