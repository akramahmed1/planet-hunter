// T46: a gentle load test of the read endpoints that answer from the server's own data (no NASA calls), run by
// .github/workflows/loadtest.yml against staging. Ramps to 20 virtual people, holds, then ramps down.
// Pass criteria (any miss fails the run): fewer than 1% failed requests and 95% of requests under 1.5 seconds.
import http from "k6/http";
import { check, sleep } from "k6";

const BACKEND = __ENV.BACKEND;
const PATHS = [
  "/api/health",
  "/api/v2/health",
  "/api/overview",
  "/api/candidates",
  "/api/candidates/toi-700",
  "/api/v2/targets",
  "/api/v2/lessons",
  "/api/v2/lightcurves/toi-700",
  "/api/v2/periodogram/toi-700",
  "/api/v2/positions",
];

export const options = {
  stages: [
    { duration: "30s", target: 20 },
    { duration: "90s", target: 20 },
    { duration: "20s", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1500"],
  },
};

export default function () {
  const path = PATHS[Math.floor(Math.random() * PATHS.length)];
  const res = http.get(`${BACKEND}${path}`, { tags: { path } });
  check(res, { "status is 200": (r) => r.status === 200 });
  sleep(0.5 + Math.random());
}
