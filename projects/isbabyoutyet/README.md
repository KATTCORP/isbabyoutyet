# Is Baby Out Yet?

Parents share a public page so friends and family can follow a baby's journey
and send encouragement. Live at [isbabyoutyet.com](https://isbabyoutyet.com).

| Path | Package | Role |
| --- | --- | --- |
| [`web/`](web/README.md) | `@isbabyoutyet/web` | TanStack Start app: routes, overlays, i18n, Vercel deploy |
| [`backend/`](backend/README.md) | `@isbabyoutyet/backend` | Convex schema and functions, migrations, demo seed |
| `email/` | `@isbabyoutyet/email` | React Email templates, compiled into the backend send path (preview with `pnpm email`) |

```sh
pnpm --filter '@isbabyoutyet/*' dev
```

The web app owns its Vite env files. The backend owns its Convex deployment and
that deployment's env vars. Other products get their own env and deployments;
they do not reuse these variables under a prefix.

## Demo logins

Local and preview backends seed these (password `password`):

- `test@example.com`: babies in every status
- `test+newuser@example.com`: empty dashboard and first-run tour
- `test+coparent@example.com`: co-parent on Milo (`/baby/baby-born`)

`pnpm --filter @isbabyoutyet/backend seed` re-seeds (idempotent).
`pnpm reset-dev` wipes the local anonymous Convex DB.

## Domain language

Use these terms in code, tests, and copy. Avoid the alternatives listed.

- **Baby page:** the shareable page tracking one baby from due date through
  birth. _Avoid:_ listing, profile, event.
- **Owner:** created the baby page. Only the owner can delete it or manage
  co-parents. _Avoid:_ creator, primary parent.
- **Co-parent:** authorized by the owner to post updates, change settings, and
  moderate encouragements, but not to delete the page or manage co-parents.
  _Avoid:_ administrator, collaborator, member.
- **Update:** a message and/or photo posted to the feed, optionally marking a
  milestone. _Avoid:_ post (as a noun), status update.
- **Milestone:** labour started, gone to hospital, or born, marked on an
  update.
- **Status:** the baby page's current stage, inferred from the latest marked
  milestones and never stored separately. _Avoid:_ state.
- **Encouragement:** a message a visitor leaves on a baby page. _Avoid:_
  comment, well-wish.
- **Soft delete:** marking a record deleted but recoverable. This is the
  default; hard deletes are not. _Avoid:_ archive.
- **Public ID:** the `/baby/{publicId}` slug. Previous slugs are kept so old
  links redirect, and staff transfers record who, when, and why.
  _Avoid:_ handle, vanity URL.
