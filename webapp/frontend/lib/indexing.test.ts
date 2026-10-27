import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { indexingOpen, PRIVATE_PREFIXES, PUBLIC_PATHS, robotsRules, sitemapEntries } from "./indexing.ts";

const ORIGIN = "https://planethunter.example";

describe("indexing", () => {
  it("is closed unless ALLOW_INDEXING is exactly 1", () => {
    assert.equal(indexingOpen({}), false);
    assert.equal(indexingOpen({ ALLOW_INDEXING: "true" }), false);
    assert.equal(indexingOpen({ ALLOW_INDEXING: "0" }), false);
    assert.equal(indexingOpen({ ALLOW_INDEXING: "1" }), true);
  });

  it("closed: robots disallows everything and the sitemap is empty", () => {
    assert.deepEqual(robotsRules(ORIGIN, {}), { rules: [{ userAgent: "*", disallow: "/" }] });
    assert.deepEqual(sitemapEntries(ORIGIN, {}), []);
  });

  it("open: robots allows the site, hides account pages and names the sitemap", () => {
    const r = robotsRules(ORIGIN, { ALLOW_INDEXING: "1" });
    assert.equal(r.sitemap, "https://planethunter.example/sitemap.xml");
    assert.deepEqual(r.rules[0].disallow, PRIVATE_PREFIXES);
    for (const p of ["/classroom", "/my-scans", "/my-watchlist", "/api/", "/scan/"]) assert.ok(PRIVATE_PREFIXES.includes(p), p);
  });

  it("open: the sitemap lists public pages only, on the real origin", () => {
    const urls = sitemapEntries(ORIGIN, { ALLOW_INDEXING: "1" }).map((e) => e.url);
    assert.equal(urls.length, PUBLIC_PATHS.length);
    const parsed = urls.map((u) => new URL(u));
    assert.ok(parsed.every((u) => u.origin === new URL(ORIGIN).origin));
    const paths = parsed.map((u) => u.pathname);
    assert.ok(!paths.some((p) => /classroom|my-|alerts|welcome|scan\//.test(p)));
    assert.ok(paths.includes("/"));
  });
});
