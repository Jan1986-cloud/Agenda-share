// backend/eslint.config.js
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
          'enforce-production-cookie-policy': enforceProductionCookiePolicy
        }
      }
    },
    rules: {
      'custom-rules/enforce-production-cookie-policy': 'error',
    }
  }
];
