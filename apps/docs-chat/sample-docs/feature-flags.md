# Feature flags

Flags are managed in PostHog. The app reads them through `useFlag()` on the client and `getFlag()` on the server (both in `packages/flags`).

## Adding a flag

1. Create the flag in PostHog. Name it `kebab-case`, prefixed with the team: `checkout-new-address-form`.
2. Add it to the `FLAGS` object in `packages/flags/src/flags.ts` with a default value. The default is used when PostHog is unreachable, so it should be the safe option (usually `false`).
3. Use it:

```tsx
const showNewForm = useFlag("checkout-new-address-form");
```

Server components and route handlers use `await getFlag("checkout-new-address-form", { userId })`.

## Local overrides

Set `FLAGS_OVERRIDE` in `.env.local` to force values locally:

```
FLAGS_OVERRIDE=checkout-new-address-form=true,search-v2=false
```

Overrides only work when `NODE_ENV` is not `production`.

## Removing a flag

Flags older than 60 days show up in the weekly flag report in #frontend. Remove the code paths first, deploy, then delete the flag in PostHog. Deleting it in PostHog first makes every client fall back to the default, which is fine if the default is the old behavior and surprising if it isn't.
