<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Demo seed

Preview and local backends share `seed:seedDemoData` (login + babies in every
status, plus `test+newuser@example.com` with no babies) plus
`homepageDemo:refresh` once per locale (the public live-demo pages
linked from the homepage). Those babies are stored with `demo: true`; the
refresh mutation refuses to wipe any baby missing that flag (except grandfathering
the existing sentinel-owned Juniper Hale row). Production deploys refresh every
locale demo on each build: dates shift to now and visitor comments are wiped.
When opening PRs, follow the root
[`AGENTS.md`](../../../AGENTS.md) and link each seeded baby on the Vercel preview.
