import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';

// NODE_ENV selects which env file to load. Jest sets NODE_ENV=test automatically,
// so integration tests transparently point at the isolated test database.
const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
dotenv.config({ path: path.join(__dirname, '../../../', envFile), quiet: true });

// Fail fast: an invalid or missing env var should crash startup with a clear
// message, not surface as a confusing runtime error three layers down.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  // Two ways to configure the database, deliberately both supported:
  //  - DATABASE_URL: one connection string. Simplest for local dev (.env/.env.test).
  //  - DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME: discrete parts. This is the
  //    natural fit for Kubernetes, where a password usually comes from a Secret
  //    (e.g. a Bitnami-style postgresql chart's auto-generated secret only holds
  //    the raw password, not a ready-made URL) while host/port/user/db name are
  //    plain, non-secret values — see helm/api/values.yaml.
  DATABASE_URL: z.string().min(1).optional(),
  DB_HOST: z.string().min(1).optional(),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_USER: z.string().min(1).optional(),
  DB_PASSWORD: z.string().min(1).optional(),
  DB_NAME: z.string().min(1).optional(),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const issues = parsedEnv.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

const env = parsedEnv.data;

// No hardcoded fallback connection string on purpose: silently defaulting to
// some database is an easy way to talk to the wrong one. Every environment
// must set DATABASE_URL, or all of DB_HOST/DB_USER/DB_PASSWORD/DB_NAME, explicitly.
function resolveConnectionString(): string {
  if (env.DATABASE_URL) return env.DATABASE_URL;

  if (env.DB_HOST && env.DB_USER && env.DB_PASSWORD && env.DB_NAME) {
    const user = encodeURIComponent(env.DB_USER);
    const password = encodeURIComponent(env.DB_PASSWORD);
    return `postgres://${user}:${password}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`;
  }

  throw new Error(
    'Invalid environment configuration:\n' +
      '  - Set DATABASE_URL, or all of DB_HOST, DB_USER, DB_PASSWORD, DB_NAME'
  );
}

export const config = {
  env: env.NODE_ENV,
  port: env.PORT,
  database: {
    connectionString: resolveConnectionString(),
  },
};
