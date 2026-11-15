import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SERVER_DEADLINE_MS, TILES_DEADLINE_MS, withDeadline } from "./deadline.ts";

describe("withDeadline", () => {
  it("adds a time limit to a server call that has none", () => {
    const init = withDeadline(undefined, SERVER_DEADLINE_MS, true);
    assert.ok(init?.signal instanceof AbortSignal);
    assert.equal(init.signal.aborted, false);
  });
  it("keeps the other options when it adds the limit", () => {
    const init = withDeadline({ method: "GET", headers: { a: "b" } }, SERVER_DEADLINE_MS, true);
    assert.equal(init?.method, "GET");
    assert.deepEqual(init?.headers, { a: "b" });
    assert.ok(init?.signal);
  });
  it("leaves a caller's own signal alone", () => {
    const own = AbortSignal.timeout(TILES_DEADLINE_MS);
    assert.equal(withDeadline({ signal: own }, SERVER_DEADLINE_MS, true)?.signal, own);
  });
  it("adds nothing in the browser, where the browser and the caller manage their own requests", () => {
    assert.equal(withDeadline(undefined, SERVER_DEADLINE_MS, false), undefined);
  });
  it("really stops a call that never answers", async () => {
    const { createServer } = await import("node:http");
    const server = createServer(() => {
      /* never answers */
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as { port: number }).port;
    const started = Date.now();
    await assert.rejects(fetch(`http://127.0.0.1:${port}/`, withDeadline(undefined, 150, true)));
    assert.ok(Date.now() - started < 2000);
    server.closeAllConnections();
    server.close();
  });
});
