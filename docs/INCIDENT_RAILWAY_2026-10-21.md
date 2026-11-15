# Railway security incident, 21 October 2026: what to do for Planet Hunter

Status: written 2026-10-21 from Railway's status page (screenshot from Akram). I could not open Railway's own security
notice from the build environment, so **read it first**: https://blog.railway.com/p/security-disclosure-wednesday-october-21st
Where this file and Railway's notice differ, follow Railway's notice and tell the assistant what it says.

## What the status page said (as seen at about 22:10 UTC)
- A "Railway Platform Outage / Major Outage": builds in all regions and the API affected.
- Railway published a security notice and strongly recommends **revoking all environment variables stored in Railway**,
  including API keys and private registry credentials, and **reviewing service logs for unusual activity**.
- Railway is rotating all bucket credentials. **Deployments are paused**, so services cannot be redeployed to pick up new
  credentials until builds are restored.

This is why staging stopped taking new commits: Railway paused builds. It was not caused by our code or settings.

## What this means for us (honest version)
- **No real user data is at risk, as far as I know.** Production has not been released (PR #18 is still unmerged), the
  Classroom is off in production, and staging holds only test accounts. Please confirm that production has no teacher or
  student accounts in it.
- **Secrets are the risk.** Anything stored as a Railway variable should be treated as possibly exposed until Railway says
  otherwise.
- **Do not release.** PR #18 stays unmerged until Railway says builds are restored and every secret below is rotated.

## Rotate these (tick them off; never paste a secret into the chat, set it only in the provider's console and Railway)
Rotate at the provider first (this makes the old value useless), then set the new value in Railway, then redeploy once
Railway allows it. Work through staging and production if both exist.

| Done | Secret (where it lives in Railway) | Rotate at | Notes |
|---|---|---|---|
| [ ] | `DATABASE_URL` and any Postgres password | Railway database settings | Railway may rotate it for you; follow their notice. Check the staging and production databases' recent logins. |
| [ ] | `NASA_API_KEY` | api.nasa.gov (request a new key) | Low risk, free, but rotate. |
| [ ] | `EXPLAINER_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` (whichever are set) | The AI provider's console | Highest cost risk: a stolen key can spend money. Also check the provider's usage page for spend you do not recognise, and keep the hard cap set there. |
| [ ] | `EMAIL_API_KEY` | Resend dashboard | Only if it was set. |
| [ ] | `STRIPE_*` keys and webhook secret (only if set) | Stripe dashboard (roll the keys and the webhook signing secret) | Test keys only while billing is off. |
| [ ] | `TOTP_ENCRYPTION_KEY` (only if set) | Do NOT change blindly | Changing it locks out teachers who turned on two-step sign-in. If it was never set, nothing to do. If it was set and exposed, tell the assistant first: the safe order is to ask enrolled teachers to turn two-step off, rotate, then turn on again. |
| [ ] | Any private registry or GitHub token connected to Railway | The service that issued it | Also review the Railway-to-GitHub connection (GitHub, Settings, Applications) and remove it if unsure. |
| [ ] | Railway account tokens and team API tokens | Railway, Account Settings, Tokens | Revoke any not in use. |
| [ ] | The Claude connector for Railway | claude.ai connector settings | Disconnect now; reconnect only after Railway says it is safe. The assistant holds no secret values. |

## Check for misuse
- [ ] Railway activity or audit log for anything you do not recognise (members, tokens, variable edits, deployments).
  The assistant made exactly one change in Railway: it set `CLASSROOM_ENABLED=1` on the staging backend.
- [ ] Service logs in Railway for unusual traffic or errors around 21 October.
- [ ] AI provider and Stripe dashboards for activity you do not recognise.
- [ ] GitHub, Settings, Security log for the `akramahmed1` account and the repository's deploy keys and Actions secrets.

## When Railway says builds are restored
1. Set the new variable values, redeploy staging, and confirm the Staging check workflow passes its first step.
2. Ask the assistant to run the full staging gate and report the real results.
3. Only then consider the release gate again (docs/HANDOVER.md). Residual risk to list for the written approval: hosting
   provider had a security incident, secrets were rotated on a date, no evidence of misuse found (or what was found).

## Option to think about (not decided)
Task T47 plans production Postgres and settings on Railway. After Railway's full report, decide whether to stay,
or to host production elsewhere. The assistant will not change hosting on its own.
