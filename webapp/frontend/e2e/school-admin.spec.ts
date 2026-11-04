import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// T27: a school admin sees the whole school (teachers, classes, totals), can change roles and make a new join code.
// The data rules are tested in the backend; this is what an admin and a plain teacher actually see.

const unique = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
const H = { "x-ph-csrf": "1" };

test("an admin sees the school, changes a role, is stopped from leaving no admin, and renews the join code", async ({ browser }) => {
  test.setTimeout(120_000);
  const actx = await browser.newContext({ locale: "en-US" });
  const a = actx.request;
  await a.post("/api/v2/auth/teacher/signup", { headers: H, data: { email: `adm${unique()}@school.example`, password: "correct horse battery",
    display_name: "Ada Admin", birth_month: 3, birth_year: 1985, org_name: `Admin High ${unique()}` } });
  const me = (await (await a.get("/api/v2/auth/me")).json()).me;
  const org = me.orgs[0].org_id;
  const detail = await (await a.get(`/api/v2/orgs/${org}`)).json();
  await a.post(`/api/v2/orgs/${org}/classes`, { headers: H, data: { name: "Admin Physics" } });

  const bctx = await browser.newContext({ locale: "en-US" });
  await bctx.request.post("/api/v2/auth/teacher/signup", { headers: H, data: { email: `bee${unique()}@school.example`, password: "correct horse battery",
    display_name: "Bee Teacher", birth_month: 3, birth_year: 1985, org_code: detail.join_code } });
  await bctx.request.post(`/api/v2/orgs/${org}/classes`, { headers: H, data: { name: "Bee Chemistry" } });

  const page = await actx.newPage();
  await page.goto("/classroom");
  await page.getByTestId("school-overview-link").click();
  await expect(page).toHaveURL(new RegExp(`/classroom/school/${org}$`));
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Admin High");
  await expect(page.getByTestId("tot-teachers")).toHaveText("2");
  await expect(page.getByTestId("tot-classes")).toHaveText("2");
  await expect(page.getByTestId("tot-students")).toHaveText("0");
  await expect(page.getByTestId("teacher-row")).toHaveCount(2);
  await expect(page.getByTestId("teacher-row").first()).toContainText("Ada Admin");
  await expect(page.getByTestId("class-row").filter({ hasText: "Bee Chemistry" })).toContainText("Bee Teacher");
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
  const width = page.viewportSize()!.width;
  expect(await page.evaluate((w) => [...document.querySelectorAll("main *")].filter((e) => e.getBoundingClientRect().right > w + 1).length, width)).toBe(0);

  // The only admin cannot demote themselves.
  const mine = page.getByTestId("teacher-row").filter({ hasText: "Ada Admin" }).getByTestId("role-select");
  await mine.selectOption("teacher");
  await expect(page.getByTestId("role-error")).toContainText("at least one admin");
  await expect(mine).toHaveValue("org_admin");

  // Promote Bee: now two admins.
  const bee = page.getByTestId("teacher-row").filter({ hasText: "Bee Teacher" }).getByTestId("role-select");
  await bee.selectOption("org_admin");
  await expect(bee).toHaveValue("org_admin");

  // A new join code differs from the old one.
  await page.getByTestId("new-code-button").click();
  const fresh = (await page.getByTestId("new-code").textContent())!.trim();
  expect(fresh).toMatch(/^[A-Z2-9]{8}$/);
  expect(fresh).not.toBe(detail.join_code);
  await actx.close();
  await bctx.close();
});

test("a teacher who is not an admin, and a stranger, are told plainly", async ({ browser }) => {
  const actx = await browser.newContext({ locale: "en-US" });
  await actx.request.post("/api/v2/auth/teacher/signup", { headers: H, data: { email: `adm${unique()}@school.example`, password: "correct horse battery",
    display_name: "Ada Two", birth_month: 3, birth_year: 1985, org_name: `Admin Two ${unique()}` } });
  const org = (await (await actx.request.get("/api/v2/auth/me")).json()).me.orgs[0].org_id;
  const code = (await (await actx.request.get(`/api/v2/orgs/${org}`)).json()).join_code;

  const plain = await browser.newContext({ locale: "en-US" });
  await plain.request.post("/api/v2/auth/teacher/signup", { headers: H, data: { email: `pl${unique()}@school.example`, password: "correct horse battery",
    display_name: "Plain Teacher", birth_month: 3, birth_year: 1985, org_code: code } });
  const p = await plain.newPage();
  await p.goto(`/classroom/school/${org}`);
  await expect(p.getByTestId("school-forbidden")).toHaveText("Only a school admin can see this page.");
  await expect(p.getByTestId("school-overview-link")).toHaveCount(0);

  const other = await browser.newContext({ locale: "en-US" });
  await other.request.post("/api/v2/auth/teacher/signup", { headers: H, data: { email: `ot${unique()}@school.example`, password: "correct horse battery",
    display_name: "Other Teacher", birth_month: 3, birth_year: 1985, org_name: `Other School ${unique()}` } });
  const o = await other.newPage();
  await o.goto(`/classroom/school/${org}`);
  await expect(o.getByTestId("school-missing")).toBeVisible();
  for (const c of [actx, plain, other]) await c.close();
});
