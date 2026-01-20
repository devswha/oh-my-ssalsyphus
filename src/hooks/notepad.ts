/**
 * Notepad Support - Compaction Resilient Memory
 *
 * Implements compaction-resilient memory persistence using notepad.md format.
 * Provides a three-tier memory system:
 * 1. Priority Context - Always loaded, critical discoveries (max 500 chars)
 * 2. Working Memory - Session notes, auto-pruned after 7 days
 * 3. MANUAL - User content, never auto-pruned
 *
 * Based on oh-my-claude-sisyphus notepad system.
 */

import * as fs from "fs";
import * as path from "path";
import { log } from "../shared/logger";

// ============================================================================
// Types
// ============================================================================

export interface NotepadConfig {
  /** Maximum characters for Priority Context section */
  priorityMaxChars: number;
  /** Days to keep Working Memory entries before pruning */
  workingMemoryDays: number;
  /** Maximum total file size in bytes */
  maxTotalSize: number;
}

export interface NotepadStats {
  /** Whether notepad.md exists */
  exists: boolean;
  /** Total file size in bytes */
  totalSize: number;
  /** Priority Context section size in bytes */
  prioritySize: number;
  /** Number of Working Memory entries */
  workingMemoryEntries: number;
  /** ISO timestamp of oldest Working Memory entry */
  oldestEntry: string | null;
}

export interface PriorityContextResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Warning message if content exceeds limit */
  warning?: string;
}

export interface PruneResult {
  /** Number of entries pruned */
  pruned: number;
  /** Number of entries remaining */
  remaining: number;
}

// ============================================================================
// Constants
// ============================================================================

export const NOTEPAD_FILENAME = "notepad.md";

export const DEFAULT_CONFIG: NotepadConfig = {
  priorityMaxChars: 500,
  workingMemoryDays: 7,
  maxTotalSize: 8192, // 8KB
};

export const PRIORITY_HEADER = "## Priority Context";
export const WORKING_MEMORY_HEADER = "## Working Memory";
export const MANUAL_HEADER = "## MANUAL";

// ============================================================================
// File Operations
// ============================================================================

/**
 * Get the path to notepad.md in .sisyphus subdirectory
 */
export function getNotepadPath(directory: string): string {
  return path.join(directory, ".sisyphus", NOTEPAD_FILENAME);
}

/**
 * Ensure .sisyphus directory exists
 */
function ensureSisyphusDir(directory: string): boolean {
  const sisyphusDir = path.join(directory, ".sisyphus");
  if (!fs.existsSync(sisyphusDir)) {
    try {
      fs.mkdirSync(sisyphusDir, { recursive: true });
      return true;
    } catch (err) {
      log(`Failed to create .sisyphus directory`, { error: String(err) });
      return false;
    }
  }
  return true;
}

/**
 * Initialize notepad.md if it doesn't exist
 */
export function initNotepad(directory: string): boolean {
  if (!ensureSisyphusDir(directory)) {
    return false;
  }

  const notepadPath = getNotepadPath(directory);
  if (fs.existsSync(notepadPath)) {
    return true; // Already exists
  }

  const content = `# Notepad
<!-- Auto-managed by Sisyphus. Manual edits preserved in MANUAL section. -->

${PRIORITY_HEADER}
<!-- ALWAYS loaded. Keep under 500 chars. Critical discoveries only. -->

${WORKING_MEMORY_HEADER}
<!-- Session notes. Auto-pruned after 7 days. -->

${MANUAL_HEADER}
<!-- User content. Never auto-pruned. -->

`;

  try {
    fs.writeFileSync(notepadPath, content);
    log(`Initialized notepad.md`);
    return true;
  } catch (err) {
    log(`Failed to initialize notepad.md`, { error: String(err) });
    return false;
  }
}

/**
 * Read entire notepad content
 */
export function readNotepad(directory: string): string | null {
  const notepadPath = getNotepadPath(directory);
  if (!fs.existsSync(notepadPath)) {
    return null;
  }

  try {
    return fs.readFileSync(notepadPath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Extract a section from notepad content using regex
 */
function extractSection(content: string, header: string): string | null {
  // Match from header to next section (## followed by space, at start of line)
  const regex = new RegExp(`${header}\\n([\\s\\S]*?)(?=\\n## [^#]|$)`);
  const match = content.match(regex);
  if (!match) {
    return null;
  }

  // Clean up the content - remove HTML comments and trim
  let section = match[1];
  section = section.replace(/<!--[\s\S]*?-->/g, "").trim();

  return section || null;
}

/**
 * Replace a section in notepad content
 */
function replaceSection(
  content: string,
  header: string,
  newContent: string
): string {
  const regex = new RegExp(`(${header}\\n)([\\s\\S]*?)(?=## |$)`);

  // Preserve comment if it exists
  const commentMatch = content.match(
    new RegExp(`${header}\\n(<!--[\\s\\S]*?-->)`)
  );
  const comment = commentMatch ? commentMatch[1] + "\n" : "";

  return content.replace(regex, `$1${comment}${newContent}\n\n`);
}

// ============================================================================
// Section Access
// ============================================================================

/**
 * Get Priority Context section only (for injection)
 */
export function getPriorityContext(directory: string): string | null {
  const content = readNotepad(directory);
  if (!content) {
    return null;
  }

  return extractSection(content, PRIORITY_HEADER);
}

/**
 * Get Working Memory section
 */
export function getWorkingMemory(directory: string): string | null {
  const content = readNotepad(directory);
  if (!content) {
    return null;
  }

  return extractSection(content, WORKING_MEMORY_HEADER);
}

/**
 * Get MANUAL section
 */
export function getManualSection(directory: string): string | null {
  const content = readNotepad(directory);
  if (!content) {
    return null;
  }

  return extractSection(content, MANUAL_HEADER);
}

// ============================================================================
// Section Updates
// ============================================================================

/**
 * Add/update Priority Context (replaces content, warns if over limit)
 */
export function setPriorityContext(
  directory: string,
  content: string,
  config: NotepadConfig = DEFAULT_CONFIG
): PriorityContextResult {
  // Initialize if needed
  if (!fs.existsSync(getNotepadPath(directory))) {
    if (!initNotepad(directory)) {
      return { success: false };
    }
  }

  const notepadPath = getNotepadPath(directory);
  let notepadContent = fs.readFileSync(notepadPath, "utf-8");

  // Check size
  const warning =
    content.length > config.priorityMaxChars
      ? `Priority Context exceeds ${config.priorityMaxChars} chars (${content.length} chars). Consider condensing.`
      : undefined;

  // Replace the section
  notepadContent = replaceSection(notepadContent, PRIORITY_HEADER, content);

  try {
    fs.writeFileSync(notepadPath, notepadContent);
    log(`Updated Priority Context`, { length: content.length });
    return { success: true, warning };
  } catch {
    return { success: false };
  }
}

/**
 * Add entry to Working Memory with timestamp
 */
export function addWorkingMemoryEntry(
  directory: string,
  content: string
): boolean {
  // Initialize if needed
  if (!fs.existsSync(getNotepadPath(directory))) {
    if (!initNotepad(directory)) {
      return false;
    }
  }

  const notepadPath = getNotepadPath(directory);
  let notepadContent = fs.readFileSync(notepadPath, "utf-8");

  // Get current Working Memory content
  const currentMemory = extractSection(notepadContent, WORKING_MEMORY_HEADER) || "";

  // Format timestamp
  const now = new Date();
  const timestamp = now.toISOString().slice(0, 16).replace("T", " "); // YYYY-MM-DD HH:MM

  // Add new entry
  const newEntry = `### ${timestamp}\n${content}\n`;
  const updatedMemory = currentMemory
    ? currentMemory + "\n" + newEntry
    : newEntry;

  // Replace the section
  notepadContent = replaceSection(
    notepadContent,
    WORKING_MEMORY_HEADER,
    updatedMemory
  );

  try {
    fs.writeFileSync(notepadPath, notepadContent);
    log(`Added Working Memory entry`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Add to MANUAL section
 */
export function addManualEntry(directory: string, content: string): boolean {
  // Initialize if needed
  if (!fs.existsSync(getNotepadPath(directory))) {
    if (!initNotepad(directory)) {
      return false;
    }
  }

  const notepadPath = getNotepadPath(directory);
  let notepadContent = fs.readFileSync(notepadPath, "utf-8");

  // Get current MANUAL content
  const currentManual = extractSection(notepadContent, MANUAL_HEADER) || "";

  // Add new entry with timestamp
  const now = new Date();
  const timestamp = now.toISOString().slice(0, 16).replace("T", " "); // YYYY-MM-DD HH:MM
  const newEntry = `### ${timestamp}\n${content}\n`;
  const updatedManual = currentManual
    ? currentManual + "\n" + newEntry
    : newEntry;

  // Replace the section
  notepadContent = replaceSection(notepadContent, MANUAL_HEADER, updatedManual);

  try {
    fs.writeFileSync(notepadPath, notepadContent);
    log(`Added MANUAL entry`);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Pruning
// ============================================================================

/**
 * Prune Working Memory entries older than N days
 */
export function pruneOldEntries(
  directory: string,
  daysOld: number = DEFAULT_CONFIG.workingMemoryDays
): PruneResult {
  const notepadPath = getNotepadPath(directory);
  if (!fs.existsSync(notepadPath)) {
    return { pruned: 0, remaining: 0 };
  }

  let notepadContent = fs.readFileSync(notepadPath, "utf-8");
  const workingMemory = extractSection(notepadContent, WORKING_MEMORY_HEADER);

  if (!workingMemory) {
    return { pruned: 0, remaining: 0 };
  }

  // Parse entries
  const entryRegex =
    /### (\d{4}-\d{2}-\d{2} \d{2}:\d{2})\n([\s\S]*?)(?=### |$)/g;
  const entries: Array<{ timestamp: string; content: string }> = [];
  let match;

  while ((match = entryRegex.exec(workingMemory)) !== null) {
    entries.push({
      timestamp: match[1],
      content: match[2].trim(),
    });
  }

  // Calculate cutoff date
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysOld);

  // Filter entries
  const kept = entries.filter((entry) => {
    const entryDate = new Date(entry.timestamp);
    return entryDate >= cutoff;
  });

  const pruned = entries.length - kept.length;

  if (pruned === 0) {
    return { pruned: 0, remaining: entries.length };
  }

  // Rebuild Working Memory section
  const newContent = kept
    .map((entry) => `### ${entry.timestamp}\n${entry.content}`)
    .join("\n\n");

  notepadContent = replaceSection(
    notepadContent,
    WORKING_MEMORY_HEADER,
    newContent
  );

  try {
    fs.writeFileSync(notepadPath, notepadContent);
    log(`Pruned ${pruned} old Working Memory entries`);
    return { pruned, remaining: kept.length };
  } catch {
    return { pruned: 0, remaining: entries.length };
  }
}

// ============================================================================
// Stats and Info
// ============================================================================

/**
 * Get notepad stats
 */
export function getNotepadStats(directory: string): NotepadStats {
  const notepadPath = getNotepadPath(directory);

  if (!fs.existsSync(notepadPath)) {
    return {
      exists: false,
      totalSize: 0,
      prioritySize: 0,
      workingMemoryEntries: 0,
      oldestEntry: null,
    };
  }

  const content = fs.readFileSync(notepadPath, "utf-8");
  const priorityContext = extractSection(content, PRIORITY_HEADER) || "";
  const workingMemory = extractSection(content, WORKING_MEMORY_HEADER) || "";

  // Count entries
  const entryMatches = workingMemory.match(/### \d{4}-\d{2}-\d{2} \d{2}:\d{2}/g);
  const entryCount = entryMatches ? entryMatches.length : 0;

  // Find oldest entry
  let oldestEntry: string | null = null;
  if (entryMatches && entryMatches.length > 0) {
    // Extract just the timestamp part
    const timestamps = entryMatches.map((m) => m.replace("### ", ""));
    timestamps.sort();
    oldestEntry = timestamps[0];
  }

  return {
    exists: true,
    totalSize: Buffer.byteLength(content, "utf-8"),
    prioritySize: Buffer.byteLength(priorityContext, "utf-8"),
    workingMemoryEntries: entryCount,
    oldestEntry,
  };
}

// ============================================================================
// Context Formatting
// ============================================================================

/**
 * Format context for injection into session
 */
export function formatNotepadContext(directory: string): string | null {
  const notepadPath = getNotepadPath(directory);
  if (!fs.existsSync(notepadPath)) {
    return null;
  }

  const priorityContext = getPriorityContext(directory);

  if (!priorityContext) {
    return null;
  }

  return `<notepad-priority>

## Priority Context

${priorityContext}

</notepad-priority>
`;
}

/**
 * Format full notepad for display
 */
export function formatFullNotepad(directory: string): string | null {
  const content = readNotepad(directory);
  if (!content) {
    return null;
  }

  return content;
}

// ============================================================================
// Remember Tag Processing
// ============================================================================

/**
 * Process <remember> tags from tool output
 * - <remember>content</remember> → Working Memory
 * - <remember priority>content</remember> → Priority Context
 */
export function processRememberTags(
  directory: string,
  content: string
): { processed: number; errors: number } {
  let processed = 0;
  let errors = 0;

  // Process priority remember tags
  const priorityRegex = /<remember\s+priority>([\s\S]*?)<\/remember>/gi;
  let priorityMatch;
  while ((priorityMatch = priorityRegex.exec(content)) !== null) {
    const priorityContent = priorityMatch[1].trim();
    if (priorityContent) {
      const result = setPriorityContext(directory, priorityContent);
      if (result.success) {
        processed++;
        log(`Processed priority remember tag`, { length: priorityContent.length });
      } else {
        errors++;
      }
    }
  }

  // Process regular remember tags (not priority)
  const regularRegex = /<remember>(?!priority)([\s\S]*?)<\/remember>/gi;
  let regularMatch;
  while ((regularMatch = regularRegex.exec(content)) !== null) {
    const memoryContent = regularMatch[1].trim();
    if (memoryContent) {
      if (addWorkingMemoryEntry(directory, memoryContent)) {
        processed++;
        log(`Processed working memory remember tag`, { length: memoryContent.length });
      } else {
        errors++;
      }
    }
  }

  return { processed, errors };
}
