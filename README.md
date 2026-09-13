mainly vibe coded

## dev setup

Requires **Node.js 24** ([`.nvmrc`](.nvmrc)).

### install

```sh
pnpm install
```

### development

```sh
pnpm dev
```

Local and Vercel preview backends are seeded with demo logins:

- email: `test@example.com` / password: `password` — owns babies in every status (waiting, labour, hospital, born)
- email: `test+newuser@example.com` / password: `password` — empty dashboard / first-run tour
- email: `test+coparent@example.com` / password: `password` — co-parent on Milo (`/baby/baby-born`)

Re-run with `pnpm --filter @baby-outlet/backend seed` (idempotent). Wipe the local anonymous Convex DB with `pnpm reset-dev`, then run `pnpm dev` to provision and seed again.

The homepage also links to a locale-specific public live demo (Juniper Hale, Willow Brooks, Ella Holm, Lucía Navarro, or Helena Costa) seeded in every environment, including production. Production deploys refresh their dates and wipe visitor comments.

Demo photos live in Git LFS (`projects/baby-outlet/backend/assets/homepage-demo/`). Vercel: enable Git LFS in the project Git settings so production/preview builds receive the actual images.

Password-reset mail is React Email in `@workspace/email`. `pnpm dev` also starts the template preview at http://localhost:3333. Local Convex logs instead of sending.
