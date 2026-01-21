/**
 * Notepad Tests
 *
 * Tests for the compaction-resilient memory system.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import {
  initNotepad,
  readNotepad,
  getNotepadPath,
  getPriorityContext,
  getWorkingMemory,
  getManualSection,
  setPriorityContext,
  addWorkingMemoryEntry,
  addManualEntry,
  pruneOldEntries,
  getNotepadStats,
  formatNotepadContext,
  processRememberTags,
} from "../src/hooks/notepad";

const TEST_DIR = "/tmp/omo-omcs-notepad-test";

describe("Notepad", () => {
  beforeEach(() => {
    // Clean up test directory
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true });
    }
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe("initNotepad", () => {
    test("creates notepad.md file", () => {
      const result = initNotepad(TEST_DIR);
      expect(result).toBe(true);
      expect(fs.existsSync(getNotepadPath(TEST_DIR))).toBe(true);
    });

    test("creates .omc directory if missing", () => {
      const omcDir = path.join(TEST_DIR, ".omc");
      expect(fs.existsSync(omcDir)).toBe(false);

      initNotepad(TEST_DIR);

      expect(fs.existsSync(omcDir)).toBe(true);
    });

    test("returns true if notepad already exists", () => {
      initNotepad(TEST_DIR);
      const result = initNotepad(TEST_DIR);
      expect(result).toBe(true);
    });
  });

  describe("readNotepad", () => {
    test("returns null if notepad does not exist", () => {
      const result = readNotepad(TEST_DIR);
      expect(result).toBe(null);
    });

    test("returns content if notepad exists", () => {
      initNotepad(TEST_DIR);
      const result = readNotepad(TEST_DIR);
      expect(result).not.toBe(null);
      expect(result).toContain("# Notepad");
    });
  });

  describe("getPriorityContext", () => {
    test("returns null if no priority context", () => {
      initNotepad(TEST_DIR);
      const result = getPriorityContext(TEST_DIR);
      expect(result).toBe(null);
    });

    test("returns priority context if set", () => {
      initNotepad(TEST_DIR);
      setPriorityContext(TEST_DIR, "Critical discovery: Use pnpm");
      const result = getPriorityContext(TEST_DIR);
      expect(result).toBe("Critical discovery: Use pnpm");
    });
  });

  describe("setPriorityContext", () => {
    test("sets priority context", () => {
      const result = setPriorityContext(TEST_DIR, "Important note");
      expect(result.success).toBe(true);
      expect(getPriorityContext(TEST_DIR)).toBe("Important note");
    });

    test("warns if content exceeds limit", () => {
      const longContent = "x".repeat(600);
      const result = setPriorityContext(TEST_DIR, longContent);
      expect(result.success).toBe(true);
      expect(result.warning).toContain("exceeds");
    });
  });

  describe("addWorkingMemoryEntry", () => {
    test("adds entry with timestamp", () => {
      initNotepad(TEST_DIR);
      addWorkingMemoryEntry(TEST_DIR, "Session note: Found bug");
      const memory = getWorkingMemory(TEST_DIR);
      expect(memory).toContain("Session note: Found bug");
      expect(memory).toMatch(/### \d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
    });

    test("adds multiple entries", () => {
      initNotepad(TEST_DIR);
      addWorkingMemoryEntry(TEST_DIR, "Note 1");
      addWorkingMemoryEntry(TEST_DIR, "Note 2");
      const memory = getWorkingMemory(TEST_DIR);
      expect(memory).toContain("Note 1");
      expect(memory).toContain("Note 2");
    });
  });

  describe("addManualEntry", () => {
    test("adds entry to manual section", () => {
      initNotepad(TEST_DIR);
      addManualEntry(TEST_DIR, "User note");
      const manual = getManualSection(TEST_DIR);
      expect(manual).toContain("User note");
    });
  });

  describe("pruneOldEntries", () => {
    test("prunes old entries", () => {
      initNotepad(TEST_DIR);

      // Add an old entry manually
      const notepadPath = getNotepadPath(TEST_DIR);
      let content = fs.readFileSync(notepadPath, "utf-8");

      // Insert an old entry (8 days ago)
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 8);
      const oldTimestamp = oldDate.toISOString().slice(0, 16).replace("T", " ");

      content = content.replace(
        "## Working Memory\n<!-- Session notes. Auto-pruned after 7 days. -->",
        `## Working Memory\n<!-- Session notes. Auto-pruned after 7 days. -->\n\n### ${oldTimestamp}\nOld entry`
      );
      fs.writeFileSync(notepadPath, content);

      // Add a new entry
      addWorkingMemoryEntry(TEST_DIR, "New entry");

      const result = pruneOldEntries(TEST_DIR, 7);
      expect(result.pruned).toBe(1);
      expect(result.remaining).toBe(1);

      const memory = getWorkingMemory(TEST_DIR);
      expect(memory).not.toContain("Old entry");
      expect(memory).toContain("New entry");
    });
  });

  describe("getNotepadStats", () => {
    test("returns stats for existing notepad", () => {
      initNotepad(TEST_DIR);
      setPriorityContext(TEST_DIR, "Priority content");
      addWorkingMemoryEntry(TEST_DIR, "Entry 1");
      addWorkingMemoryEntry(TEST_DIR, "Entry 2");

      const stats = getNotepadStats(TEST_DIR);
      expect(stats.exists).toBe(true);
      expect(stats.totalSize).toBeGreaterThan(0);
      expect(stats.prioritySize).toBeGreaterThan(0);
      expect(stats.workingMemoryEntries).toBe(2);
    });

    test("returns empty stats for non-existing notepad", () => {
      const stats = getNotepadStats(TEST_DIR);
      expect(stats.exists).toBe(false);
      expect(stats.totalSize).toBe(0);
    });
  });

  describe("formatNotepadContext", () => {
    test("returns null if no priority context", () => {
      initNotepad(TEST_DIR);
      const result = formatNotepadContext(TEST_DIR);
      expect(result).toBe(null);
    });

    test("returns formatted context with priority", () => {
      initNotepad(TEST_DIR);
      setPriorityContext(TEST_DIR, "Important discovery");
      const result = formatNotepadContext(TEST_DIR);
      expect(result).toContain("<notepad-priority>");
      expect(result).toContain("Important discovery");
    });
  });

  describe("processRememberTags", () => {
    test("processes regular remember tags", () => {
      initNotepad(TEST_DIR);
      const content = "Some output\n<remember>Found important pattern</remember>\nMore output";
      const result = processRememberTags(TEST_DIR, content);
      expect(result.processed).toBe(1);
      expect(result.errors).toBe(0);
      expect(getWorkingMemory(TEST_DIR)).toContain("Found important pattern");
    });

    test("processes priority remember tags", () => {
      initNotepad(TEST_DIR);
      const content = "<remember priority>Critical discovery</remember>";
      const result = processRememberTags(TEST_DIR, content);
      expect(result.processed).toBe(1);
      expect(getPriorityContext(TEST_DIR)).toBe("Critical discovery");
    });

    test("processes multiple tags", () => {
      initNotepad(TEST_DIR);
      const content = `
        <remember>Working memory 1</remember>
        <remember priority>Priority info</remember>
        <remember>Working memory 2</remember>
      `;
      const result = processRememberTags(TEST_DIR, content);
      expect(result.processed).toBe(3);
      expect(getPriorityContext(TEST_DIR)).toBe("Priority info");
      expect(getWorkingMemory(TEST_DIR)).toContain("Working memory 1");
      expect(getWorkingMemory(TEST_DIR)).toContain("Working memory 2");
    });
  });
});
