# Getting started

This is the web app monorepo: the customer-facing Next.js app (`apps/web`), the admin panel (`apps/admin`) and shared packages under `packages/`.

## Requirements

- Node 22 (use `nvm use`, there's an `.nvmrc`)
- pnpm 9
- Docker, for the local Postgres and Redis

## First run

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
docker compose up -d db redis
pnpm db:migrate
pnpm db:seed
pnpm dev --filter web
```

The app runs on http://localhost:3000. The seed creates a test user `dev@example.com` with password `devpassword`.

## Environment variables

Most variables have working defaults in `.env.example`. The ones you need to fill in yourself:

- `STRIPE_SECRET_KEY` - use the test key from 1Password, vault "Engineering"
- `NEXT_PUBLIC_POSTHOG_KEY` - optional locally, analytics are disabled without it

Never commit `.env.local`. CI will fail the build if it finds a file matching `.env*.local`.

## Common problems

### Port 5432 already in use

You probably have a local Postgres running outside Docker. Either stop it (`brew services stop postgresql`) or change the port mapping in `docker-compose.override.yml`.

### Prisma client out of date

If you see `PrismaClientInitializationError` after pulling, run `pnpm db:generate`. It runs on `postinstall` but not when the schema changes without new dependencies.
