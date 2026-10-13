# Planet Hunter frontend

Next.js (App Router, TypeScript) frontend for the planet-hunter exoplanet
transit detection demo. Candidate signals from public NASA TESS data. Never
discoveries.

## Run

```bash
npm install
npm run dev
```

Pages fetch from the backend at `NEXT_PUBLIC_API_BASE`
(default `http://127.0.0.1:8000`). All data pages use
`export const dynamic = "force-dynamic"` so they fetch at request time,
never at build time.

## Pages

- `/` - overview: "Candidate, not discovery" banner, TOI 700 c validation
  proof, stats, honesty note
- `/candidates` - sortable, filterable table of all 8 candidate signals
- `/candidates/[slug]` - detail view with numbers, readout, folded plot
- `/method` - pipeline steps, limitations, ExoMiner++ note, v2 roadmap

## Copy rules (hard)

- No em dashes or en dashes anywhere. Hyphens only.
- No claim of discovery anywhere. Unexplained signals are labeled
  "candidate" or "ambiguous".
- No emojis. No AI-marketing filler. Plain human language.
