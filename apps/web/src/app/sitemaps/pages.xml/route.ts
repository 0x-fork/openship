import { SITE_URL, buildUrlset, xmlResponse, type SitemapEntry } from "@/lib/sitemap-builder";
import { getMarketplaceApps } from "@/lib/app-catalog";

export const dynamic = "force-static";
export const revalidate = 3600;

export async function GET() {
  const now = new Date();
  const entries: SitemapEntry[] = [
    { loc: `${SITE_URL}/`,         lastmod: now, changefreq: "daily",   priority: 1.0  },
    { loc: `${SITE_URL}/pricing`,  lastmod: now, changefreq: "weekly",  priority: 0.95 },
    { loc: `${SITE_URL}/mail`,     lastmod: now, changefreq: "weekly",  priority: 0.90 },
    { loc: `${SITE_URL}/apps`,     lastmod: now, changefreq: "weekly",  priority: 0.90 },
    { loc: `${SITE_URL}/download`, lastmod: now, changefreq: "weekly",  priority: 0.90 },
    { loc: `${SITE_URL}/docs`,     lastmod: now, changefreq: "weekly",  priority: 0.90 },
    { loc: `${SITE_URL}/resources`, lastmod: now, changefreq: "daily",  priority: 0.85 },
    { loc: `${SITE_URL}/privacy`,  lastmod: now, changefreq: "yearly",  priority: 0.30 },
    { loc: `${SITE_URL}/terms`,    lastmod: now, changefreq: "yearly",  priority: 0.30 },
    { loc: `${SITE_URL}/support`,  lastmod: now, changefreq: "monthly", priority: 0.60 },
    { loc: `${SITE_URL}/contact`,  lastmod: now, changefreq: "monthly", priority: 0.40 },
  ];
  entries.push(...(await getMarketplaceApps()).map(app => ({
    loc: `${SITE_URL}/apps/${app.id}`, changefreq: "weekly" as const, priority: 0.75,
  })));
  return xmlResponse(buildUrlset(entries));
}
