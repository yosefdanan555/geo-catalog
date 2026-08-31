# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run start:dev                  # build + run from dist/ with CONFIG_OFFLINE_MODE=true (needs a reachable Postgres+PostGIS)
npm start                          # build + run; expects a real @map-colonies config-server unless CONFIG_OFFLINE_MODE=true
npm run build                      # prebuild = clean + regenerate src/openapi.d.ts, then tsc + tsc-alias + copy config/openapi3.yaml into dist/
npx tsc --noEmit                   # type-check only

npm test                           # unit + integration, with coverage (80% thresholds, enforced)
npm run test:unit                  # no DB needed
npm run test:integration           # globalSetup starts the postgres-test container itself
npm run test:db:up / test:db:down  # only needed for poking at the test DB outside a test run

npm run lint / lint:fix            # eslint
npm run format / format:fix        # prettier
npm run lint:openapi               # redocly lint openapi3.yaml
npm run generate:openapi-types     # regenerate src/openapi.d.ts from openapi3.yaml
```

Run a single test file or case (vitest requires the project name):

```bash
npx vitest run --project unit tests/unit/product/models/productManager.spec.ts
npx vitest run --project integration -t 'creates the product'
```

Note the app is always **built before it runs** — `npm start`/`start:dev` execute `dist/index.js`, not the
TypeScript sources, so a source edit needs a rebuild. Both the app and the tests resolve `openapi3.yaml` and
`config/` relative to `process.cwd()`, so commands must run from the repo root (or from `dist/`, as the npm
scripts do).

## Architecture

Express + TypeScript service over Postgres/PostGIS, structured after MapColonies'
`ts-server-boilerplate`: tsyringe DI, `@map-colonies/config`, and one folder per business resource
(`src/product/`) rather than a flat controllers/services split.

**Startup path.** `src/index.ts` → `getApp()` (`src/app.ts`) → `registerExternalValues()`
(`src/containerConfig.ts`) builds the DI container → `ensureSchema()` provisions the DB → `ServerBuilder.build()`
assembles the Express app. `getApp()` returns `[app, container]` and never calls `listen()`, which is what lets
tests drive the real app over supertest. Tracing is bootstrapped separately in `src/instrumentation.mts`, loaded
via `node --import ./instrumentation.mjs` _before_ the app, so it initializes config a second time on its own.

**DI.** Every dependency is registered in `containerConfig.ts` against a symbol from `SERVICES`
(`src/common/constants.ts`); routers get their own symbol (`PRODUCT_ROUTER_SYMBOL`). Tests swap dependencies via
`getApp({ override: [{ token, provider }], useChild: true })` rather than module mocking. The logger is awaited
and registered as a value because tsyringe factories are synchronous.

**Per-resource layering** (`src/product/`), strictly one-directional:

- `routes/` — DI factory returning an Express `Router`.
- `controllers/` — req/res glue implementing `TypedRequestHandlers['<operationId>']`; no business logic. Also
  where the product-specific Prometheus counters/histogram live (`track()` wraps each domain call).
- `models/productManager.ts` — domain rules: not-found → `NotFoundError`, WKT shape validation → `BadRequestError`.
- `models/product.ts` — domain types, including the DB row shape.
- `repositories/` — knex/SQL only, plus row ↔ API-shape mapping. Trusts its input as already validated.

**OpenAPI is the source of truth.** `src/openapi.d.ts` is generated from `openapi3.yaml` (a `prebuild` step) —
never hand-edit it. `express-openapi-validator` validates every request against the same spec at runtime, so a
new/changed endpoint means: edit `openapi3.yaml` → `npm run generate:openapi-types` → implement the handler
(a drifting shape becomes a compile error). `productRepository.ts` even derives its column list by reading
`components.schemas.productCreate.properties` out of the spec at module load.

**Config.** `@map-colonies/config` with the `commonBoilerplateV3` schema, layered node-config style
(`config/default.json` + `config/{NODE_ENV}.json`). The `db` key is _not_ in that schema — it rides along as an
extra key typed by `AdditionalConfig` in `src/common/config.ts`. There is no `DATABASE_URL`/env-var path for DB
settings; production supplies `config/production.json` (currently `{}`, overlaid at deploy time). `initConfig()`
must run before `getConfig()`, which throws otherwise.

**Schema, not migrations.** `src/common/db/schema.ts` runs on every boot from `getApp()`: extensions, enum types,
`products` table, GiST index — all idempotent, inside a transaction holding `pg_advisory_xact_lock` so concurrent
replicas serialize. There is no migration history and no `down` path: additive changes are just an edit here,
while destructive ones (dropping/retyping a column, backfills) must be handled out-of-band against existing
databases.

**Errors.** Throw the `AppError` subclasses from `src/common/errors.ts`; `getErrorHandlerMiddleware()` turns their
`statusCode` into the response. `serverBuilder.ts` registers a catch-all _before_ the error handler so unmatched
routes produce a JSON 404 rather than Express's HTML default.

## Testing

- `tests/unit/` — collaborators stubbed with `vi.fn()`, constructed directly (no container). No DB.
- `tests/integration/` — real HTTP through `@map-colonies/openapi-supertest` against a real PostGIS container.
  Each file calls `initConfig(true)` (offline) then `getApp({ override: [...], useChild: true })`, stubbing the
  logger/tracer only; the schema comes from the production `ensureSchema()` path. Truncate `products` in
  `beforeEach`; `fileParallelism` is off for this project because they share one database.
- `tests/configurations/globalSetup.ts` sets `NODE_ENV=test` and runs `docker compose up -d --wait postgres-test`;
  teardown only runs in CI (`process.env.CI`), so the container is left up locally between runs.
- `tests/factories/product.factory.ts` builds payloads and the named test polygons — extend it instead of
  inlining fixtures.
- `toSatisfyApiSpec()` is available (jest-openapi wired in `initJestOpenapi.setup.ts`); use it on responses.

## Conventions

- Path aliases `@src/*`, `@tests/*`, `@common/*`, `@openapi` (tsconfig paths, mirrored into vitest config).
- The wire format is snake_case (`bounding_polygon`, `consumption_protocol`) because the spec and DB columns are;
  `eslint.config.mjs` allows snake_case for object/type properties for exactly this reason. Keep internal
  identifiers camelCase.
- Commits go through commitlint (conventional commits; the only allowed scopes are `deps` and `configurations`)
  and a husky pre-commit hook running lint-staged.
- WKT values in query strings must be _fully_ percent-encoded, parentheses included, or the OpenAPI validator
  rejects them as "not url encoded".

## Known README drift

`README.md` is detailed and mostly accurate, but a few details are stale — trust the code/config over it:
the test DB is on port 5432 (not 5433), `config/default.json`'s `server.port` is 8081 (test config uses 8080),
and the migration runner it references (`dist/common/db/migrate.js`) no longer exists — `ensureSchema()`
replaced it.
