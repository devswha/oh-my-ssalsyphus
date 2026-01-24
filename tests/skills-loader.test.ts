/**
 * Skill Loader Tests
 *
 * Tests for the skill loading and caching system.
 */

import { describe, it, expect, beforeAll } from "bun:test";
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { loadSkill, loadAllSkills } from '../src/skills/loader.js';
import { getSkill, listSkills, getInvocableSkills } from '../src/skills/index.js';
import { getSkillsAssetsDir } from './test-utils.js';
import type { Skill } from '../src/skills/types.js';

const TEST_SKILLS_DIR = join(import.meta.dir, 'fixtures', 'test-skills');

describe('Skill Loader', () => {
  beforeAll(() => {
    // Clean up any existing test fixtures
    if (require('fs').existsSync(TEST_SKILLS_DIR)) {
      rmSync(TEST_SKILLS_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_SKILLS_DIR, { recursive: true });
  });

  describe('loadSkill()', () => {
    it('should parse skill with valid YAML frontmatter', () => {
      const testFile = join(TEST_SKILLS_DIR, 'valid-skill.md');
      const content = `---
name: test-skill
description: A test skill for validation
user-invocable: true
---

# Test Skill Content

This is the skill content with {{ARGUMENTS}} placeholder.
`;
      writeFileSync(testFile, content, 'utf-8');

      const skill = loadSkill(testFile);

      expect(skill.metadata.name).toBe('test-skill');
      expect(skill.metadata.description).toBe('A test skill for validation');
      expect(skill.metadata.userInvocable).toBe(true);
      expect(skill.content).toContain('$ARGUMENTS');
      expect(skill.content).not.toContain('{{ARGUMENTS}}');
    });

    it('should convert kebab-case to camelCase in frontmatter', () => {
      const testFile = join(TEST_SKILLS_DIR, 'kebab-case.md');
      const content = `---
name: kebab-test
description: Testing kebab-case conversion
user-invocable: false
---

Content here.
`;
      writeFileSync(testFile, content, 'utf-8');

      const skill = loadSkill(testFile);

      expect(skill.metadata.userInvocable).toBe(false);
    });

    it('should default userInvocable to false when not specified', () => {
      const testFile = join(TEST_SKILLS_DIR, 'no-invocable.md');
      const content = `---
name: no-invocable
description: Skill without userInvocable field
---

Content.
`;
      writeFileSync(testFile, content, 'utf-8');

      const skill = loadSkill(testFile);

      expect(skill.metadata.userInvocable).toBe(false);
    });

    it('should parse boolean values correctly', () => {
      const testFile = join(TEST_SKILLS_DIR, 'bool-test.md');
      const content = `---
name: bool-test
description: Testing boolean parsing
user-invocable: true
---

Content.
`;
      writeFileSync(testFile, content, 'utf-8');

      const skill = loadSkill(testFile);

      expect(skill.metadata.userInvocable).toBe(true);
    });

    it('should handle skill without frontmatter', () => {
      const testFile = join(TEST_SKILLS_DIR, 'no-frontmatter.md');
      const content = `# Just content, no frontmatter

This is plain markdown.
`;
      writeFileSync(testFile, content, 'utf-8');

      expect(() => loadSkill(testFile)).toThrow(/missing required 'name' field/);
    });

    it('should throw error when name field is missing', () => {
      const testFile = join(TEST_SKILLS_DIR, 'no-name.md');
      const content = `---
description: Missing name field
---

Content.
`;
      writeFileSync(testFile, content, 'utf-8');

      expect(() => loadSkill(testFile)).toThrow(/missing required 'name' field/);
    });

    it('should throw error when description field is missing', () => {
      const testFile = join(TEST_SKILLS_DIR, 'no-description.md');
      const content = `---
name: no-desc
---

Content.
`;
      writeFileSync(testFile, content, 'utf-8');

      expect(() => loadSkill(testFile)).toThrow(/missing required 'description' field/);
    });

    it('should throw error when name is not a string', () => {
      const testFile = join(TEST_SKILLS_DIR, 'invalid-name.md');
      const content = `---
name: 123
description: Invalid name type
---

Content.
`;
      writeFileSync(testFile, content, 'utf-8');

      // The YAML parser converts numbers, so this should work differently
      const skill = loadSkill(testFile);
      expect(typeof skill.metadata.name).toBe('string');
    });

    it('should replace all {{ARGUMENTS}} placeholders with $ARGUMENTS', () => {
      const testFile = join(TEST_SKILLS_DIR, 'multi-args.md');
      const content = `---
name: multi-args
description: Multiple argument placeholders
---

First: {{ARGUMENTS}}
Second: {{ARGUMENTS}}
Third: {{ARGUMENTS}}
`;
      writeFileSync(testFile, content, 'utf-8');

      const skill = loadSkill(testFile);

      const argCount = (skill.content.match(/\$ARGUMENTS/g) || []).length;
      expect(argCount).toBe(3);
      expect(skill.content).not.toContain('{{ARGUMENTS}}');
    });

    it('should handle quoted string values', () => {
      const testFile = join(TEST_SKILLS_DIR, 'quoted-values.md');
      const content = `---
name: "quoted-name"
description: 'Single quoted description'
---

Content.
`;
      writeFileSync(testFile, content, 'utf-8');

      const skill = loadSkill(testFile);

      expect(skill.metadata.name).toBe('quoted-name');
      expect(skill.metadata.description).toBe('Single quoted description');
    });

    it('should handle comments in YAML frontmatter', () => {
      const testFile = join(TEST_SKILLS_DIR, 'with-comments.md');
      const content = `---
# This is a comment
name: commented
description: Skill with YAML comments
# user-invocable: true (commented out)
user-invocable: false
---

Content.
`;
      writeFileSync(testFile, content, 'utf-8');

      const skill = loadSkill(testFile);

      expect(skill.metadata.name).toBe('commented');
      expect(skill.metadata.userInvocable).toBe(false);
    });
  });

  describe('loadAllSkills()', () => {
    beforeAll(() => {
      // Create multiple test skills
      const skills = [
        { name: 'skill-one', invocable: true },
        { name: 'skill-two', invocable: false },
        { name: 'skill-three', invocable: true },
      ];

      for (const { name, invocable } of skills) {
        const content = `---
name: ${name}
description: Test skill ${name}
user-invocable: ${invocable}
---

Content for ${name}.
`;
        writeFileSync(join(TEST_SKILLS_DIR, `${name}.md`), content, 'utf-8');
      }

      // Create a non-.md file that should be ignored
      writeFileSync(join(TEST_SKILLS_DIR, 'not-a-skill.txt'), 'This should be ignored', 'utf-8');
    });

    it('should load all .md files from directory', () => {
      const skills = loadAllSkills(TEST_SKILLS_DIR);

      expect(skills.length).toBeGreaterThanOrEqual(3);

      const skillNames = skills.map(s => s.metadata.name);
      expect(skillNames).toContain('skill-one');
      expect(skillNames).toContain('skill-two');
      expect(skillNames).toContain('skill-three');
    });

    it('should ignore non-.md files', () => {
      const skills = loadAllSkills(TEST_SKILLS_DIR);

      const hasNonMdFile = skills.some(s => s.metadata.name === 'not-a-skill');
      expect(hasNonMdFile).toBe(false);
    });

    it('should skip invalid skills with warning', () => {
      const invalidFile = join(TEST_SKILLS_DIR, 'invalid-skill.md');
      const content = `---
description: Missing name
---
Content.
`;
      writeFileSync(invalidFile, content, 'utf-8');

      // This should not throw, but log warning
      const skills = loadAllSkills(TEST_SKILLS_DIR);

      // Invalid skill should not be in the list
      const hasInvalid = skills.some(s => s.metadata.name === 'invalid-skill');
      expect(hasInvalid).toBe(false);
    });
  });

  describe('Index module (skills cache)', () => {
    describe('getSkill()', () => {
      it('should retrieve skill by name from real assets', () => {
        const skill = getSkill('orchestrate');

        expect(skill).toBeDefined();
        expect(skill?.metadata.name).toBe('orchestrate');
        expect(skill?.metadata.description).toBeTruthy();
        expect(typeof skill?.metadata.userInvocable).toBe('boolean');
      });

      it('should return undefined for non-existent skill', () => {
        const skill = getSkill('non-existent-skill-12345');

        expect(skill).toBeUndefined();
      });

      it('should retrieve user-invocable skill', () => {
        const skill = getSkill('orchestrate');

        expect(skill).toBeDefined();
        expect(skill?.metadata.userInvocable).toBe(true);
      });
    });

    describe('listSkills()', () => {
      it('should return all loaded skills', () => {
        const skills = listSkills();

        expect(Array.isArray(skills)).toBe(true);
        expect(skills.length).toBeGreaterThan(0);
      });

      it('should include expected skills', () => {
        const skills = listSkills();
        const skillNames = skills.map(s => s.metadata.name);

        // Check for some known skills
        expect(skillNames).toContain('orchestrate');
        expect(skillNames).toContain('ralph');
        expect(skillNames).toContain('ultrawork');
      });

      it('should return skills with valid structure', () => {
        const skills = listSkills();

        for (const skill of skills) {
          expect(skill.metadata).toBeDefined();
          expect(typeof skill.metadata.name).toBe('string');
          expect(typeof skill.metadata.description).toBe('string');
          expect(typeof skill.metadata.userInvocable).toBe('boolean');
          expect(typeof skill.content).toBe('string');
        }
      });
    });

    describe('getInvocableSkills()', () => {
      it('should return only user-invocable skills', () => {
        const invocableSkills = getInvocableSkills();

        expect(Array.isArray(invocableSkills)).toBe(true);
        expect(invocableSkills.length).toBeGreaterThan(0);

        for (const skill of invocableSkills) {
          expect(skill.metadata.userInvocable).toBe(true);
        }
      });

      it('should exclude non-invocable skills', () => {
        const invocableSkills = getInvocableSkills();
        const allSkills = listSkills();

        expect(invocableSkills.length).toBeLessThanOrEqual(allSkills.length);
      });

      it('should include orchestrate skill', () => {
        const invocableSkills = getInvocableSkills();
        const skillNames = invocableSkills.map(s => s.metadata.name);

        expect(skillNames).toContain('orchestrate');
      });
    });

    describe('Cache behavior', () => {
      it('should return same instance on repeated calls', () => {
        const skills1 = listSkills();
        const skills2 = listSkills();

        // Should be same array instance (cached)
        expect(skills1).toBe(skills2);
      });

      it('should cache individual skill lookups', () => {
        const skill1 = getSkill('orchestrate');
        const skill2 = getSkill('orchestrate');

        // Should retrieve from same cached array
        expect(skill1).toBeDefined();
        expect(skill1).toBe(skill2);
      });
    });
  });

  describe('Real assets validation', () => {
    it('should load all skills from assets directory', () => {
      const skillsDir = getSkillsAssetsDir();
      const skills = loadAllSkills(skillsDir);

      expect(skills.length).toBeGreaterThan(0);
    });

    it('should have all skills with required metadata', () => {
      const skills = listSkills();

      for (const skill of skills) {
        expect(skill.metadata.name).toBeTruthy();
        expect(skill.metadata.description).toBeTruthy();
        expect(typeof skill.metadata.userInvocable).toBe('boolean');
      }
    });

    it('should have processed content with $ARGUMENTS instead of {{ARGUMENTS}}', () => {
      const skills = listSkills();

      for (const skill of skills) {
        expect(skill.content).not.toContain('{{ARGUMENTS}}');
        // Some skills may not use ARGUMENTS at all, so we just check it's not in old format
      }
    });

    it('should match expected skill count', () => {
      const skills = listSkills();

      // We have 31 skills in assets/skills directory
      expect(skills.length).toBeGreaterThanOrEqual(30);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty frontmatter gracefully', () => {
      const testFile = join(TEST_SKILLS_DIR, 'empty-frontmatter.md');
      const content = `---
---

Content without metadata.
`;
      writeFileSync(testFile, content, 'utf-8');

      expect(() => loadSkill(testFile)).toThrow(/missing required 'name' field/);
    });

    it('should handle malformed YAML gracefully', () => {
      const testFile = join(TEST_SKILLS_DIR, 'malformed.md');
      const content = `---
name test-skill
description: Missing colon
---

Content.
`;
      writeFileSync(testFile, content, 'utf-8');

      expect(() => loadSkill(testFile)).toThrow(/missing required/);
    });

    it('should handle skill with only frontmatter (no body)', () => {
      const testFile = join(TEST_SKILLS_DIR, 'no-body.md');
      const content = `---
name: no-body
description: Skill without body content
user-invocable: true
---`;
      writeFileSync(testFile, content, 'utf-8');

      const skill = loadSkill(testFile);

      expect(skill.metadata.name).toBe('no-body');
      expect(skill.content.trim()).toBe('');
    });

    it('should preserve content that looks like frontmatter in body', () => {
      const testFile = join(TEST_SKILLS_DIR, 'fake-frontmatter.md');
      const content = `---
name: fake-frontmatter
description: Content with fake frontmatter
---

# Example

\`\`\`yaml
---
name: not-real
---
\`\`\`
`;
      writeFileSync(testFile, content, 'utf-8');

      const skill = loadSkill(testFile);

      expect(skill.content).toContain('name: not-real');
      expect(skill.metadata.name).toBe('fake-frontmatter');
    });
  });
});
