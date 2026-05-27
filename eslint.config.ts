import { defineConfig, globalIgnores } from 'eslint/config';
import pluginJs from '@eslint/js';
import pluginTypeScriptESLint from 'typescript-eslint';
import parserTypeScript from '@typescript-eslint/parser';
import pluginReact from 'eslint-plugin-react';
import pluginReactHooks from 'eslint-plugin-react-hooks';
import pluginNode from 'eslint-plugin-n';
import pluginImport from 'eslint-plugin-import';
import configPrettier from 'eslint-config-prettier';
import pluginJsxA11y from 'eslint-plugin-jsx-a11y';

import globals from 'globals';

export default defineConfig([
  pluginReact.configs.flat.recommended,
  pluginReact.configs.flat['jsx-runtime'],
  pluginJs.configs.recommended,
  pluginReactHooks.configs.flat.recommended,
  pluginTypeScriptESLint.configs.recommended,
  pluginImport.flatConfigs.electron,
  pluginJsxA11y.flatConfigs.recommended,
  pluginNode.configs['flat/recommended-script'],
  globalIgnores([
    '**/.idea',
    '**/.vscode',
    '**/node_modules',
    '**/dist',
    '**/build',
    '**/*-lock.json',
    '**/*-lock.yaml'
  ]),
  {
    files: ['**/*.{js,mjs,cjs,ts,jsx,tsx}'],
    settings: {
      react: {
        version: 'detect'
      }
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node
      },
      parserOptions: {
        parser: parserTypeScript,
        requireConfigFile: false,
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    rules: {
      eqeqeq: 'error',
      'require-yield': 'warn',
      'no-unused-vars': 'off',
      'no-case-declarations': 'off',
      'no-trailing-spaces': 'error',
      'no-unsafe-optional-chaining': 'off',
      'no-control-regex': 'off',
      'n/no-missing-import': 'off',
      'n/no-unpublished-import': 'off',
      'n/no-unpublished-require': 'off',
      'n/no-missing-require': 'off',
      'n/no-process-exit': 'off',
      'n/no-deprecated-api': 'off',
      'n/no-unsupported-features/node-builtins': 'off',
      'jsx-a11y/anchor-is-valid': 0,
      'jsx-a11y/label-has-associated-control': 1,
      'jsx-a11y/no-noninteractive-element-interactions': 0,
      'jsx-a11y/click-events-have-key-events': 0,
      'jsx-a11y/no-static-element-interactions': 0,
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_'
        }
      ],
      '@typescript-eslint/explicit-module-boundary-types': 'off'
    }
  },
  {
    files: ['**/*.{js,cjs,mjs}'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off'
    }
  },
  configPrettier
]);
