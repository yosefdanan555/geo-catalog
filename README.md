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
      createConnection.ts         # knex instance, DI-registered as a cached singleton (SERVICES.DB_CONNECTION)
      schema.ts                   # idempotent schema bootstrap, applied by getApp() on every start
  product/                     # one business resource, 3 tiers top-to-bottom:
    routes/productRouter.ts      #   entry-point: HTTP routes -> controller (DI factory)
    controllers/productController.ts #   entry-point: req/res glue using generated TypedRequestHandlers, no business logic
    models/productManager.ts      #   domain: business rules (not-found, WKT validation), orchestrates the repository
    models/product.ts             #   domain types (ProductInput/Product/ProductSearchFilters/ProductRow)
    repositories/productRepository.ts #   data-access: knex/SQL + DB row <-> API shape mapping, no rules
tests/
  configurations/               # vitest setup files + globalSetup (brings up the test DB container)
  integration/                  # one folder per resource/concern, real Postgres, real HTTP (via @map-colonies/openapi-supertest)
  unit/                         # manager-level unit tests with a stubbed repository
  factories/                    # test data builders
postman/                       # Postman collection demoing every endpoint
Dockerfile                     # matches ts-server-boilerplate's build/production stages
helm/api/                      # generic chart: Deployment + Service + HPA + Ingress/Route
.github/workflows/              # CI/CD: build/push the image, deploy to OpenShift (see CI/CD)
.husky/                        # pre-commit hook (lint-staged) — see Git hooks
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
  it rides along as an extra `db` key in `config/*.json`, typed by
  `AdditionalConfig` rather than by the schema — see [Databases](#databases).
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
port-forward svc/my-release-postgresql 5432:5432`). Configured via the `db`
  key in `config/default.json`.
- **Test**: a disposable, tmpfs-backed container defined in `docker-compose.yml`
  (`localhost:5433`, db `catalog_test`), fully isolated from whatever dev
  database you're using, started automatically by the test suite itself.
  Configured via the `db` key in `config/test.json`, which layers on top of
  `config/default.json` when `NODE_ENV=test`. **Never point it at the same
  database as dev** — the test suite truncates the `products` table before
  every test.

The connection is configured exactly one way — discrete `host`/`port`/
`username`/`password`/`database` fields under `db` in `config/*.json`, e.g.:

```json
{
  "db": {
    "host": "localhost",
    "port": 5432,
    "username": "admin",
    "password": "secret",
    "database": "spatial_db"
  }
}
```

Same node-config-style layering as the rest of `config/` (`default.json`
always applies, `{NODE_ENV}.json` layers on top — see
`src/common/config.ts`). The `db` key isn't part of `@map-colonies/config`'s
`commonBoilerplateV3` schema, which knows nothing about this service's DB, but
the library carries extra keys through rather than stripping them — so
`config.get('db.host')` resolves like any other setting, and the
`AdditionalConfig` interface declares the shape so those reads are typed rather
than `undefined`. No `DATABASE_URL`/env var alternative — a real
production deployment supplies `config/production.json` however it supplies
its other config (baked into the image, or overlaid at deploy time — see
[Kubernetes / Helm](#kubernetes--helm)).

## Running

```bash
npm install

# Dev server: builds once, then runs the built output with the config server
# skipped (CONFIG_OFFLINE_MODE=true) — expects a reachable Postgres+PostGIS per
# config/default.json's "db" key.
npm run start:dev            # http://localhost:8080 (config/default.json's server.port)

# Production build + start (talks to a real @map-colonies config-server unless
# CONFIG_OFFLINE_MODE=true is also set)
npm run build && npm start
```

There is no separate migration step to run first. `getApp()` calls
`ensureSchema()` (`src/common/db/schema.ts`) on every start, which creates the
PostGIS/pgcrypto extensions, the two enum types, the `products` table and its
GiST index — each guarded so that starting against an already-provisioned
database does nothing. It runs inside a transaction holding a
`pg_advisory_xact_lock`, so several replicas starting at once serialize instead
of racing each other's `CREATE`s.

The trade-off is deliberate: there is no migration history and no `down` path,
so an **additive** change (a new nullable column, another index) is just an
edit to `schema.ts`, while anything destructive — dropping or retyping a column,
backfilling — has to be handled out-of-band, since existing databases will
already have the old shape.

## Testing

```bash
npm test                     # unit + integration
npm run test:unit            # manager-level unit tests, no DB required
npm run test:integration     # full HTTP surface against a real Postgres+PostGIS
```

`npm run test:integration`'s Vitest `globalSetup` (`tests/configurations/globalSetup.ts`)
brings up the isolated `postgres-test` container (idempotent; a no-op if it's
already running), so it's a single command with no manual step. The schema
itself comes from the same `ensureSchema()` the server uses, since every test
file builds its app through `getApp()` — the tests exercise the production
bootstrap path rather than a test-only one. `npm run test:db:up` /
`test:db:down` remain available if you want the container running for manual
poking around outside of a test run.

`npx tsc --noEmit` (or `npm run build`) type-checks the project. `npm run lint`
runs ESLint (`@map-colonies/eslint-config`); `npm run lint:openapi` lints
`openapi3.yaml` with Redocly. `npm run format`/`format:fix` run Prettier
(`prettier.config.js`, reusing `@map-colonies/prettier-config` — single
quotes, 150-char print width, es5 trailing commas; see `.prettierignore` for
what's excluded and why).

## Metrics

Prometheus metrics are exposed at **`GET /metrics`** on the same port as the
API — `collectMetricsExpressMiddleware` (`@map-colonies/prometheus`) registers
that route in `serverBuilder.ts`, and it's excluded from the access log so
scrapes don't drown out real traffic.

Alongside the default Node/process metrics and the middleware's per-route
`http_request_duration_seconds`, the product actions are instrumented in
`productController.ts`:

| Metric                               | Type      | Labels                 | What it tells you                                     |
| ------------------------------------ | --------- | ---------------------- | ----------------------------------------------------- |
| `product_operations_total`           | counter   | `operation`, `outcome` | How many product actions ran, and how many failed     |
| `product_operation_duration_seconds` | histogram | `operation`, `outcome` | How long each action spent in the domain layer        |
| `created_product`                    | counter   | —                      | Products created (kept from the original boilerplate) |

`operation` is one of `create`, `search`, `getById`, `update`, `delete`.
`outcome` is `success` or `failure`, where failure covers anything the manager
throws — a `BadRequestError` from WKT validation as much as a database outage —
so the ratio between the two is a usable error rate. Note these count actions
that _reached_ the controller: a request rejected earlier by the OpenAPI
validator (an unknown query param, a malformed body) shows up in
`http_request_duration_seconds` with a 400 but never in `product_operations_total`.

### Seeing them in local dev

Start the service and the database, make a few requests, then scrape:

```bash
npm run test:db:up           # or point config/default.json's "db" at your own Postgres
npm run start:dev

# the service listens on config/default.json's server.port
PORT=$(node -p "require('./config/default.json').server.port")

# generate some traffic
curl -X POST localhost:$PORT/product -H 'Content-Type: application/json' \
  -d '{"name":"Demo","type":"raster","consumption_protocol":"WMS"}'
curl localhost:$PORT/product
curl localhost:$PORT/product/00000000-0000-0000-0000-000000000000   # a 404, to get outcome="failure"

# read the product metrics back
curl -s localhost:$PORT/metrics | grep '^product_'
```

which prints one series per action/outcome pair:

```
product_operations_total{operation="create",outcome="success",...} 1
product_operations_total{operation="search",outcome="success",...} 1
product_operations_total{operation="getById",outcome="failure",...} 1
product_operation_duration_seconds_bucket{le="0.005",operation="create",outcome="success",...} 1
...
```

`curl -s localhost:$PORT/metrics` on its own shows everything, including the
per-route HTTP histogram and Node runtime metrics. To graph rather than read
them, point a local Prometheus at the service — with the app on the host and
Prometheus in Docker, `host.docker.internal` is the scrape target (substitute
the same `server.port`):

```yaml
# prometheus.yml
scrape_configs:
  - job_name: geospatial-catalog
    scrape_interval: 5s
    static_configs:
      - targets: ['host.docker.internal:8081']
```

```bash
docker run --rm -p 9090:9090 \
  --add-host host.docker.internal:host-gateway \
  -v "$PWD/prometheus.yml:/etc/prometheus/prometheus.yml" \
  prom/prometheus
```

Then open <http://localhost:9090> and try
`sum by (operation) (rate(product_operations_total[1m]))`, or
`histogram_quantile(0.95, sum by (le, operation) (rate(product_operation_duration_seconds_bucket[5m])))`
for p95 latency per action.

## Git hooks

`npm install` sets up a Husky pre-commit hook (its `prepare` script runs
`husky`, which points git at `.husky/`) that runs `lint-staged` on every
commit: `eslint --fix` + `prettier --write`, but only on the files staged for
that commit, then re-stages whatever they changed — so lint/format fixes land
in the same commit instead of showing up as an unstaged diff afterwards. An
unfixable ESLint error aborts the commit. Config lives in package.json's
`lint-staged` key; the hook itself is `.husky/pre-commit`.

## Docker

```bash
npm run docker:build           # docker build -t geospatial-catalog-service:latest .

docker run --rm -p 8080:8080 \
  -e CONFIG_OFFLINE_MODE=true \
  geospatial-catalog-service:latest
```

Two-stage `Dockerfile` (matching `ts-server-boilerplate`'s): one stage installs
dependencies and runs `npm run build` (which also copies `config/` and
`openapi3.yaml` into `dist/`), the production stage installs only production
dependencies and copies that `dist/` in, running as the non-root `node` user.
The DB the container talks to is whatever `db` key ends up in
`dist/config/production.json` (`NODE_ENV=production` is set in the
`Dockerfile`) — bake real values into `config/production.json` before building,
or overlay the file at container-start time (e.g. `-v
$(pwd)/production.json:/usr/src/app/config/production.json:ro`) if you'd rather
not check them into the image. `host.docker.internal` reaches Postgres running
on your host (Docker Desktop resolves this out of the box) if you point
`db.host` at it. The image never runs migrations itself — run those separately
(`NODE_ENV=production node dist/common/db/migrate.js latest`) before starting
it, the same way you would for a real deploy.

## Kubernetes / Helm

`helm/api/` deploys the image built above to Kubernetes: a generic, minimal
chart — Deployment + Service + HorizontalPodAutoscaler + Ingress/Route, each
toggleable independently, no database or migration awareness at all. Env vars
(just `NODE_ENV`/`CONFIG_OFFLINE_MODE` by default, since no config-server is
deployed alongside this chart, and the app doesn't read DB settings from env
vars at all) are a plain pass-through list, the same shape as a Pod spec's own
`env`/`envFrom`. `volumes`/`volumeMounts` are the same kind of pass-through,
there specifically so a real deployment can overlay `config/production.json`
(baked into the image as an empty `{}`) with one built from a Secret, instead
of checking a real DB password into the image — see the commented-out example
in `values.yaml`. Run migrations yourself before installing/upgrading
(`node dist/common/db/migrate.js latest`, pointed at the target database) —
this chart doesn't run them for you.

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
  --set-json 'env=[{"name":"CONFIG_OFFLINE_MODE","value":"true"}]' \
  --set-json 'volumes=[{"name":"db-config","secret":{"secretName":"my-secret","items":[{"key":"production.json","path":"production.json"}]}}]' \
  --set-json 'volumeMounts=[{"name":"db-config","mountPath":"/usr/src/app/config/production.json","subPath":"production.json","readOnly":true}]'
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

See `helm/api/values.yaml` for the full set of options, including the
commented-out `volumes`/`volumeMounts` example for overlaying
`config/production.json` from a Secret.

A `helm/deploy.sh` may exist locally for one-off manual deploys against a
specific registry/cluster — it's `.gitignore`d on purpose (it tends to
accumulate live credentials) and isn't part of this repo's tracked history.

## CI/CD

[`.github/workflows/docker-build-deploy.yml`](.github/workflows/docker-build-deploy.yml)
builds the Docker image and deploys it to OpenShift via the `helm/api` chart
above:

- **Any push/PR touching `main`, or a manual run** — builds the image. A pull
  request only builds (a Dockerfile smoke test, no registry credentials
  touched); a push to `main` also pushes it to
  `acrarolibotnonprod.azurecr.io/test-catalog`, tagged with the short commit
  SHA and `latest`.
- **Push to `main` (or manual run)** — then deploys that image to OpenShift
  with `helm upgrade --install`, same as the manual `helm install` commands
  above but non-interactive.

It needs these configured under the repo's Settings → Secrets and variables →
Actions before it'll run end-to-end:

| Name                            | Kind     | Purpose                                                                  |
| ------------------------------- | -------- | ------------------------------------------------------------------------ |
| `ACR_USERNAME` / `ACR_PASSWORD` | Secret   | Push access to the ACR above                                             |
| `OPENSHIFT_SERVER`              | Secret   | Cluster API URL (`https://api.<cluster>:6443`)                           |
| `OPENSHIFT_TOKEN`               | Secret   | Token for a service account allowed to deploy into `OPENSHIFT_NAMESPACE` |
| `OPENSHIFT_NAMESPACE`           | Variable | Target project/namespace                                                 |

Like the chart itself, migrations aren't run by this workflow — apply them
yourself against the target database before/after a deploy that changes the
schema.

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
