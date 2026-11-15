import type { MetadataRoute } from "next";
import { sitemapEntries } from "@/lib/indexing";
import { siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries(siteUrl().origin);
}
