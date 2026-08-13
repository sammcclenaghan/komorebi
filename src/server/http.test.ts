import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "./http";

describe("HTTP process boundary", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    server = createServer({ host: "127.0.0.1", port: 0 });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  });

  it("reports liveness without initializing optional dependencies", async () => {
    const response = await fetch(`${baseUrl}/health/live`, {
      headers: { "X-Request-Id": "health-test-1" }
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("health-test-1");
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("rejects malformed JSON as a client error", async () => {
    const response = await fetch(`${baseUrl}/api/goals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{"
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Request body must be valid JSON."
    });
  });

  it("rejects request bodies larger than one MiB", async () => {
    const response = await fetch(`${baseUrl}/api/goals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(1024 * 1024) })
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "Request body exceeds the 1048576-byte limit."
    });
  });
});
