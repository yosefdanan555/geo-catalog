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

type ConfigType = ConfigInstance<commonBoilerplateV3Type & AdditionalConfig>;

let configInstance: ConfigType | undefined;

async function initConfig(offlineMode?: boolean): Promise<void> {
  // Widened to AdditionalConfig: the schema validates only the boilerplate
  // sections, so `db` is carried through unvalidated and untyped without this.
  configInstance = (await config({
    schema: commonBoilerplateV3,
    offlineMode,
  })) as unknown as ConfigType;
}

function getConfig(): ConfigType {
  if (!configInstance) {
    throw new Error('config not initialized');
  }
  return configInstance;
}

export { getConfig, initConfig };
export type { ConfigType };
