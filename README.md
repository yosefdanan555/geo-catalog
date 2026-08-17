# Geospatial Products Catalog Service

TypeScript/Express service implementing the CRUD + spatial-query API defined in
[`openapi3.yaml`](./openapi3.yaml), backed by Postgres/PostGIS. Structured after
MapColonies' [`ts-server-boilerplate`](https://github.com/MapColonies/ts-server-boilerplate):
`tsyringe` dependency injection, `@map-colonies/config` for schema-validated
configuration, structured logging/metrics/tracing via the `@map-colonies/*`
packages, and one folder per business resource (`product`) instead of a flat
`controllers`/`services` split.

## Project structure

```
config/                       # @map-colonies/config's local config (node-config style: default.json + {NODE_ENV}.json)
src/
  index.ts                    # entry point: builds the app, starts listening, wires graceful shutdown (terminus)
  app.ts                      # getApp(): resolves the DI container, builds the Express app (no listen())
  serverBuilder.ts             # assembles middleware + routes into an Express app
  containerConfig.ts           # registers every DI dependency (config, logger, tracer, metrics, db, routers)
  instrumentation.mts           # OpenTelemetry tracing bootstrap; loaded via `node --import` before anything else
  openapi.d.ts                 # generated from openapi3.yaml — do not edit by hand (`npm run generate:openapi-types`)
  common/                      # cross-cutting infrastructure, shared by every resource
    config.ts                  # @map-colonies/config instance (server/telemetry/openapi — schema-validated)
    constants.ts                # DI token symbols (SERVICES), service name, ignored trace routes
    dependencyRegistration.ts    # tiny tsyringe registration helper (supports per-test overrides)
    interfaces.ts
    tracing.ts
    errors/                     # AppError hierarchy -> HTTP status codes (picked up by error-express-handler)
    db/
      dbConfig.ts                # DB connection env vars — outside @map-colonies/config; this service's own contract
      createConnection.ts         # knex instance, DI-registered as a cached singleton (SERVICES.DB_CONNECTION)
      migrate.ts                  # CLI: `tsx src/common/db/migrate.ts latest|rollback`
      migrations/
  product/                     # one business resource, 3 tiers top-to-bottom:
    routes/productRouter.ts      #   entry-point: HTTP routes -> controller (DI factory)
    controllers/productController.ts #   entry-point: req/res glue using generated TypedRequestHandlers, no business logic
    models/productManager.ts      #   domain: business rules (not-found, WKT validation), orchestrates the repository
    models/product.ts             #   domain types (ProductInput/Product/ProductSearchFilters/ProductRow)
    repositories/productRepository.ts #   data-access: knex/SQL + DB row <-> API shape mapping, no rules
tests/
  configurations/               # vitest setup files + globalSetup (brings up the test DB, runs migrations)
  integration/                  # one folder per resource/concern, real Postgres, real HTTP (via @map-colonies/openapi-supertest)
  unit/                         # manager-level unit tests with a stubbed repository
  factories/                    # test data builders
postman/                       # Postman collection demoing every endpoint
Dockerfile                     # matches ts-server-boilerplate's build/production stages
helm/api/                      # generic chart: Deployment + Service + HPA + Ingress/Route
```

### Why this shape

- **DI over static classes** — every resource is a set of `tsyringe`-registered
  classes (`ProductController`/`ProductManager`/`ProductRepository`) wired
  together in `containerConfig.ts`, not a chain of static-method imports. Tests
  override individual tokens (logger, tracer, even the DB connection) per-run via
  `getApp({ override: [...], useChild: true })` instead of mocking modules.
- **One router symbol per resource** — `PRODUCT_ROUTER_SYMBOL` is resolved once
  in `serverBuilder.ts`; adding a second resource means adding a second
  `src/<resource>/` folder and a second line in `containerConfig.ts`/`serverBuilder.ts`,
  not touching existing ones.
- **Schema-validated config, but split by ownership** — `common/config.ts` owns
  everything the boilerplate itself defines (server port, telemetry, OpenAPI
  paths) via `@map-colonies/config` and `commonBoilerplateV3`. The Postgres
  connection is this service's own concern (the boilerplate has no DB story), so
  it stays in `common/db/dbConfig.ts`, validated separately with `zod` and read
  straight from the environment — see [Databases](#databases).
- **Generated request/response types** — `src/openapi.d.ts` is generated from
  `openapi3.yaml` (`npm run generate:openapi-types`, also a `prebuild` step) via
  `@map-colonies/openapi-generators`; controllers implement
  `TypedRequestHandlers['<operationId>']`, so a body/query/param shape drifting
  from the spec is a compile error, not a runtime surprise.

## Databases

This project always talks to at least **two** separate Postgres+PostGIS
instances, kept intentionally isolated from each other:

- **Dev**: whatever Postgres+PostGIS you're using locally — a plain Docker
  container, or a Postgres deployed via Helm into a local cluster (e.g.
  `helm install my-release bitnami/postgresql`, reached with `kubectl
  port-forward svc/my-release-postgresql 5432:5432`). Configured via `.env`.
- **Test**: a disposable, tmpfs-backed container defined in `docker-compose.yml`
  (`localhost:5433`, db `catalog_test`), fully isolated from whatever dev
  database you're using, started automatically by the test suite itself.
  **Never point `.env.test` at the same database as `.env`** — the test suite
  truncates the `products` table before every test.

The connection is configured either way:

- `DATABASE_URL` — one connection string (`postgres://user:pass@host:port/db`).
  Simplest for local dev; that's what `.env`/`.env.test` use.
- Or discrete `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` — used by
  the Helm chart, since a Bitnami-style Postgres chart's generated Secret holds
  only the password, not a ready-made URL (see `src/common/db/dbConfig.ts`).

## Running

```bash
npm install

# Dev server: builds once, then runs the built output with the config server
# skipped (CONFIG_OFFLINE_MODE=true) — expects a reachable Postgres+PostGIS per
# .env's DATABASE_URL.
npm run start:dev            # http://localhost:8080 (config/default.json's server.port)

# Production build + start (talks to a real @map-colonies config-server unless
# CONFIG_OFFLINE_MODE=true is also set)
npm run build && npm start
```

Migrations aren't run automatically by any of the above — apply them yourself
first:

```bash
npm run db:migrate           # NODE_ENV=development, i.e. against .env's DATABASE_URL
```

## Testing

```bash
npm test                     # unit + integration
npm run test:unit            # manager-level unit tests, no DB required
npm run test:integration     # full HTTP surface against a real Postgres+PostGIS
```

`npm run test:integration`'s Vitest `globalSetup` (`tests/configurations/globalSetup.ts`)
brings up the isolated `postgres-test` container (idempotent; a no-op if it's
already running) and applies migrations, so it's a single command with no
manual step. `npm run test:db:up` / `test:db:down` remain available if you want
the container running for manual poking around outside of a test run.

`npx tsc --noEmit` (or `npm run build`) type-checks the project. `npm run lint`
runs ESLint (`@map-colonies/eslint-config`); `npm run lint:openapi` lints
`openapi3.yaml` with Redocly.

## Docker

```bash
npm run docker:build           # docker build -t geospatial-catalog-service:latest .

docker run --rm -p 8080:8080 \
  -e CONFIG_OFFLINE_MODE=true \
  -e DATABASE_URL=postgres://user:pass@host.docker.internal:5432/spatial_db \
  geospatial-catalog-service:latest
```

Two-stage `Dockerfile` (matching `ts-server-boilerplate`'s): one stage installs
dependencies and runs `npm run build` (which also copies `config/` and
`openapi3.yaml` into `dist/`), the production stage installs only production
dependencies and copies that `dist/` in, running as the non-root `node` user.
`host.docker.internal` reaches Postgres running on your host (Docker Desktop
resolves this out of the box); swap it for a real hostname/service in any other
environment. The image never runs migrations itself — run those separately
(`DATABASE_URL=... node dist/common/db/migrate.js latest`) before starting it,
the same way you would for a real deploy.

## Kubernetes / Helm

`helm/api/` deploys the image built above to Kubernetes: a generic, minimal
chart — Deployment + Service + HorizontalPodAutoscaler + Ingress/Route, each
toggleable independently, no database or migration awareness at all. Env vars
(including anything DB-related, and `CONFIG_OFFLINE_MODE`, since no
config-server is deployed alongside this chart) are a plain pass-through list,
the same shape as a Pod spec's own `env`/`envFrom`. Run migrations yourself
before installing/upgrading (`node dist/common/db/migrate.js latest`, pointed
at the target database) — this chart doesn't run them for you.

**Prerequisites**: a running cluster and `helm` installed. If using minikube,
build the image where the cluster can see it first (minikube runs its own
Docker daemon, separate from your host's):

```bash
eval $(minikube docker-env)
npm run docker:build
```

**Install:**

```bash
helm install catalog-api ./helm/api \
  --set-json 'env=[{"name":"CONFIG_OFFLINE_MODE","value":"true"},{"name":"DATABASE_URL","valueFrom":{"secretKeyRef":{"name":"my-secret","key":"database-url"}}}]'
```

**Autoscaling** (`autoscaling.enabled=true`) needs `resources.requests` set on
the container to compute utilization — already defaulted in `values.yaml`
(100m CPU / 128Mi memory) — and a metrics-server running in the cluster:

```bash
helm install catalog-api ./helm/api --set autoscaling.enabled=true \
  --set autoscaling.minReplicas=2 --set autoscaling.maxReplicas=10
```

**Exposing it** — enable exactly one of the two, whichever your cluster runs:

```bash
# Plain Kubernetes (nginx-ingress, minikube's `ingress` addon, etc.)
helm install catalog-api ./helm/api --set ingress.enabled=true \
  --set ingress.className=nginx \
  --set ingress.hosts[0].host=api.example.local \
  --set ingress.hosts[0].paths[0].path=/ \
  --set ingress.hosts[0].paths[0].pathType=Prefix

# OpenShift (e.g. an ARO cluster) — Route instead of Ingress
helm install catalog-api ./helm/api --set route.enabled=true \
  --set route.host=api.apps.example.com
```

Verified with `helm lint` and `helm template` (defaults, HPA+Ingress+env, and
Route-only) — not live-installed anywhere, so double-check against your actual
cluster/image registry before relying on it as-is.

See `helm/api/values.yaml` for the full set of options. Its checked-in `env`
sources `DB_PASSWORD` from the `helm/postgresql` release's own Secret rather
than a plaintext value — see the comment right above it in the file.

A `helm/deploy.sh` may exist locally for one-off manual deploys against a
specific registry/cluster — it's `.gitignore`d on purpose (it tends to
accumulate live credentials) and isn't part of this repo's tracked history.

## API

See `openapi3.yaml` for the full contract. In short:

- `POST /product`, `GET /product/{id}`, `PUT /product/{id}`, `DELETE /product/{id}`
  — standard CRUD.
- `GET /product` — search with every filter as an additional (AND-only)
  constraint: `equal` (name/type/consumption_protocol), `greater`/`greaterEqual`/
  `less`/`lessEqual`/`equal` for `resolution_best`/`min_zoom`/`max_zoom`
  (`_gt`/`_gte`/`_lt`/`_lte`/`_eq` suffixes), and `intersects`/`contains`/`within`
  spatial filters taking a WKT geometry (EPSG:4326).

Every request is validated against `openapi3.yaml` itself
(`express-openapi-validator`), so the spec can't silently drift from what the
server actually accepts.

The spec is also served over HTTP by the running app itself, both outside the
`/product` resource, unauthenticated, same as `/liveness`:

- `GET /docs/api` — interactive Swagger-style UI, try requests straight from the browser.
- `GET /docs/api.json` — the raw spec, as JSON.

## Postman collection

[`postman/geospatial-catalog.postman_collection.json`](./postman/geospatial-catalog.postman_collection.json)
demos every endpoint, organized into folders: Liveness, Products/CRUD, and
three Search folders (Equality, Numeric Comparisons, Spatial) covering every
filter operator individually plus one combined-filters example. Import it, set
the `baseUrl` collection variable if not running on `localhost:8080`, and run
"Create Product" first — its test script captures the new id into the
`productId` collection variable that Get/Update/Delete-by-id reuse.

Note on WKT query params: values like `POINT(34.8 32.05)` must be fully
percent-encoded, including the parentheses — most HTTP clients' default
encoders leave `(` and `)` unescaped, which `express-openapi-validator` rejects
as "not url encoded". The collection's spatial requests already do this
correctly; keep it in mind when adding new ones.
