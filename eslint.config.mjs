import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import { defineConfig } from 'eslint/config';
import Globals from 'globals';
import tslint from 'typescript-eslint';

export default defineConfig(
  eslint.configs.recommended,
  tslint.configs.recommended,
  prettier,
  {
    files: ['src/**/*.ts', './.prettierc.ts'],
    ignores: ['dist/**', 'node_modules/**', 'test-project/**'],
    languageOptions: {
      ecmaVersion: 2022,
      // sourceType: 'module',
      parserOptions: { project: './tsconfig.json' },
      globals: { ...Globals.node, ...Globals.mocha },
    },
    rules: {
      '@typescript-eslint/naming-convention': [
        'warn',
        {
          selector: 'import',
          format: ['camelCase', 'PascalCase'],
        },
      ],
      // Typescript handles this. If enabled, it will break ts import check
      'import/no-unresolved': 'off',
      'no-useless-escape': 'off',
      curly: 'warn',
      eqeqeq: 'warn',
      'no-throw-literal': 'warn',
      '@typescript-eslint/no-this-alias': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      // '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-deprecated': 'error',
      'one-var': ['error', 'never'],
      semi: 'warn',
      // Allow unused vars with underscore prefix
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // Allow empty blocks for catch statements and other intentional cases
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  }
);
