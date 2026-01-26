import type { OpencodeClient } from "@opencode-ai/sdk";

export async function waitForSessionIdle(
  client: OpencodeClient,
  sessionId: string,
  projectDir: string,
  timeoutMs: number = 60000
): Promise<void> {
  // Try SSE-based approach first
  try {
    return await waitForSessionIdleSSE(client, sessionId, projectDir, timeoutMs);
  } catch (sseError) {
    console.warn("SSE approach failed, falling back to polling:", sseError);
    return await waitForSessionIdlePoll(client, sessionId, projectDir, timeoutMs);
  }
}

async function waitForSessionIdleSSE(
  client: OpencodeClient,
  sessionId: string,
  projectDir: string,
  timeoutMs: number
): Promise<void> {
  // First check if already idle
  const currentStatus = await client.session.status({
    query: { directory: projectDir },
  });
  if (currentStatus.data?.[sessionId]?.type === "idle") return;

  const result = await client.event.subscribe({
    query: { directory: projectDir },
  });

  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      // Explicitly close the SSE stream on timeout to prevent resource leak
      result.stream.return?.();
      reject(new Error(`Session ${sessionId} did not become idle within ${timeoutMs}ms`));
    }, timeoutMs);

    (async () => {
      for await (const event of result.stream) {
        // event is an Event union type
        if (
          "type" in event &&
          event.type === "session.idle" &&
          "properties" in event &&
          (event as any).properties?.sessionID === sessionId
        ) {
          clearTimeout(timeout);
          // Explicitly close the SSE stream after receiving the target event
          result.stream.return?.();
          resolve();
          return;
        }
      }
    })().catch((err) => {
      clearTimeout(timeout);
      result.stream.return?.();
      reject(err);
    });
  });
}

async function waitForSessionIdlePoll(
  client: OpencodeClient,
  sessionId: string,
  projectDir: string,
  timeoutMs: number
): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const allStatuses = await client.session.status({
      query: { directory: projectDir },
    });
    // allStatuses.data is { [sessionId: string]: SessionStatus }
    const status = allStatuses.data?.[sessionId];
    if (status?.type === "idle") return;
    // If type is "busy" or "retry", keep waiting
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error(`Session ${sessionId} did not become idle within ${timeoutMs}ms`);
}
