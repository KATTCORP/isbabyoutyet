import {
  HOMEPAGE_DEMO_BABIES,
  isHomepageDemoPublicId,
} from "@baby-outlet/backend/src/seedCredentials";
import { SUPPORTED_LOCALES } from "@baby-outlet/backend/src/i18n";
import { CANONICAL_ORIGIN } from "@/lib/site-url";

/**
 * Crawlers that collect web text for model training (not ordinary search).
 * Each needs its own User-agent group — they do not honour `User-agent: *`
 * or `noai` meta tags.
 */
const AI_TRAINING_USER_AGENTS = [
  "GPTBot",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  "ClaudeBot",
  "anthropic-ai",
  "Amazonbot",
  "Bytespider",
  "cohere-ai",
  "Diffbot",
  "FacebookBot",
  "meta-externalagent",
  "meta-externalfetcher",
  "PerplexityBot",
  "YouBot",
  "Timpibot",
  "Webzio-Extended",
  "ImagesiftBot",
  "Omgilibot",
  "omgili",
  "PetalBot",
  "DuckAssistBot",
  "AI2Bot",
] as const;

function homepageDemoBabyPaths() {
  return SUPPORTED_LOCALES.map((locale) => `/baby/${HOMEPAGE_DEMO_BABIES[locale].publicId}`);
}

export function isIndexableBabyPublicId(publicId: string) {
  return isHomepageDemoPublicId(publicId);
}

export function aiNoTrainMeta() {
  return [{ name: "robots", content: "noai, noimageai" }];
}

export function searchRobotsMeta(opts: { index: boolean }) {
  if (opts.index) {
    return [
      { name: "robots", content: "index, follow, noai, noimageai" },
      { name: "googlebot", content: "index, follow" },
    ];
  }
  return [
    { name: "robots", content: "noindex, nofollow, noai, noimageai" },
    { name: "googlebot", content: "noindex, nofollow" },
  ];
}

export function aiNoTrainHeaders() {
  return { "X-Robots-Tag": "noai, noimageai" };
}

export function noIndexHeaders() {
  return { "X-Robots-Tag": "noindex, nofollow, noai, noimageai" };
}

export function babyPageRobotsHeaders(publicId: string) {
  if (!isIndexableBabyPublicId(publicId)) {
    return noIndexHeaders();
  }
  return {};
}

export function robotsTxt() {
  const demoAllows = homepageDemoBabyPaths()
    .flatMap((path) => [`Allow: ${path}`, `Allow: /og${path}`])
    .join("\n");

  const aiBlocks = AI_TRAINING_USER_AGENTS.map((agent) => `User-agent: ${agent}\nDisallow: /`).join(
    "\n\n",
  );

  return `# Search engines may index the marketing homepage and live demo baby pages.
# Real family baby pages stay out of the index.
User-agent: *
Allow: /
Disallow: /auth/
Disallow: /dashboard/
Disallow: /api/
Disallow: /demo/
Disallow: /preview
Disallow: /baby/
Disallow: /og/baby/
${demoAllows}

Sitemap: ${CANONICAL_ORIGIN}/sitemap.xml

# Model-training crawlers — no page on this site.
${aiBlocks}
`;
}
