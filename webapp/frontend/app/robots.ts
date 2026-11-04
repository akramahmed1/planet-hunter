import type { MetadataRoute } from "next";
import { robotsRules } from "@/lib/indexing";
import { siteUrl } from "@/lib/site";

// Read the setting when asked, not when the site was built.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return robotsRules(siteUrl().origin);
}
