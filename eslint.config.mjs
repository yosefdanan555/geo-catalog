import tsBaseConfig from '@map-colonies/eslint-config/ts-base';
import vitestConfig from '@map-colonies/eslint-config/vitest';
import { namingConventions } from '@map-colonies/eslint-config/ts-base';
import { defineConfig } from 'eslint/config';

export default defineConfig(
  vitestConfig,
  tsBaseConfig,
  { ignores: ['vitest.config.mts'] },
  {
    // The product wire format (openapi3.yaml, the `products` DB columns, and the
    // env vars in src/common/db/dbConfig.ts) is snake_case/UPPER_SNAKE_CASE — an
    // external contract this project doesn't own the casing of, not an internal
    // style choice. Rather than sprinkle `as`/rename gymnastics at every call site
    // that touches those fields, camelCase is kept as the default everywhere and
    // snake_case is additionally allowed for the selectors that actually carry
    // those external names.
    name: 'project/wire-format-naming',
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/naming-convention': [
        ...namingConventions,
        {
          selector: ['objectLiteralProperty', 'typeProperty'],
          format: ['camelCase', 'snake_case', 'UPPER_CASE'],
        },
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE', 'snake_case'],
          modifiers: ['destructured'],
        },
      ],
    },
  },
  {
    // Geographic coordinates and byte offsets in test fixtures aren't the kind of
    // unexplained magic number this rule exists to catch (same reasoning the base
    // config already applies to *.spec.ts files — see `jestTurnedOffRules` — this
    // just extends it to the fixture module those spec files import from).
    name: 'project/test-fixtures',
    files: ['tests/factories/**/*.ts'],
    rules: {
      '@typescript-eslint/no-magic-numbers': 'off',
    },
  }
);
