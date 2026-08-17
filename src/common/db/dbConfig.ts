import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

/**
 * Database connection configuration.
 *
 * This lives outside `@map-colonies/config` on purpose: the `commonBoilerplateV3`
 * schema (server/telemetry/openapi) ships with the boilerplate and knows nothing
 * about this service's PostGIS-backed `products` table. Its `db` section is read
 * directly from this service's own JSON files in `config/` instead, validated
 * with zod — same node-config-style layering as the rest of `config/`
 * (`default.json` always applies, `{NODE_ENV}.json` layers on top of it), just
 * parsed by hand rather than through the commonBoilerplateV3 schema.
 *
 * Only one shape is supported: discrete host/port/username/password/database
 * fields, always all required. No connection-string alternative — there's
 * nothing a URL buys here that JSON layering doesn't already give for free.
 */
const NODE_ENV = process.env.NODE_ENV ?? 'development';

// Matches `@map-colonies/config`'s own local-config resolution: relative to the
// process's working directory, not this file's location, so it finds
// `dist/config` when running the built app (cwd is `dist/`) and the repo-root
// `config/` when running from source (tests, `tsx`).
const CONFIG_DIR = path.join(process.cwd(), 'config');

function readJsonFile(fileName: string): unknown {
  const filePath = path.join(CONFIG_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function extractDbSection(rawConfig: unknown): Record<string, unknown> {
  if (typeof rawConfig !== 'object' || rawConfig === null || Array.isArray(rawConfig)) {
    return {};
  }
  const { db } = rawConfig as Record<string, unknown>;
  return typeof db === 'object' && db !== null && !Array.isArray(db) ? (db as Record<string, unknown>) : {};
}

const mergedDb = {
  ...extractDbSection(readJsonFile('default.json')),
  ...extractDbSection(readJsonFile(`${NODE_ENV}.json`)),
};

const dbConfigSchema = z.object({
  host: z.string().min(1),
  port: z.coerce.number().int().positive(),
  username: z.string().min(1),
  password: z.string().min(1),
  database: z.string().min(1),
});

const parsedDbConfig = dbConfigSchema.safeParse(mergedDb);

if (!parsedDbConfig.success) {
  const issues = parsedDbConfig.error.issues.map((issue) => `  - db.${issue.path.join('.')}: ${issue.message}`).join('\n');
  throw new Error(
    `Invalid database configuration:\n${issues}\n` +
      `Set "db.host"/"db.port"/"db.username"/"db.password"/"db.database" in config/default.json (and/or config/${NODE_ENV}.json).`
  );
}

export const dbConfig = parsedDbConfig.data;
