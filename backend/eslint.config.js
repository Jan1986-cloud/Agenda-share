// backend/eslint.config.js
import enforceLaxCookiePolicy from './.eslint/rules/enforce-lax-cookie-policy.js';
import enforceProductionCookiePolicy from './.eslint/rules/enforce-production-cookie-policy.js';
import globals from 'globals';

export default [
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2021,
      }
    },
    plugins: {
      'custom-rules': {
        rules: {
          'enforce-lax-cookie-policy': enforceLaxCookiePolicy,
          'enforce-production-cookie-policy': enforceProductionCookiePolicy
        }
      }
    },
    rules: {
      'custom-rules/enforce-lax-cookie-policy': 'off', // Disable the old rule
      'custom-rules/enforce-production-cookie-policy': 'error',
    }
  }
];
