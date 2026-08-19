import { type ConfigInstance, config } from '@map-colonies/config';
import { commonBoilerplateV3, type commonBoilerplateV3Type } from '@map-colonies/schemas';

interface AdditionalConfig {
  db: {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
    application_name: string;
  };
}

type ConfigType = ConfigInstance<commonBoilerplateV3Type> & AdditionalConfig;

let configInstance: ConfigType | undefined;

/**
 * Initializes the configuration by fetching it from the server.
 * This should only be called from the instrumentation file.
 * @returns A Promise that resolves when the configuration is successfully initialized.
 */
async function initConfig(offlineMode?: boolean): Promise<void> {
  configInstance = (await config({
    schema: commonBoilerplateV3,
    offlineMode,
  })) as ConfigType;
}

function getConfig(): ConfigType {
  if (!configInstance) {
    throw new Error('config not initialized');
  }
  return configInstance;
}

export { getConfig, initConfig };
export type { ConfigType };
