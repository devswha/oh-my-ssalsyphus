export const EXPECTED_TOOLS = [
  "call_omco_agent",
  "background_task",
  "background_output",
  "background_cancel",
];

export const EXPECTED_CORE_AGENTS = [
  "architect", "executor", "explore", "researcher",
  "designer", "writer", "planner", "critic", "analyst", "vision",
];

export const EXPECTED_CORE_COMMANDS = [
  "ultrawork", "ralph-loop", "ultrawork-ralph",
  "autopilot", "plan", "ralplan",
  "deepsearch", "analyze", "help",
];

// Use minimum thresholds instead of exact counts
// The actual count is 30+ agents and 33+ commands, but dynamic skills may vary
export const MIN_AGENT_COUNT = 20;
export const MIN_COMMAND_COUNT = 20;

export const TIMEOUTS = {
  serverStart: 30000,
  llmPrompt: 60000,
  sessionCleanup: 10000,
  totalSuite: 300000,
};
