/**
 * Milestone 9 — Server-Sent Events automated tests
 *
 * Tests:
 *  1. SSE endpoint returns correct content-type (text/event-stream)
 *  2. Connection stays open
 *  3. Events broadcast correctly to a connected client
 *  4. Multiple clients each receive the broadcast
 */

import http from "http";
import { type AddressInfo } from "net";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import supertest from "supertest";
import app from "../app.js";

/***
 * Helpers
 */

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Opens a raw HTTP connection to the SSE endpoint and resolves as soon as the
 * response headers arrive (i.e. without waiting for the body to end).
 * `receivedChunks` is mutated in-place as data arrives.
 */
function connectToSSE(
  port: number,
  cookie: string,
  gameId?: number,
): Promise<{
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  receivedChunks: string[];
  abort: () => void;
}> {
  return new Promise((resolve, reject) => {
    const path = gameId !== undefined ? `/api/sse?gameId=${String(gameId)}` : "/api/sse";
    const receivedChunks: string[] = [];

    const req = http.request(
      {
        hostname: "localhost",
        port,
        path,
        method: "GET",
        headers: { Cookie: cookie },
      },
      (res) => {
        res.on("data", (chunk: Buffer) => {
          receivedChunks.push(chunk.toString());
        });

        resolve({
          statusCode: res.statusCode ?? 0,
          headers: res.headers,
          receivedChunks,
          abort: () => req.destroy(),
        });
      },
    );

    req.on("error", (err: NodeJS.ErrnoException) => {
      // Ignore the ECONNRESET that fires when we call abort()
      if (err.code !== "ECONNRESET") {
        reject(err);
      }
    });

    req.end();
  });
}

/**
 * Test startup
 * start server and create an authenticated session
 */

const TEST_EMAIL = `sse-test-$String({Date.now())}@example.com`;
const TEST_PASSWORD = "password123";

let server: http.Server;
let port: number;
let sessionCookie: string;
let sessionCookie2: string;

beforeAll(async () => {
  server = app.listen(0);
  port = (server.address() as AddressInfo).port;

  // Register test user
  await supertest(server)
    .post("/auth/register")
    .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

  // Login — first session
  const login1 = await supertest(server)
    .post("/auth/login")
    .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

  const cookies1 = login1.headers["set-cookie"] as string[] | string | undefined;
  sessionCookie = Array.isArray(cookies1) ? (cookies1[0] ?? "") : (cookies1 ?? "");

  // Login again — second session (same user, second SSE client)
  const login2 = await supertest(server)
    .post("/auth/login")
    .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

  const cookies2 = login2.headers["set-cookie"] as string[] | string | undefined;
  sessionCookie2 = Array.isArray(cookies2) ? (cookies2[0] ?? "") : (cookies2 ?? "");
});

afterAll(() => {
  server.close();
});

/**
 * Tests
 */

describe("SSE endpoint", () => {
  it("returns correct content-type (text/event-stream)", async () => {
    const conn = await connectToSSE(port, sessionCookie);
    expect(conn.statusCode).toBe(200);
    expect(conn.headers["content-type"]).toContain("text/event-stream");
    conn.abort();
  });

  it("connection stays open", async () => {
    const conn = await connectToSSE(port, sessionCookie);

    // Wait 200 ms — a closed connection would have received nothing further
    // after the handshake comment, but an open one just sits there streaming.
    await delay(200);

    expect(conn.statusCode).toBe(200);
    // Only the handshake keep-alive comment should have arrived so far
    const received = conn.receivedChunks.join("");
    expect(received).toBe(":ok\n\n");

    conn.abort();
  });

  it("events broadcast correctly to a connected client", async () => {
    const conn = await connectToSSE(port, sessionCookie);

    // Wait for the :ok handshake to land
    await delay(50);

    // Action goes UP via HTTP POST; state comes DOWN via SSE
    await supertest(server)
      .post("/api/sse/broadcast")
      .set("Cookie", sessionCookie)
      .send({ type: "test", message: "hello-sse" })
      .expect(200);

    // Wait for the event to propagate through the stream
    await delay(50);

    const received = conn.receivedChunks.join("");
    expect(received).toContain("hello-sse");

    conn.abort();
  });

  it("multiple clients each receive the broadcast", async () => {
    const conn1 = await connectToSSE(port, sessionCookie);
    const conn2 = await connectToSSE(port, sessionCookie2);

    await delay(50);

    await supertest(server)
      .post("/api/sse/broadcast")
      .set("Cookie", sessionCookie)
      .send({ type: "test", message: "multi-client" })
      .expect(200);

    await delay(50);

    expect(conn1.receivedChunks.join("")).toContain("multi-client");
    expect(conn2.receivedChunks.join("")).toContain("multi-client");

    conn1.abort();
    conn2.abort();
  });
});
