# Agent notes

## Convex

When working under `projects/baby-outlet/backend/`, also follow
[`projects/baby-outlet/backend/AGENTS.md`](projects/baby-outlet/backend/AGENTS.md).

## Pull requests

Fill every section in [`.github/pull_request_template.md`](.github/pull_request_template.md).
For stacked PRs, also follow
[`.agents/skills/create-stacked-prs/SKILL.md`](.agents/skills/create-stacked-prs/SKILL.md).

### Screenshots and video

- Every PR includes the `## Screenshots / video` section from the template.
- For user-visible UI changes, attach screenshots of the important final states.
  Use before/after screenshots when the difference is not obvious from the final
  state alone.
- For interactions, animations, or multi-step flows, attach a short video that
  starts immediately before the demonstration and ends immediately after it.
- Use the smallest artifact set that proves the change. Do not include failed
  runs, setup steps, stale UI, redundant captures, or sensitive data.
- Capture artifacts from the final tested preview revision and remove references
  to superseded artifacts when the UI changes.
- If visual evidence is not applicable, write `None — <brief reason>` instead of
  omitting the section.
