import { createOpencode, type OpencodeClient } from "@opencode-ai/sdk";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { tmpdir } from "os";

// Node.js/vitest-compatible __dirname (import.meta.dir is Bun-only)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface TestContext {
  server: { url: string; close(): void };
  client: OpencodeClient;
  projectDir: string;
  originalCwd: string;
  createdSessionIds: string[];
}

export function createTestProjectDir(): string {
  const tempDir = mkdtempSync(join(tmpdir(), "omco-e2e-"));

  // Create .opencode/plugins/ directory
  const pluginsDir = join(tempDir, ".opencode", "plugins");
  mkdirSync(pluginsDir, { recursive: true });

  // Create plugin loader with absolute path to project dist
  // __dirname is tests/e2e/helpers/, so go up 3 levels to project root
  const projectRoot = join(__dirname, "..", "..", "..");
  const distPath = join(projectRoot, "dist", "index.js");
  writeFileSync(
    join(pluginsDir, "omco.ts"),
    `import OmoOmcsPlugin from "${distPath}";\nexport default OmoOmcsPlugin;\n`
  );

  // Create minimal project structure
  writeFileSync(
    join(tempDir, "package.json"),
    JSON.stringify({ name: "omco-e2e-test", version: "1.0.0" })
  );
  writeFileSync(
    join(tempDir, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { target: "ES2022" } })
  );
  mkdirSync(join(tempDir, "src"), { recursive: true });
  writeFileSync(join(tempDir, "src", "index.ts"), "// E2E test file\n");

  return tempDir;
}

export function destroyTestProjectDir(path: string): void {
  rmSync(path, { recursive: true, force: true });
}

export async function setupTestServer(): Promise<TestContext> {
  const projectDir = createTestProjectDir();
  const originalCwd = process.cwd();

  // Change to test project dir so server discovers .opencode/plugins/
  process.chdir(projectDir);

  const { client, server } = await createOpencode({ port: 0 });

  return {
    server,
    client,
    projectDir,
    originalCwd,
    createdSessionIds: [],
  };
}

export async function teardownTestServer(ctx: TestContext): Promise<void> {
  // Clean up sessions
  await cleanupSessions(ctx.client, ctx.createdSessionIds);

  // Stop server
  ctx.server.close();

  // Restore CWD
  process.chdir(ctx.originalCwd);

  // Destroy temp dir
  destroyTestProjectDir(ctx.projectDir);
}

export async function checkProviderCredentials(client: OpencodeClient): Promise<boolean> {
  try {
    // provider.list() returns { all: Array<Provider>, default: { ... }, connected: Array<string> }
    // Use .connected to check authenticated providers (not .all which lists all available)
    const providers = await client.provider.list();
    return providers.data?.connected?.includes("github-copilot") ?? false;
  } catch {
    return false;
  }
}

export async function cleanupSessions(
  client: OpencodeClient,
  sessionIds: string[]
): Promise<void> {
  for (const id of sessionIds) {
    try {
      await client.session.delete({ path: { id } });
    } catch {
      // Session may already be deleted
    }
  }
}
