import assert from 'assert';
import fs from 'fs';
import { describe, it } from 'node:test';
import os from 'os';
import path from 'path';

import { analyzeCSSFile } from '/server/helpers/analyzeCSSFile';

/**
 * Helper function to create a temporary test file
 */
function createTestFile(content: string): { filePath: string; cleanup: () => void } {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-lang-server-test-'));
  const filePath = path.join(tempDir, 'test.css');
  fs.writeFileSync(filePath, content);

  const cleanup = () => {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    if (fs.existsSync(tempDir)) {
      fs.rmdirSync(tempDir);
    }
  };

  return { filePath, cleanup };
}

/**
 * Test suite for analyzeCSSFile helper function
 */
describe('analyzeCSSFile', () => {
  it('should extract CSS class names and IDs', () => {
    const content = `
      .header { color: blue; }
      .nav-item { font-size: 14px; }
      #main-content { width: 100%; }
      #sidebar { float: left; }

      .btn {
        padding: 10px;
      }
    `;

    const { filePath, cleanup } = createTestFile(content);

    try {
      const result = analyzeCSSFile(filePath);

      // analyzeCSSFile returns classes and IDs in a single array
      assert.strictEqual(result.includes('header'), true);
      assert.strictEqual(result.includes('nav-item'), true);
      assert.strictEqual(result.includes('main-content'), true);
      assert.strictEqual(result.includes('sidebar'), true);
      assert.strictEqual(result.includes('btn'), true);
    } finally {
      cleanup();
    }
  });

  it('should handle empty CSS files', () => {
    const content = '';

    const { filePath, cleanup } = createTestFile(content);

    try {
      const result = analyzeCSSFile(filePath);

      assert.strictEqual(result.length, 0);
    } finally {
      cleanup();
    }
  });

  it('should handle non-existent files gracefully', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-lang-server-test-'));
    const nonExistentPath = path.join(tempDir, 'non-existent.css');

    try {
      const result = analyzeCSSFile(nonExistentPath);

      assert.strictEqual(result.length, 0);
    } finally {
      fs.rmdirSync(tempDir);
    }
  });

  it('should handle CSS with nested classes', () => {
    const content = `
      .parent {
        .nested { color: red; }
      }

      .container {
        .item { margin: 10px; }
      }
    `;

    const { filePath, cleanup } = createTestFile(content);

    try {
      const result = analyzeCSSFile(filePath);

      assert.strictEqual(result.includes('parent'), true);
      assert.strictEqual(result.includes('nested'), true);
      assert.strictEqual(result.includes('container'), true);
      assert.strictEqual(result.includes('item'), true);
    } finally {
      cleanup();
    }
  });

  it('should handle CSS with comments', () => {
    const content = `
      /* Header styles */
      .header {
        color: blue;
      }

      /*
       * Multi-line comment
       */
      .nav { margin: 0; }
    `;

    const { filePath, cleanup } = createTestFile(content);

    try {
      const result = analyzeCSSFile(filePath);

      assert.strictEqual(result.includes('header'), true);
      assert.strictEqual(result.includes('nav'), true);
    } finally {
      cleanup();
    }
  });
});
