# Testing

## Unit tests

Vitest, colocated as `*.test.ts(x)` next to the code. Run everything with `pnpm test`, or one package with `pnpm test --filter web`.

React components use Testing Library. Prefer queries by role and label over test ids. Mock network with MSW handlers from `packages/test-utils/msw`; don't mock `fetch` directly.

## End-to-end tests

Playwright, in `apps/web/e2e`. They run against a production build with a seeded database:

```bash
pnpm e2e:setup   # builds, seeds a separate e2e database
pnpm e2e         # runs headless
pnpm e2e --ui    # interactive mode
```

E2E tests run on every PR but only for the Chromium project. The full browser matrix runs nightly.

### Flaky tests

If a test is flaky, mark it with `test.fixme()` and open an issue with the `flaky-test` label in the same PR. Don't add retries to individual tests; the global retry count in CI is 1 and that's intentional.

## Coverage

We don't enforce a coverage percentage. New route handlers and anything touching payments need tests; reviewers will ask for them.
