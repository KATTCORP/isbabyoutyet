import {
  HOMEPAGE_DEMO_BABIES,
  isHomepageDemoPublicId,
} from "@isbabyoutyet/backend/src/seedCredentials";
import { SUPPORTED_LOCALES } from "@isbabyoutyet/backend/src/i18n";
import { CANONICAL_ORIGIN } from "@/lib/site-url";

/**
 * Crawlers that collect web text for model training (not ordinary search).
 * Each needs its own User-agent group — they do not honour `User-agent: *`.
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

function publicCrawlRules() {
  const demoAllows = homepageDemoBabyPaths()
    .flatMap((path) => [`Allow: ${path}`, `Allow: /og${path}`])
    .join("\n");

  return `Allow: /
Allow: /og
Disallow: /auth/
Disallow: /dashboard/
Disallow: /api/
Disallow: /demo/
Disallow: /preview
Disallow: /baby/
Disallow: /og/baby/
${demoAllows}`;
}

export function isIndexableBabyPublicId(publicId: string) {
  return isHomepageDemoPublicId(publicId);
}

export function searchRobotsMeta(opts: { index: boolean }) {
  if (opts.index) {
    return [
      { content: "index, follow", name: "robots" },
      { content: "index, follow", name: "googlebot" },
    ];
  }
  return [
    { content: "noindex, nofollow", name: "robots" },
    { content: "noindex, nofollow", name: "googlebot" },
  ];
}

export function noIndexHeaders() {
  return { "X-Robots-Tag": "noindex, nofollow" };
}

export function babyPageRobotsHeaders(publicId: string) {
  if (!isIndexableBabyPublicId(publicId)) {
    return noIndexHeaders();
  }
  return {};
}

export function robotsTxt() {
  const crawlRules = publicCrawlRules();
  const aiAllows = AI_TRAINING_USER_AGENTS.map(
    (agent) => `User-agent: ${agent}\n${crawlRules}`,
  ).join("\n\n");

  return `# Search engines and AI agents may index the marketing homepage and live demo baby pages.
# Real family baby pages stay out of the index.
User-agent: *
${crawlRules}

Sitemap: ${CANONICAL_ORIGIN}/sitemap.xml

# Model-training crawlers — same public paths as search engines.
${aiAllows}
`;
}
