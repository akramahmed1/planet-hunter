import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

// Test hook for the error page (e2e/errors.spec.ts). It throws only when the test run sets
// PH_ERROR_TEST=1; everywhere else (staging, production) it is an ordinary 404.
export default function ErrorCheck() {
  if (process.env.PH_ERROR_TEST !== "1") notFound();
  throw new Error("deliberate error for the error page test");
}
