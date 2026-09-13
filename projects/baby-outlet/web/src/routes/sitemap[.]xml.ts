import { createFileRoute } from "@tanstack/react-router";
import { HOMEPAGE_DEMO_BABIES } from "@baby-outlet/backend/src/seedCredentials";
import { SUPPORTED_LOCALES } from "@baby-outlet/backend/src/i18n";
import { CANONICAL_ORIGIN } from "@/lib/site-url";

function sitemapXml() {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: `${CANONICAL_ORIGIN}/`, changefreq: "weekly", priority: "1.0" },
    ...SUPPORTED_LOCALES.map((locale) => {
      const publicId = HOMEPAGE_DEMO_BABIES[locale].publicId;
      return {
        loc: `${CANONICAL_ORIGIN}/baby/${publicId}`,
        changefreq: "daily",
        priority: "0.8",
      };
    }),
  ];

  const body = urls
    .map(
      (entry) => `  <url>
    <loc>${entry.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: () =>
        new Response(sitemapXml(), {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
          },
        }),
    },
  },
});
