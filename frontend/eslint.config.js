// frontend/eslint.config.js
import globals from "globals";
import pluginJs from "@eslint/js";
import pluginReactConfig from "eslint-plugin-react/configs/recommended.js";
import noRestrictedImports from 'eslint-plugin-no-restricted-imports';

export default [
  { files: ["**/*.{js,mjs,cjs,jsx}"] },
  { languageOptions: { globals: globals.browser } },
  pluginJs.configs.recommended,
  pluginReactConfig,
  {
    plugins: {
      'no-restricted-imports': noRestrictedImports
    },
    rules: {
      'react/prop-types': 'off',
      'no-restricted-imports': ['error', {
        "patterns": [{
          "group": ["/api/*", "/dashboard", "/login", "/appointments", "/link-editor", "/planning"],
          "message": "Please use 'apiRoutes' for all application and API routes."
        }]
      }]
    }
  }
];