import js from '@eslint/js';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    plugins: {
      '@typescript-eslint': typescriptEslint
    },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        project: './tsconfig.json'
      },
      globals: {
        // Node.js globals
        console: 'readonly',
        process: 'readonly',
        require: 'readonly',
        __dirname: 'readonly',
        setTimeout: 'readonly',
        // Browser/VS Code globals
        Thenable: 'readonly',
        // Test globals
        suite: 'readonly',
        test: 'readonly'
      }
    },
    rules: {
      '@typescript-eslint/naming-convention': [
        'warn',
        {
          selector: 'import',
          format: ['camelCase', 'PascalCase']
        }
      ],
      'no-useless-escape': 'off',
      curly: 'warn',
      eqeqeq: 'warn',
      'no-throw-literal': 'warn',
      semi: 'warn',
      // Allow unused vars with underscore prefix
      // 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-unused-vars': 'off',
      // Allow empty blocks for catch statements and other intentional cases
      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  }
];
