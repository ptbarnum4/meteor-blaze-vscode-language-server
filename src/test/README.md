# Testing Guide for Meteor Blaze VS Code Language Server

This document describes the testing framework and how to run tests for the Meteor Blaze VS Code Language Server.

## Testing Framework

This project uses VS Code's built-in testing framework with the following tools:

- **@vscode/test-cli**: Command-line test runner for VS Code extensions
- **@vscode/test-electron**: VS Code extension testing utilities
- **Node.js built-in `assert`**: Assertion library for unit tests

## Test Structure

```
src/test/
├── runTest.ts                    # Main test runner
├── suite/
│   ├── index.ts                 # Test suite configuration
│   └── extension.test.ts        # Basic extension tests
└── server/
    └── helpers/                 # Unit tests for server helpers
        ├── containsMeteorTemplates.test.ts
        ├── isWithinHandlebarsExpression.test.ts
        ├── trimUsageDocumentation.test.ts
        ├── getWordRangeAtPosition.test.ts
        ├── analyzeJavaScriptFile.test.ts
        └── analyzeCSSFile.test.ts
```

## Running Tests

### Prerequisites

Make sure you have compiled the TypeScript code:

```bash
npm run compile-tests
npm run compile
```

### Running All Tests

```bash
npm test
```

### Running Tests in Watch Mode

```bash
npm run watch-tests
```

## Test Categories

### 1. Unit Tests for Helper Functions

Located in `src/test/server/helpers/`, these tests cover individual helper functions:

#### `containsMeteorTemplates.test.ts`
Tests the function that detects whether a document contains Meteor templates.

**Test Cases:**
- Documents with valid Meteor templates
- Templates with single/double quotes
- Templates with additional attributes
- Documents without templates
- Empty documents
- Multiple templates

#### `isWithinHandlebarsExpression.test.ts`
Tests cursor position detection within Handlebars expressions.

**Test Cases:**
- Double braces `{{}}`
- Triple braces `{{{}}`
- Cursor outside expressions
- Nested expressions
- Expression boundaries
- Multiple expressions

#### `trimUsageDocumentation.test.ts`
Tests documentation string formatting and indentation normalization.

**Test Cases:**
- Default usage generation
- Whitespace trimming
- Leading/trailing empty line removal
- Indentation normalization
- Mixed indentation handling
- Single line usage

#### `getWordRangeAtPosition.test.ts`
Tests word boundary detection for language features.

**Test Cases:**
- Simple words
- Words with hash prefix (`#each`)
- Words with @ prefix (`@index`)
- Words with underscores and numbers
- Invalid positions
- Multiline content

#### `analyzeJavaScriptFile.test.ts`
Tests JavaScript/TypeScript file analysis for helper extraction.

**Test Cases:**
- Basic `Template.helpers()` calls
- JSDoc comment parsing
- TypeScript syntax support
- Arrow function syntax
- Function property syntax
- Multiple template calls
- File error handling
- Complex nested braces

#### `analyzeCSSFile.test.ts`
Tests CSS/LESS file analysis for class extraction.

**Test Cases:**
- Basic CSS classes
- Classes with hyphens and numbers
- Nested classes (LESS/SCSS)
- ID selectors
- Duplicate class handling
- Media queries and pseudo-classes
- CSS comments
- LESS variables and mixins

### 2. Extension Integration Tests

Located in `src/test/suite/extension.test.ts`, these tests verify the extension loads correctly in VS Code.

## Writing New Tests

### Test Structure

Use the `suite()` and `test()` functions from VS Code's testing framework:

```typescript
import assert from 'assert';
import { yourFunction } from '../../../path/to/function';

suite('Your Function Name', () => {
  test('should do something specific', () => {
    const result = yourFunction(input);
    assert.strictEqual(result, expectedValue);
  });

  test('should handle edge cases', () => {
    const result = yourFunction(edgeCaseInput);
    assert.strictEqual(result, expectedEdgeCaseValue);
  });
});
```

### Best Practices

1. **Descriptive Test Names**: Use clear, descriptive names that explain what the test verifies
2. **Arrange-Act-Assert**: Structure tests with clear setup, execution, and assertion phases
3. **Edge Cases**: Always test edge cases like empty inputs, null values, and boundary conditions
4. **Cleanup**: Use `setup()` and `teardown()` hooks for test data management
5. **Mocking**: Mock external dependencies to isolate the code under test

### File Testing Helpers

For tests that need to create temporary files:

```typescript
import fs from 'fs';
import path from 'path';
import os from 'os';

suite('File Testing Example', () => {
  let tempDir: string;
  let testFilePath: string;

  setup(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
    testFilePath = path.join(tempDir, 'test.js');
  });

  teardown(() => {
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
    if (fs.existsSync(tempDir)) {
      fs.rmdirSync(tempDir);
    }
  });

  test('should analyze file content', () => {
    fs.writeFileSync(testFilePath, 'test content');
    const result = analyzeFile(testFilePath);
    assert.strictEqual(result.length, 1);
  });
});
```

## Debugging Tests

### VS Code Debug Configuration

Add this configuration to `.vscode/launch.json`:

```json
{
  "name": "Extension Tests",
  "type": "extensionHost",
  "request": "launch",
  "args": [
    "--extensionDevelopmentPath=${workspaceFolder}",
    "--extensionTestsPath=${workspaceFolder}/out/test/suite/index"
  ],
  "outFiles": [
    "${workspaceFolder}/out/test/**/*.js"
  ],
  "preLaunchTask": "${workspaceFolder}:compile-tests"
}
```

### Console Output

Use `console.log()` in tests for debugging output. The output will appear in the Debug Console when running tests in debug mode.

## Continuous Integration

Tests are automatically run in CI/CD pipelines. Ensure all tests pass before merging pull requests.

### GitHub Actions Example

```yaml
- name: Run Tests
  run: |
    npm run compile-tests
    npm run compile
    npm test
```

## Coverage

While not currently configured, you can add test coverage using tools like `nyc` (Istanbul):

```bash
npm install --save-dev nyc
```

Add to `package.json`:

```json
{
  "scripts": {
    "test:coverage": "nyc npm test"
  }
}
```

## Troubleshooting

### Common Issues

1. **"Module not found" errors**: Ensure all imports use the correct relative paths
2. **"Cannot find type definitions"**: Make sure `@types/node` and VS Code types are installed
3. **Tests timeout**: Increase timeout for async tests or check for hanging promises
4. **File system errors**: Ensure proper cleanup in teardown hooks

### Performance Tips

1. Use `setup()` and `teardown()` for expensive operations
2. Mock file system operations when possible
3. Avoid creating large test files unnecessarily
4. Use `test.skip()` to temporarily disable slow tests during development

## Contributing

When adding new functionality, please include corresponding tests:

1. Add unit tests for helper functions
2. Add integration tests for language features
3. Update this README if adding new test categories
4. Ensure all tests pass before submitting PR

For questions about testing, please check existing tests for examples or open an issue.
