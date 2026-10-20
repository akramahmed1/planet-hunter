import { expect, test } from "@playwright/test";
import { CANDIDATES, ROUTES } from "./routes";

test("every route has its own title and description, and the shared images and icon are served", async ({ page, request }, info) => {
  test.skip(info.project.name !== "desktop", "one pass is enough");
  const titles = new Map<string, string>();
  const descs = new Map<string, string>();
  for (const route of [...ROUTES, `/candidates/${CANDIDATES[1].slug}`, "/exoplanets/toi-270"]) {
    await page.goto(route);
    const title = await page.title();
    const desc = (await page.locator('meta[name="description"]').getAttribute("content")) ?? "";
    expect(title, `title of ${route}`).toMatch(/ - Planet Hunter$|^Planet Hunter - /);
    expect(title, `${route} reuses the title of ${titles.get(title)}`).not.toContain("undefined");
    // /scan/N is the only dynamic route that may share a title family.
    expect(titles.has(title), `${route} has the same title as ${titles.get(title)}`).toBe(false);
    expect(descs.has(desc), `${route} has the same description as ${descs.get(desc)}`).toBe(false);
    titles.set(title, route);
    descs.set(desc, route);
    expect(await page.locator('meta[property="og:image"]').count(), `og:image on ${route}`).toBeGreaterThan(0);
    expect(await page.locator('meta[name="twitter:image"]').count(), `twitter:image on ${route}`).toBeGreaterThan(0);
  }
  for (const href of await page.locator('link[rel~="icon"], link[rel="apple-touch-icon"]').evaluateAll((l) => l.map((x) => (x as HTMLLinkElement).href))) {
    expect((await request.get(href)).status(), href).toBe(200);
  }
  expect((await request.get("/icon.svg")).status()).toBe(200);
});
