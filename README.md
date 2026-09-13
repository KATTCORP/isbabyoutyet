mainly vibe coded

## dev setup

### install

```sh
pnpm install
```

### development

```sh
pnpm dev
```

Local and Vercel preview backends are seeded with a demo login:

- email: `test@example.com`
- password: `password`

That account owns babies in every status (waiting, labour, hospital, born). Re-run with `pnpm --filter @baby-outlet/backend seed` (idempotent). Wipe the local anonymous Convex DB with `pnpm reset-dev`, then run `pnpm dev` to provision and seed again.

The homepage also links to a locale-specific public live demo (Juniper Hale, Willow Brooks, Ella Holm, Lucía Navarro, or Helena Costa) seeded in every environment, including production. Production deploys refresh their dates and wipe visitor comments.

Demo photos live in Git LFS (`projects/baby-outlet/backend/assets/homepage-demo/`). Vercel: enable Git LFS in the project Git settings so production/preview builds receive the actual images.
