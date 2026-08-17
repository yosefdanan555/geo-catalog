import fs from 'fs';
import path from 'path';
import express from 'express';
import * as OpenApiValidator from 'express-openapi-validator';
import yaml from 'js-yaml';
import swaggerUi from 'swagger-ui-express';
import { config } from './libs/config';
import productsRoutes from './components/products/products.routes';
import { errorHandler, notFoundHandler } from './libs/middlewares/error-handler';

const openApiSpecPath = path.join(__dirname, '../openapi.yaml');

export function createApp() {
  const app = express();

  app.use(express.json());

  // Lightweight liveness probe, deliberately outside the documented API surface.
  app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));

  // The spec itself, both raw and as an interactive UI. Mounted ahead of the
  // OpenAPI validator below since neither path is part of the documented API.
  app.get('/openapi.yaml', (_req, res) => res.sendFile(openApiSpecPath));
  const openApiDocument = yaml.load(fs.readFileSync(openApiSpecPath, 'utf8')) as swaggerUi.JsonObject;
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));

  // openapi.yaml is the single source of truth for request shape: required fields,
  // enums, string lengths, and numeric query-param coercion all happen here, once,
  // instead of being re-implemented by hand in every controller.
  app.use(
    OpenApiValidator.middleware({
      apiSpec: openApiSpecPath,
      validateRequests: { coerceTypes: true },
      // Response validation is left on only in tests: it catches contract drift
      // between the spec and the implementation without paying for it in prod.
      validateResponses: config.env === 'test',
    })
  );

  app.use('/api/v1/products', productsRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
export default app;
