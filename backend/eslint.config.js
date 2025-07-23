// backend/eslint.config.js
import enforceCorrectCookiePolicy from './.eslint/rules/enforce-correct-cookie-policy.js';
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
          'enforce-correct-cookie-policy': enforceCorrectCookiePolicy
        }
      }
    },
    rules: {
      'custom-rules/enforce-correct-cookie-policy': 'error',
    }
  }
];
