# API conventions

Route handlers live in `apps/web/app/api`. Server actions are fine for form submissions from our own UI; anything used by the mobile app or external integrations must be a route handler.

## Validation

Validate every request body with zod at the top of the handler. Use the shared `parseBody(schema, req)` helper, which returns a 400 with the zod issues when validation fails.

## Errors

Error responses always have this shape:

```json
{ "error": { "code": "not_found", "message": "Order not found" } }
```

`code` is a stable snake_case string that clients can switch on. `message` is for humans and can change. Don't return stack traces or database errors to the client; log them with `logger.error` and return a generic 500.

## Auth

Use `requireUser(req)` at the start of any handler that needs a logged-in user. It throws a 401 response if there's no session. For admin-only endpoints use `requireRole(req, "admin")`.

## Pagination

List endpoints use cursor pagination: `?cursor=<opaque>&limit=<n>`, max limit 100, default 20. Responses include `nextCursor`, which is `null` on the last page. Don't add offset pagination to new endpoints.

## Rate limiting

Public endpoints are rate limited per IP with the `rateLimit()` middleware (Upstash Redis). Default is 60 requests per minute. Auth endpoints use a stricter 10 per minute.
