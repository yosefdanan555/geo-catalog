# Geospatial Products Catalog Service

TypeScript/Express service implementing the CRUD + spatial-query API defined in
[`openapi.yaml`](./openapi.yaml), backed by Postgres/PostGIS.

## Project structure

```
src/
  app.ts                     # express app: middleware, OpenAPI validation, routes, error handling (no listen())
  server.ts                  # entry point: imports app, calls listen()
  libs/                       # cross-cutting infrastructure, shared by every component
    config/                   # env-based, validated, fail-fast configuration
    db/
      knex.ts                 # knex instance
      migrate.ts              # tiny CLI: `tsx src/libs/db/migrate.ts latest|rollback`
      migrations/
    errors/                   # AppError hierarchy (operational errors -> HTTP status codes)
    middlewares/               # centralized error handler
    logger.ts
  components/
    products/                 # one business component, 3 tiers top-to-bottom:
      products.routes.ts      #   entry-point: HTTP routes -> controller
      products.controller.ts  #   entry-point: req/res glue, no business logic
      products.service.ts     #   domain: business rules (not-found, WKT validation), orchestrates the DAL
      products.dal.ts         #   data-access: knex/SQL only, no rules
      products.mapper.ts      #   DB row -> API DTO
      products.types.ts
test/
  integration/                # one file per resource/concern, real Postgres, real HTTP
  factories/                  # test data builders
  helpers/test-server.ts       # starts the real app on a random port for axios to hit
  setup/{global-setup,global-teardown}.ts
postman/                      # Postman collection demoing every endpoint
Dockerfile                    # multi-stage build -> small production image
helm/api/                     # generic chart: Deployment + Service + HPA + Ingress/Route
```

### Mapping to nodebestpractices' project-structure guide

- **1.1 Structure by business components** — `src/components/products/` is one
  self-contained component; a second resource would get its own sibling folder,
  not scattered changes across shared layers.
- **1.2 Layer each component in 3 tiers** — entry-points (`*.routes.ts`/`*.controller.ts`)
  → domain (`*.service.ts`) → data-access (`*.dal.ts`). The controller never
  touches knex; the DAL never decides what's a 404 or validates a WKT string —
  that's the service's job. This was a real gap in the first pass of this
  service (the controller called the DAL directly) — fixed by introducing
  `products.service.ts`.
- **1.3 Wrap common utilities separately** — `src/libs/` holds everything that
  isn't business logic (config, db connection, errors, logging, error-handling
  middleware), kept out of `components/` so nothing there gets tempted to import
  another component's internals. (This is a single-package project, so these
  aren't split into their own `package.json`s the way a large monorepo would —
  the folder boundary captures the intent at this scale.)
- **1.4 Environment-aware, secure, validated config** — `src/libs/config` loads
  `.env`/`.env.test` by `NODE_ENV`, validates every variable with `zod`, and
  fails fast with a readable error if one is missing or malformed. There's no
  hardcoded fallback connection string baked into the code anymore — every
  environment must set `DATABASE_URL`, or the discrete `DB_*` equivalent
  (see [Databases](#databases)), explicitly.
- **1.5/1.6 Framework & TypeScript choice** — Express (already fixed by the
  earlier parts of this exercise) with `strict` TypeScript used for its types,
  not fancy generics; the tradeoffs are noted inline where they came up (e.g.
  the DAL's `Knex.QueryBuilder` typing, or config's `exactOptionalPropertyTypes`
  fallout).

### Mapping to the nodejs-testing-best-practices guide

- **Integration/component tests over unit tests (1.1)** — all 27 tests hit a
  real Postgres+PostGIS through the real HTTP layer; nothing here mocks the DB.
- **Docker-Compose, started from global setup, kept up locally / torn down in CI
  (2.1–2.3)** — `test/setup/global-setup.ts` runs `docker compose up -d --wait
  postgres-test` itself, so `npm test` is one command with no manual step.
  `global-teardown.ts` only runs `docker compose down` when `CI` is set — a
  local dev loop keeps the container warm between runs.
- **Real DB engine, tuned for speed, not durability, backed by RAM (2.4/2.5)** —
  the test Postgres runs with `fsync=off`/`synchronous_commit=off`/
  `full_page_writes=off` and its data directory is `tmpfs`; it's real Postgres+
  PostGIS, not a stub, so spatial queries are actually exercised.
- **Schema via production migrations (2.6)** — the test DB is built with the
  exact same knex migration used for a real deploy, not a hand-rolled SQL dump.
- **Same process, controlled start/stop, random port (3.1–3.3)** —
  `test/helpers/test-server.ts` starts the actual `createApp()` in-process on
  port `0` (OS-assigned) per test file, and closes it in `afterAll`.
- **Pure HTTP client, assert the whole response, structure by route (4.2/4.4/4.5)** —
  tests use `axios` against a real listening server (not an Express-coupled
  wrapper), `describe` blocks are named after routes/stories, and single-resource
  assertions compare the whole response body (`toEqual`) rather than checking
  fields one at a time.
- **Assert new state via the public API, add randomness to unique fields, test
  for side effects (6.3/6.5/6.8)** — e.g. the update test re-`GET`s the resource
  instead of trusting the `PUT` response; the factory suffixes names with a
  random string; a dedicated test creates two products and confirms deleting
  one leaves the other byte-for-byte unchanged.
- **Sections 5 (external services) and 7–8 (message queues/mocking)** are not
  applicable — this service has no outbound HTTP calls or queues to fake.

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
  only the password, not a ready-made URL (see `src/libs/config`).

## Running

```bash
npm install

# Dev server (expects a reachable Postgres+PostGIS per .env's DATABASE_URL)
npm run dev                  # tsx watch src/server.ts, http://localhost:3000

# Production build
npm run build && npm start
```

## Testing

```bash
npm test
```

That's it — `npm test`'s Jest `globalSetup` brings up the isolated
`postgres-test` container (idempotent; a no-op if it's already running),
applies migrations, and only then runs the suite. `npm run test:db:up` /
`test:db:down` remain available if you want the container running for manual
poking around outside of a test run.

`npm run build` (or `npx tsc --noEmit`) type-checks the project. Tests run under
`@swc/jest` (fast transpile-only) rather than `ts-jest`, since this environment's
TypeScript version is ahead of `ts-jest`'s supported range; type errors are still
caught by the separate `tsc` step, which is the more common split anyway.

## Docker

Multi-stage `Dockerfile`: one stage compiles TypeScript, a separate stage
installs only production dependencies, and the final image is just `dist/` +
`node_modules` (prod-only) + `openapi.yaml`, running as the non-root `node`
user with a built-in `HEALTHCHECK` against `/health`.

```bash
npm run docker:build           # docker build -t catalog-service:latest .

docker run --rm -p 3000:3000 \
  -e NODE_ENV=production \
  -e DATABASE_URL=postgres://user:pass@host.docker.internal:5432/spatial_db \
  catalog-service:latest
```

`host.docker.internal` reaches Postgres running on your host (Docker Desktop
resolves this out of the box); swap it for a real hostname/service in any
other environment. The image never runs migrations itself — run those
separately (`node dist/libs/db/migrate.js latest`, pointed at the same
database) before starting it, the same way the Helm chart's migration Job does.

## Kubernetes / Helm

`helm/api/` deploys the image built above to Kubernetes: a generic, minimal
chart — Deployment + Service + HorizontalPodAutoscaler + Ingress/Route, each
toggleable independently, no database or migration awareness at all. Env vars
(including anything DB-related) are a plain pass-through list, the same shape
as a Pod spec's own `env`/`envFrom` — usable for this app or anything else with
an HTTP health endpoint. Run migrations yourself before installing/upgrading
(`node dist/libs/db/migrate.js latest`, pointed at the target database) — this
chart doesn't run them for you.

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
  --set-json 'env=[{"name":"NODE_ENV","value":"production"},{"name":"DATABASE_URL","valueFrom":{"secretKeyRef":{"name":"my-secret","key":"database-url"}}}]'
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
hardcodes `DATABASE_URL` as a plain value (no Secret involved) pointed at
`catalog-postgresql` — see the comment right above it in the file for why that
only keeps working if that Postgres release's password is itself pinned
rather than left to auto-generate.

### Deploy script (OpenShift)

`scripts/deploy.sh` runs the whole release cycle in one command: docker build
→ docker push → `oc login` → bump `helm/api/values.yaml`'s `image.tag` →
`helm upgrade --install`. It never contains credentials itself — those come
from env vars at run time:

```bash
export OC_SERVER=https://api.<your-cluster>:6443
export OC_TOKEN=sha256~...        # or OC_USERNAME + OC_PASSWORD

./scripts/deploy.sh                # tags the image with the current git SHA
./scripts/deploy.sh v1.2.3         # or pass an explicit tag
```

`RELEASE_NAME` (default `catalog-api`) and `OC_PROJECT` (default: whatever
project `oc login` leaves you on) are also overridable via env var — see the
comment header in the script for the full list. It patches only the `tag:`
line in `values.yaml` (not a full YAML rewrite), so your comments and the
hardcoded `DATABASE_URL` above are left untouched.

## API

See `openapi.yaml` for the full contract. In short:

- `POST /api/v1/products`, `GET /api/v1/products/{id}`, `PUT /api/v1/products/{id}`,
  `DELETE /api/v1/products/{id}` — standard CRUD.
- `GET /api/v1/products` — search with every filter as an additional (AND-only)
  constraint: `equal` (name/type/consumption_protocol), `greater`/`greaterEqual`/
  `less`/`lessEqual`/`equal` for `resolution_best`/`min_zoom`/`max_zoom`
  (`_gt`/`_gte`/`_lt`/`_lte`/`_eq` suffixes), and `intersects`/`contains`/`within`
  spatial filters taking a WKT geometry (EPSG:4326).

Every request is validated against `openapi.yaml` itself (`express-openapi-validator`),
so the spec can't silently drift from what the server actually accepts; response
shapes are additionally validated against the spec while `NODE_ENV=test`.

The spec is also served over HTTP by the running app itself (both endpoints
sit outside `/api/v1`, unauthenticated, same as `/health`):

- `GET /docs` — interactive Swagger UI, try requests straight from the browser.
- `GET /openapi.yaml` — the raw spec file.

## Postman collection

[`postman/geospatial-catalog.postman_collection.json`](./postman/geospatial-catalog.postman_collection.json)
demos every endpoint, organized into folders: Health, Products/CRUD, and three
Search folders (Equality, Numeric Comparisons, Spatial) covering every filter
operator individually plus one combined-filters example. Import it, set the
`baseUrl` collection variable if not running on `localhost:3000`, and run
"Create Product" first — its test script captures the new id into the
`productId` collection variable that Get/Update/Delete-by-id reuse.

Note on WKT query params: values like `POINT(34.8 32.05)` must be fully
percent-encoded, including the parentheses — most HTTP clients' default
encoders (this one included, originally) leave `(` and `)` unescaped, which
`express-openapi-validator` rejects as "not url encoded". The collection's
spatial requests already do this correctly; keep it in mind when adding new ones.
