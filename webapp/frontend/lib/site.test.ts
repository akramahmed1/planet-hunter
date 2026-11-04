import assert from "node:assert/strict";
import { test } from "node:test";
import { siteUrl } from "./site.ts";

test("an explicit site URL wins, and a bare host gets https", () => {
  assert.equal(siteUrl({ NEXT_PUBLIC_SITE_URL: "https://planethunter.example", RAILWAY_PUBLIC_DOMAIN: "x.up.railway.app" }).origin, "https://planethunter.example");
  assert.equal(siteUrl({ NEXT_PUBLIC_SITE_URL: "planethunter.example" }).origin, "https://planethunter.example");
});

test("the Railway public domain is used over https when no explicit URL is set", () => {
  assert.equal(siteUrl({ RAILWAY_PUBLIC_DOMAIN: "frontend-staging-5fce.up.railway.app" }).origin, "https://frontend-staging-5fce.up.railway.app");
});

test("blank values are ignored", () => {
  assert.equal(siteUrl({ NEXT_PUBLIC_SITE_URL: " ", RAILWAY_PUBLIC_DOMAIN: "a.up.railway.app" }).origin, "https://a.up.railway.app");
});

test("local work and CI fall back to localhost", () => {
  assert.equal(siteUrl({}).origin, "http://localhost:3000");
});

test("on Railway with no address the build fails rather than shipping localhost", () => {
  assert.throws(() => siteUrl({ RAILWAY_ENVIRONMENT_NAME: "production" }), /NEXT_PUBLIC_SITE_URL/);
});
