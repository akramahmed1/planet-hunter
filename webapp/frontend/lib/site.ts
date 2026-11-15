// The public address of the site, used as `metadataBase` so share cards (og:image, twitter:image)
// point at the real site and never at localhost when deployed.
//
// Order: NEXT_PUBLIC_SITE_URL (explicit), then RAILWAY_PUBLIC_DOMAIN (set by Railway), then
// http://localhost:3000 for local work and CI only. On Railway with neither set there is no safe
// guess, so this throws and the build fails instead of shipping localhost share cards.
type Env = Record<string, string | undefined>;

export function siteUrl(env: Env = process.env): URL {
  const explicit = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return new URL(/^https?:\/\//i.test(explicit) ? explicit : `https://${explicit}`);
  const domain = env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (domain) return new URL(`https://${domain}`);
  if (env.RAILWAY_ENVIRONMENT_NAME) {
    throw new Error(
      "Set NEXT_PUBLIC_SITE_URL (or give the service a public domain): share cards need the real site address.",
    );
  }
  return new URL("http://localhost:3000");
}
