import fs from 'fs';
import assert from 'node:assert';
import { describe, it } from 'node:test';
import os from 'os';
import path from 'path';
import { analyzeFileForGlobalHelpers } from '../../../server/helpers/analyzeGlobalHelpers';
import { GlobalHelperInfo } from '../../../types';

describe('analyzeGlobalHelpers', () => {
  it('should extract JSDoc from above Template.registerHelper call', async () => {
    // Create a temporary file with JSDoc above Template.registerHelper
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-lang-server-test-'));
    const testFile = path.join(tmpDir, 'test.ts');

    const content = `
/**
 * Truncates text to specified length
 * @param text - The text to truncate
 * @param maxLength - Maximum length
 * @returns Truncated text
 */
Template.registerHelper('truncate', function (text: string, maxLength: number = 50): string {
  if (!text || text.length <= maxLength) {
    return text || '';
  }
  return text.substring(0, maxLength) + '...';
});
`;

    fs.writeFileSync(testFile, content);

    const result = analyzeFileForGlobalHelpers(testFile);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].name, 'truncate');
    assert.ok(result[0].jsdoc?.includes('Truncates text to specified length'));
    assert.ok(result[0].jsdoc?.includes('@param text - The text to truncate'));
    assert.ok(result[0].jsdoc?.includes('@param maxLength - Maximum length'));
    assert.ok(result[0].jsdoc?.includes('@returns Truncated text'));

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should extract JSDoc from above function argument', async () => {
    // Create a temporary file with JSDoc above the function argument
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-lang-server-test-'));
    const testFile = path.join(tmpDir, 'test.ts');

    const content = `
Template.registerHelper(
  'percentage',
  /**
   * Calculates percentage from a fraction
   * @param numerator - The numerator value
   * @param denominator - The denominator value
   * @returns Percentage as string with % symbol
   */
  (numerator: number, denominator: number): string => {
    if (!denominator || denominator === 0) {
      return '0%';
    }
    const percent = Math.round((numerator / denominator) * 100);
    return \`\${percent}%\`;
  }
);
`;

    fs.writeFileSync(testFile, content);

    const result = analyzeFileForGlobalHelpers(testFile);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].name, 'percentage');
    assert.ok(result[0].jsdoc?.includes('Calculates percentage from a fraction'));
    assert.ok(result[0].jsdoc?.includes('@param numerator - The numerator value'));
    assert.ok(result[0].jsdoc?.includes('@param denominator - The denominator value'));
    assert.ok(result[0].jsdoc?.includes('@returns Percentage as string with % symbol'));

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should handle both patterns in the same file', async () => {
    // Create a temporary file with both JSDoc patterns
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-lang-server-test-'));
    const testFile = path.join(tmpDir, 'test.ts');

    const content = `
Template.registerHelper(
  'percentage',
  /**
   * Calculates percentage from a fraction
   * @param numerator - The numerator value
   * @param denominator - The denominator value
   * @returns Percentage as string with % symbol
   */
  (numerator: number, denominator: number): string => {
    if (!denominator || denominator === 0) {
      return '0%';
    }
    const percent = Math.round((numerator / denominator) * 100);
    return \`\${percent}%\`;
  }
);

/**
 * Truncates text to specified length with ellipsis
 * @param text - Text to truncate
 * @param maxLength - Maximum length before truncation
 * @returns Truncated text with ellipsis if needed
 */
Template.registerHelper('truncate', function (text: string, maxLength: number = 50): string {
  if (!text || text.length <= maxLength) {
    return text || '';
  }
  return text.substring(0, maxLength) + '...';
});
`;

    fs.writeFileSync(testFile, content);

    const result = analyzeFileForGlobalHelpers(testFile);

    assert.strictEqual(result.length, 2);

    const percentage = result.find((h: GlobalHelperInfo) => h.name === 'percentage');
    const truncate = result.find((h: GlobalHelperInfo) => h.name === 'truncate');

    assert.ok(percentage);
    assert.ok(percentage.jsdoc?.includes('Calculates percentage from a fraction'));

    assert.ok(truncate);
    assert.ok(truncate.jsdoc?.includes('Truncates text to specified length with ellipsis'));

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should handle helpers without JSDoc', async () => {
    // Create a temporary file with helpers but no JSDoc
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-lang-server-test-'));
    const testFile = path.join(tmpDir, 'test.ts');

    const content = `
Template.registerHelper('simpleHelper', function (value: string): string {
  return value.toUpperCase();
});
`;

    fs.writeFileSync(testFile, content);

    const result = analyzeFileForGlobalHelpers(testFile);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].name, 'simpleHelper');
    assert.strictEqual(result[0].jsdoc, undefined);

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should extract JSDoc from function references', async () => {
    // Create a temporary file with function references
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-lang-server-test-'));
    const testFile = path.join(tmpDir, 'test.ts');

    const content = `
/**
 * Trims whitespace from a string
 * @param {string} text - The text to trim
 * @returns {string} The trimmed text
 */
function trim(text) {
  return text.trim();
}

Template.registerHelper('trim', trim);

/**
 * Capitalizes the first letter
 * @param {string} str - The string to capitalize
 * @returns {string} The capitalized string
 */
const capitalize = (str) => {
  return str.charAt(0).toUpperCase() + str.slice(1);
};

Template.registerHelper('capitalize', capitalize);
`;

    fs.writeFileSync(testFile, content);

    const result = analyzeFileForGlobalHelpers(testFile);

    assert.strictEqual(result.length, 2);

    // Check trim helper
    const trimHelper = result.find((h: GlobalHelperInfo) => h.name === 'trim');
    assert.ok(trimHelper);
    assert.ok(trimHelper.jsdoc);
    assert.ok(trimHelper.jsdoc.includes('Trims whitespace from a string'));
    assert.ok(trimHelper.jsdoc.includes('@param {string} text - The text to trim'));
    assert.ok(trimHelper.jsdoc.includes('@returns {string} The trimmed text'));
    assert.strictEqual(trimHelper.signature, 'trim(text)');
    assert.strictEqual(trimHelper.parameters, 'text');

    // Check capitalize helper
    const capitalizeHelper = result.find((h: GlobalHelperInfo) => h.name === 'capitalize');
    assert.ok(capitalizeHelper);
    assert.ok(capitalizeHelper.jsdoc);
    assert.ok(capitalizeHelper.jsdoc.includes('Capitalizes the first letter'));
    assert.ok(capitalizeHelper.jsdoc.includes('@param {string} str - The string to capitalize'));
    assert.ok(capitalizeHelper.jsdoc.includes('@returns {string} The capitalized string'));
    assert.strictEqual(capitalizeHelper.signature, 'capitalize(str)');
    assert.strictEqual(capitalizeHelper.parameters, 'str');

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should extract JSDoc and signatures from TypeScript function references', async () => {
    // Create a temporary file with TypeScript function references
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-lang-server-test-'));
    const testFile = path.join(tmpDir, 'test.ts');

    const content = `
/**
 * Formats a number as currency
 * @param {number} amount - The amount to format
 * @param {string} currency - The currency code
 * @returns {string} The formatted currency string
 */
function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

Template.registerHelper('formatCurrency', formatCurrency);

/**
 * Calculates the percentage of a value
 * @param numerator - The numerator value
 * @param denominator - The denominator value
 * @returns Percentage as a number
 */
const calculatePercentage = (numerator: number, denominator: number): number => {
  if (denominator === 0) return 0;
  return (numerator / denominator) * 100;
};

Template.registerHelper('calculatePercentage', calculatePercentage);
`;

    fs.writeFileSync(testFile, content);

    const result = analyzeFileForGlobalHelpers(testFile);

    assert.strictEqual(result.length, 2);

    // Check formatCurrency helper
    const formatHelper = result.find((h: GlobalHelperInfo) => h.name === 'formatCurrency');
    assert.ok(formatHelper);
    assert.ok(formatHelper.jsdoc);
    assert.ok(formatHelper.jsdoc.includes('Formats a number as currency'));
    assert.ok(formatHelper.signature);
    assert.ok(formatHelper.signature.includes('formatCurrency'));
    assert.ok(formatHelper.parameters);

    // Check calculatePercentage helper
    const calcHelper = result.find((h: GlobalHelperInfo) => h.name === 'calculatePercentage');
    assert.ok(calcHelper);
    assert.ok(calcHelper.jsdoc);
    assert.ok(calcHelper.jsdoc.includes('Calculates the percentage'));
    assert.ok(calcHelper.signature);
    assert.ok(calcHelper.signature.includes('calculatePercentage'));
    assert.ok(calcHelper.parameters);

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true });
  });
});
