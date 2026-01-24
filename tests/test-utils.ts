/**
 * Test Utilities for OMCO E2E Tests
 */

import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Get the project root directory
 */
export function getProjectRoot(): string {
  return join(import.meta.dir, '..');
}

/**
 * Get the assets directory
 */
export function getAssetsDir(): string {
  return join(getProjectRoot(), 'assets');
}

/**
 * Get the agents assets directory
 */
export function getAgentsAssetsDir(): string {
  return join(getAssetsDir(), 'agents');
}

/**
 * Get the skills assets directory
 */
export function getSkillsAssetsDir(): string {
  return join(getAssetsDir(), 'skills');
}

/**
 * Check if an asset file exists
 */
export function assetExists(type: 'agents' | 'skills', name: string): boolean {
  const dir = type === 'agents' ? getAgentsAssetsDir() : getSkillsAssetsDir();
  return existsSync(join(dir, `${name}.md`));
}

/**
 * Mock OpenCode client for testing
 */
export function createMockClient() {
  return {
    log: (message: string, data?: Record<string, unknown>) => {
      console.log(`[MOCK LOG] ${message}`, data);
    },
    error: (message: string, error?: Error) => {
      console.error(`[MOCK ERROR] ${message}`, error);
    },
  };
}

/**
 * Expected agent names from assets/agents/ (30 agents)
 * Note: Some agents like 'coordinator' and 'qa-tester-high' are hardcoded-only
 */
export const EXPECTED_AGENTS = [
  'analyst',
  'architect', 'architect-low', 'architect-medium',
  'build-fixer', 'build-fixer-low',
  'code-reviewer', 'code-reviewer-low',
  'critic',
  'designer', 'designer-low', 'designer-high',
  'executor', 'executor-low', 'executor-high',
  'explore', 'explore-medium',
  'planner',
  'qa-tester',
  'researcher', 'researcher-low',
  'scientist', 'scientist-low', 'scientist-high',
  'security-reviewer', 'security-reviewer-low',
  'tdd-guide', 'tdd-guide-low',
  'vision',
  'writer',
];

/**
 * Expected skill names
 */
export const EXPECTED_SKILLS = [
  'analyze', 'autopilot', 'cancel-autopilot', 'cancel-ralph',
  'cancel-ultraqa', 'cancel-ultrawork', 'deepinit', 'deepsearch',
  'doctor', 'frontend-ui-ux', 'git-master', 'help', 'hud',
  'learner', 'mcp-setup', 'note', 'omc-default', 'omc-default-global',
  'omc-setup', 'orchestrate', 'plan', 'planner', 'ralph', 'ralph-init',
  'ralplan', 'release', 'research', 'review', 'tdd', 'ultraqa', 'ultrawork',
];

/**
 * Agent tiers for validation
 */
export const AGENT_TIERS = {
  LOW: ['haiku'],
  MEDIUM: ['sonnet'],
  HIGH: ['opus'],
} as const;
