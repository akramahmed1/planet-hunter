// T46: the scan queue under load. Many people ask to scan the same star and read its status. The first request may
// create one job; every other request must return that same job (no pile of duplicates), reads must stay fast, and a
// bad star name must be refused with 422 every time. Nothing here can queue more than one new scan, so staging's
// worker and its 5-new-scans-per-hour limit are not used up. Run by .github/workflows/loadtest.yml.
import http from "k6/http";
import { check, sleep } from "k6";

const BACKEND = __ENV.BACKEND;
const JSON_HEADERS = { "Content-Type": "application/json", "X-PH-CSRF": "1" };

export const options = {
  stages: [
    { duration: "20s", target: 10 },
    { duration: "60s", target: 10 },
    { duration: "10s", target: 0 },
  ],
  thresholds: {
    checks: ["rate>0.99"],
    http_req_duration: ["p(95)<2000"],
  },
};

export function setup() {
  const first = http.post(`${BACKEND}/api/v2/scans`, JSON.stringify({ target: "TIC 150428135" }), { headers: JSON_HEADERS });
  if (first.status !== 202) throw new Error(`could not queue the first scan: ${first.status} ${first.body}`);
  return { id: first.json("id") };
}

export default function (data) {
  const again = http.post(`${BACKEND}/api/v2/scans`, JSON.stringify({ target: "150428135" }), { headers: JSON_HEADERS });
  check(again, {
    "asking again returns the same scan": (r) => r.status === 202 && r.json("id") === data.id && r.json("created") === false,
  });
  const status = http.get(`${BACKEND}/api/v2/scans/${data.id}`);
  check(status, { "status is readable": (r) => r.status === 200 });
  // 422 is the right answer here, so k6 must not count it as a failed request (it counts every 4xx as one by default).
  const bad = http.post(`${BACKEND}/api/v2/scans`, JSON.stringify({ target: "Proxima Centauri" }), {
    headers: JSON_HEADERS,
    responseCallback: http.expectedStatuses(422),
  });
  check(bad, { "a bad name is refused": (r) => r.status === 422 });
  sleep(0.5 + Math.random());
}
