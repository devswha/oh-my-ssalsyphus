import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import type { Skill } from './types.js';

/**
 * Simple YAML frontmatter parser
 * Parses YAML between --- markers
 */
function parseFrontmatter(content: string): { metadata: Record<string, any>; body: string } {
  // Allow optional trailing newline after closing --- and optional body
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { metadata: {}, body: content };
  }

  const [, yamlContent, body] = match;
  const metadata: Record<string, any> = {};

  // Simple YAML parser for key: value pairs
  const lines = yamlContent.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;

    const key = trimmed.slice(0, colonIndex).trim();
    const value = trimmed.slice(colonIndex + 1).trim();

    // Convert kebab-case to camelCase
    const camelKey = key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

    // Parse value
    if (value === 'true') {
      metadata[camelKey] = true;
    } else if (value === 'false') {
      metadata[camelKey] = false;
    } else if (/^\d+$/.test(value)) {
      metadata[camelKey] = parseInt(value, 10);
    } else if (/^\d+\.\d+$/.test(value)) {
      metadata[camelKey] = parseFloat(value);
    } else {
      // Remove quotes if present
      metadata[camelKey] = value.replace(/^["']|["']$/g, '');
    }
  }

  return { metadata, body };
}

/**
 * Load a single skill from a markdown file
 */
export function loadSkill(filepath: string): Skill {
  const content = readFileSync(filepath, 'utf-8');
  const { metadata, body } = parseFrontmatter(content);

  // Validate required fields
  if (!metadata.name || typeof metadata.name !== 'string') {
    throw new Error(`Skill at ${filepath} is missing required 'name' field in frontmatter`);
  }

  if (!metadata.description || typeof metadata.description !== 'string') {
    throw new Error(`Skill at ${filepath} is missing required 'description' field in frontmatter`);
  }

  // Default userInvocable to false if not specified
  const userInvocable = metadata.userInvocable === true;

  // Replace {{ARGUMENTS}} with $ARGUMENTS in content
  const processedBody = body.replace(/\{\{ARGUMENTS\}\}/g, '$ARGUMENTS');

  return {
    metadata: {
      name: metadata.name,
      description: metadata.description,
      userInvocable,
    },
    content: processedBody,
  };
}

/**
 * Load all skills from a directory
 */
export function loadAllSkills(directory: string): Skill[] {
  const files = readdirSync(directory);
  const skills: Skill[] = [];

  for (const file of files) {
    if (!file.endsWith('.md')) continue;

    const filepath = join(directory, file);
    try {
      const skill = loadSkill(filepath);
      skills.push(skill);
    } catch (error) {
      console.warn(`Failed to load skill from ${filepath}:`, error);
    }
  }

  return skills;
}
