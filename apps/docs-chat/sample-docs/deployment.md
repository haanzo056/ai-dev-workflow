# Deployment

We deploy with GitHub Actions to Vercel (web, admin) and Fly.io (worker). Every merge to `main` deploys to staging automatically. Production deploys are manual.

## Staging

Merging to `main` triggers the `deploy-staging` workflow. It runs migrations against the staging database first, then deploys. Staging is at https://staging.example.internal.

If the migration step fails, the deploy is skipped and the workflow posts in #deploys. Fix forward; don't edit migrations that already ran on staging.

## Production

1. Make sure the commit you want is green on staging for at least 30 minutes.
2. Run the `deploy-production` workflow from the Actions tab and pick the commit SHA.
3. Someone from the on-call rotation has to approve the workflow run.
4. Watch the error rate dashboard in Grafana for 15 minutes after the deploy.

Production deploys are frozen from Friday 15:00 until Monday 10:00 unless it's a hotfix approved by the on-call lead.

## Rollback

For web and admin, use "Instant Rollback" in the Vercel dashboard to promote the previous deployment. This takes about a minute and does not touch the database.

For the worker, run:

```bash
fly releases -a acme-worker
fly deploy -a acme-worker --image registry.fly.io/acme-worker:<previous-release-tag>
```

If a migration is the problem, rolling back the code is not enough. Write a new migration that reverts the change and deploy it through the normal flow. We don't run down-migrations in production.

## Database migrations

Migrations live in `packages/db/prisma/migrations`. Rules:

- Every migration must be backwards compatible with the currently deployed code, because migrations run before the new code is live.
- Renaming a column takes two deploys: add the new column and write to both, then remove the old one in a later release.
- Big backfills go in a worker job, not in the migration.
