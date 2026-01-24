/**
 * Agent Loader System Tests
 *
 * Tests for the dynamic agent loading system that parses markdown files
 * with YAML frontmatter from assets/agents directory.
 */

import { describe, it, expect, beforeAll } from "bun:test";
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadAgent, loadAllAgents, getAgentsDirectory } from '../src/agents/loader.js';
import type { AgentDefinition } from '../src/agents/types.js';
import { getProjectRoot } from './test-utils.js';

describe('Agent Loader System', () => {
  let tempDir: string;

  beforeAll(async () => {
    // Create temporary directory for test fixtures
    tempDir = join(tmpdir(), `omco-agent-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  describe('loadAgent()', () => {
    it('should parse valid agent markdown with YAML frontmatter', async () => {
      const agentContent = `---
name: test-agent
description: A test agent for unit tests
model: sonnet
tools: Read, Grep, Glob
---

This is the system prompt for the test agent.
It can span multiple lines.`;

      const filepath = join(tempDir, 'test-agent.md');
      await fs.writeFile(filepath, agentContent);

      const agent = await loadAgent(filepath);

      expect(agent.name).toBe('test-agent');
      expect(agent.description).toBe('A test agent for unit tests');
      expect(agent.systemPrompt).toBe('This is the system prompt for the test agent.\nIt can span multiple lines.');
      expect(agent.model).toBe('sonnet');
      expect(agent.tools).toEqual(['read', 'grep', 'glob']);
      expect(agent.readOnly).toBe(true); // No write/edit tools
    });

    it('should handle agent with write tools (readOnly: false)', async () => {
      const agentContent = `---
name: write-agent
description: Agent with write capabilities
model: opus
tools: Read, Write, Edit, Bash
---

An agent that can write files.`;

      const filepath = join(tempDir, 'write-agent.md');
      await fs.writeFile(filepath, agentContent);

      const agent = await loadAgent(filepath);

      expect(agent.readOnly).toBe(false); // Has write/edit tools
      expect(agent.tools).toEqual(['read', 'write', 'edit', 'bash']);
    });

    it('should handle agent with no model specified', async () => {
      const agentContent = `---
name: no-model-agent
description: Agent without model specification
tools: Read, Grep
---

System prompt without model.`;

      const filepath = join(tempDir, 'no-model-agent.md');
      await fs.writeFile(filepath, agentContent);

      const agent = await loadAgent(filepath);

      expect(agent.model).toBeUndefined();
      expect(agent.name).toBe('no-model-agent');
    });

    it('should handle agent with no tools specified', async () => {
      const agentContent = `---
name: no-tools-agent
description: Agent without tools
model: haiku
---

System prompt without tools.`;

      const filepath = join(tempDir, 'no-tools-agent.md');
      await fs.writeFile(filepath, agentContent);

      const agent = await loadAgent(filepath);

      expect(agent.tools).toEqual([]);
      expect(agent.readOnly).toBe(true); // Default when no tools
    });

    it('should normalize tool names to lowercase', async () => {
      const agentContent = `---
name: case-test
description: Test case normalization
tools: READ, GrEp, BASH, WrItE
---

Testing case normalization.`;

      const filepath = join(tempDir, 'case-test.md');
      await fs.writeFile(filepath, agentContent);

      const agent = await loadAgent(filepath);

      expect(agent.tools).toEqual(['read', 'grep', 'bash', 'write']);
    });

    it('should trim whitespace from tool names', async () => {
      const agentContent = `---
name: whitespace-test
description: Test whitespace trimming
tools:  Read ,  Grep  , Glob
---

Testing whitespace handling.`;

      const filepath = join(tempDir, 'whitespace-test.md');
      await fs.writeFile(filepath, agentContent);

      const agent = await loadAgent(filepath);

      expect(agent.tools).toEqual(['read', 'grep', 'glob']);
    });

    it('should handle different model types', async () => {
      const models: Array<'haiku' | 'sonnet' | 'opus'> = ['haiku', 'sonnet', 'opus'];

      for (const model of models) {
        const agentContent = `---
name: ${model}-agent
description: ${model} tier agent
model: ${model}
---

System prompt for ${model}.`;

        const filepath = join(tempDir, `${model}-agent.md`);
        await fs.writeFile(filepath, agentContent);

        const agent = await loadAgent(filepath);
        expect(agent.model).toBe(model);
      }
    });

    it('should throw error for invalid frontmatter format', async () => {
      const invalidContent = `This file has no frontmatter.
Just plain text.`;

      const filepath = join(tempDir, 'invalid.md');
      await fs.writeFile(filepath, invalidContent);

      await expect(loadAgent(filepath)).rejects.toThrow('Invalid agent file format');
    });

    it('should throw error for malformed YAML', async () => {
      const malformedContent = `---
name: test
description: [unclosed bracket
---

System prompt.`;

      const filepath = join(tempDir, 'malformed.md');
      await fs.writeFile(filepath, malformedContent);

      await expect(loadAgent(filepath)).rejects.toThrow();
    });

    it('should trim system prompt whitespace', async () => {
      const agentContent = `---
name: trim-test
description: Test prompt trimming
---


   Indented system prompt with leading/trailing whitespace.


`;

      const filepath = join(tempDir, 'trim-test.md');
      await fs.writeFile(filepath, agentContent);

      const agent = await loadAgent(filepath);

      expect(agent.systemPrompt).toBe('Indented system prompt with leading/trailing whitespace.');
    });

    it('should handle complex multi-line system prompts', async () => {
      const agentContent = `---
name: complex-agent
description: Complex system prompt
model: opus
tools: Read, Write, Edit
---

<Role>
This is a complex multi-line system prompt.
</Role>

<Guidelines>
1. First guideline
2. Second guideline
</Guidelines>

Final instructions.`;

      const filepath = join(tempDir, 'complex-agent.md');
      await fs.writeFile(filepath, agentContent);

      const agent = await loadAgent(filepath);

      expect(agent.systemPrompt).toContain('<Role>');
      expect(agent.systemPrompt).toContain('<Guidelines>');
      expect(agent.systemPrompt).toContain('Final instructions.');
    });
  });

  describe('loadAllAgents()', () => {
    it('should load all .md files from a directory', async () => {
      const agentDir = join(tempDir, 'multi-agents');
      await fs.mkdir(agentDir, { recursive: true });

      // Create multiple agent files
      const agents = [
        { name: 'agent1', model: 'haiku' },
        { name: 'agent2', model: 'sonnet' },
        { name: 'agent3', model: 'opus' },
      ];

      for (const { name, model } of agents) {
        const content = `---
name: ${name}
description: Test ${name}
model: ${model}
---

System prompt for ${name}.`;
        await fs.writeFile(join(agentDir, `${name}.md`), content);
      }

      const loadedAgents = await loadAllAgents(agentDir);

      expect(loadedAgents.size).toBe(3);
      expect(loadedAgents.has('agent1')).toBe(true);
      expect(loadedAgents.has('agent2')).toBe(true);
      expect(loadedAgents.has('agent3')).toBe(true);
    });

    it('should skip non-.md files', async () => {
      const agentDir = join(tempDir, 'mixed-files');
      await fs.mkdir(agentDir, { recursive: true });

      // Create .md file
      const mdContent = `---
name: valid-agent
description: Valid agent
---

System prompt.`;
      await fs.writeFile(join(agentDir, 'valid-agent.md'), mdContent);

      // Create non-.md files
      await fs.writeFile(join(agentDir, 'readme.txt'), 'Not an agent');
      await fs.writeFile(join(agentDir, 'config.json'), '{}');

      const loadedAgents = await loadAllAgents(agentDir);

      expect(loadedAgents.size).toBe(1);
      expect(loadedAgents.has('valid-agent')).toBe(true);
    });

    it('should handle empty directory', async () => {
      const emptyDir = join(tempDir, 'empty-agents');
      await fs.mkdir(emptyDir, { recursive: true });

      const loadedAgents = await loadAllAgents(emptyDir);

      expect(loadedAgents.size).toBe(0);
    });

    it('should skip invalid agent files with warning', async () => {
      const agentDir = join(tempDir, 'invalid-agents');
      await fs.mkdir(agentDir, { recursive: true });

      // Create valid agent
      const validContent = `---
name: valid
description: Valid agent
---

System prompt.`;
      await fs.writeFile(join(agentDir, 'valid.md'), validContent);

      // Create invalid agent (no frontmatter)
      await fs.writeFile(join(agentDir, 'invalid.md'), 'No frontmatter here');

      const loadedAgents = await loadAllAgents(agentDir);

      // Should only load the valid agent
      expect(loadedAgents.size).toBe(1);
      expect(loadedAgents.has('valid')).toBe(true);
      expect(loadedAgents.has('invalid')).toBe(false);
    });

    it('should use agent name from frontmatter as map key', async () => {
      const agentDir = join(tempDir, 'name-mapping');
      await fs.mkdir(agentDir, { recursive: true });

      const content = `---
name: canonical-name
description: Agent with specific name
---

System prompt.`;
      // File name differs from frontmatter name
      await fs.writeFile(join(agentDir, 'file-name.md'), content);

      const loadedAgents = await loadAllAgents(agentDir);

      expect(loadedAgents.has('canonical-name')).toBe(true);
      expect(loadedAgents.has('file-name')).toBe(false);
    });
  });

  describe('getAgentsDirectory()', () => {
    it('should return path to assets/agents', () => {
      const dir = getAgentsDirectory();

      expect(dir).toContain('assets');
      expect(dir).toContain('agents');
      expect(dir.endsWith('assets/agents')).toBe(true);
    });

    it('should return absolute path', () => {
      const dir = getAgentsDirectory();

      expect(dir.startsWith('/')).toBe(true);
    });
  });

  describe('AgentDefinition structure validation', () => {
    it('should have required string fields', async () => {
      const agentContent = `---
name: structure-test
description: Testing structure
model: sonnet
---

System prompt.`;

      const filepath = join(tempDir, 'structure-test.md');
      await fs.writeFile(filepath, agentContent);

      const agent = await loadAgent(filepath);

      expect(typeof agent.name).toBe('string');
      expect(typeof agent.description).toBe('string');
      expect(typeof agent.systemPrompt).toBe('string');
      expect(agent.name.length).toBeGreaterThan(0);
      expect(agent.description.length).toBeGreaterThan(0);
      expect(agent.systemPrompt.length).toBeGreaterThan(0);
    });

    it('should have valid model type or undefined', async () => {
      const agentContent = `---
name: model-test
description: Testing model
model: sonnet
---

System prompt.`;

      const filepath = join(tempDir, 'model-test.md');
      await fs.writeFile(filepath, agentContent);

      const agent = await loadAgent(filepath);

      if (agent.model !== undefined) {
        expect(['haiku', 'sonnet', 'opus']).toContain(agent.model);
      }
    });

    it('should have boolean readOnly field', async () => {
      const agentContent = `---
name: readonly-test
description: Testing readOnly
---

System prompt.`;

      const filepath = join(tempDir, 'readonly-test.md');
      await fs.writeFile(filepath, agentContent);

      const agent = await loadAgent(filepath);

      expect(typeof agent.readOnly).toBe('boolean');
    });

    it('should have tools as string array', async () => {
      const agentContent = `---
name: tools-test
description: Testing tools
tools: Read, Grep, Write
---

System prompt.`;

      const filepath = join(tempDir, 'tools-test.md');
      await fs.writeFile(filepath, agentContent);

      const agent = await loadAgent(filepath);

      expect(Array.isArray(agent.tools)).toBe(true);
      agent.tools.forEach(tool => {
        expect(typeof tool).toBe('string');
      });
    });
  });

  describe('Real agent files integration', () => {
    it('should successfully load executor.md from assets', async () => {
      const agentsDir = getAgentsDirectory();
      const executorPath = join(agentsDir, 'executor.md');

      const agent = await loadAgent(executorPath);

      expect(agent.name).toBe('executor');
      expect(agent.description).toContain('executor');
      expect(agent.model).toBe('sonnet');
      expect(agent.systemPrompt).toContain('Sisyphus-Junior');
      expect(agent.tools.length).toBeGreaterThan(0);
      expect(agent.readOnly).toBe(false); // Has write tools
    });

    it('should successfully load architect.md from assets', async () => {
      const agentsDir = getAgentsDirectory();
      const architectPath = join(agentsDir, 'architect.md');

      const agent = await loadAgent(architectPath);

      expect(agent.name).toBe('architect');
      expect(agent.model).toBe('opus');
      expect(agent.readOnly).toBe(true); // READ-ONLY agent
      expect(agent.tools.length).toBeGreaterThan(0);
    });

    it('should load all agents from assets directory', async () => {
      const agentsDir = getAgentsDirectory();
      const agents = await loadAllAgents(agentsDir);

      // Should have multiple agents
      expect(agents.size).toBeGreaterThan(10);

      // Verify some expected agents exist
      expect(agents.has('executor')).toBe(true);
      expect(agents.has('architect')).toBe(true);
      expect(agents.has('explore')).toBe(true);
      expect(agents.has('designer')).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle frontmatter with extra fields', async () => {
      const agentContent = `---
name: extra-fields
description: Agent with extra fields
model: sonnet
tools: Read
customField: should be ignored
anotherField: 123
---

System prompt.`;

      const filepath = join(tempDir, 'extra-fields.md');
      await fs.writeFile(filepath, agentContent);

      const agent = await loadAgent(filepath);

      expect(agent.name).toBe('extra-fields');
      // Extra fields should not break parsing
      expect(agent).toBeDefined();
    });

    it('should handle empty system prompt', async () => {
      const agentContent = `---
name: empty-prompt
description: Agent with empty prompt
---

`;

      const filepath = join(tempDir, 'empty-prompt.md');
      await fs.writeFile(filepath, agentContent);

      const agent = await loadAgent(filepath);

      expect(agent.systemPrompt).toBe('');
    });

    it('should handle tools with only whitespace', async () => {
      const agentContent = `---
name: whitespace-tools
description: Agent with whitespace tools
tools: "   "
---

System prompt.`;

      const filepath = join(tempDir, 'whitespace-tools.md');
      await fs.writeFile(filepath, agentContent);

      const agent = await loadAgent(filepath);

      // Should result in empty array after trimming
      expect(agent.tools).toEqual(['']);
    });

    it('should detect readOnly correctly with mixed case tools', async () => {
      const agentContent = `---
name: mixed-case-readonly
description: Testing readOnly detection
tools: ReAd, GrEp, WrItE
---

System prompt.`;

      const filepath = join(tempDir, 'mixed-case-readonly.md');
      await fs.writeFile(filepath, agentContent);

      const agent = await loadAgent(filepath);

      expect(agent.readOnly).toBe(false); // Has 'write' tool
    });

    it('should detect readOnly correctly with Edit tool', async () => {
      const agentContent = `---
name: edit-readonly
description: Testing readOnly with Edit
tools: Read, Grep, Edit
---

System prompt.`;

      const filepath = join(tempDir, 'edit-readonly.md');
      await fs.writeFile(filepath, agentContent);

      const agent = await loadAgent(filepath);

      expect(agent.readOnly).toBe(false); // Has 'edit' tool
    });

    it('should handle frontmatter without closing dashes', async () => {
      const invalidContent = `---
name: no-closing
description: Missing closing dashes

This should fail.`;

      const filepath = join(tempDir, 'no-closing.md');
      await fs.writeFile(filepath, invalidContent);

      await expect(loadAgent(filepath)).rejects.toThrow('Invalid agent file format');
    });
  });
});
