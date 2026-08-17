// Same source as eslint.config.mjs's `@map-colonies/eslint-config` — reuse the
// org-wide style (single quotes, 150-char print width, es5 trailing commas)
// instead of redeclaring it here.
module.exports = {
  ...require('@map-colonies/prettier-config'),
};
