import app from './app';
import { config } from './libs/config';
import { logger } from './libs/logger';

app.listen(config.port, () => {
  logger.info(`Geospatial Catalog API listening on port ${config.port}`);
});
