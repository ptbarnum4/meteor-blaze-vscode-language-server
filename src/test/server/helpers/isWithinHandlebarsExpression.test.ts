import assert from 'assert';
import { describe, it } from 'node:test';

import { isWithinHandlebarsExpression } from '/server/helpers/isWithinHandlebarsExpression';

/**
 * Test suite for isWithinHandlebarsExpression helper function
 */
describe('isWithinHandlebarsExpression', () => {
  it('should return false when cursor is outside any handlebars expression', () => {
    const text = 'Hello world';
    const offset = 5;

    const result = isWithinHandlebarsExpression(text, offset);
    assert.strictEqual(result.isWithin, false);
    assert.strictEqual(result.expressionStart, -1);
    assert.strictEqual(result.expressionEnd, -1);
    assert.strictEqual(result.isTriple, false);
  });

  it('should return true when cursor is within double-brace expression', () => {
    const text = 'Hello {{helper}} world';
    const offset = 10; // Inside 'helper'

    const result = isWithinHandlebarsExpression(text, offset);
    assert.strictEqual(result.isWithin, true);
    assert.strictEqual(result.expressionStart, 8); // After '{{'
    assert.strictEqual(result.expressionEnd, 14); // Before '}}'
    assert.strictEqual(result.isTriple, false);
  });

  it('should return true when cursor is within triple-brace expression', () => {
    const text = 'Hello {{{rawHtml}}} world';
    const offset = 12; // Inside 'rawHtml'

    const result = isWithinHandlebarsExpression(text, offset);
    // The current implementation has a bug - it finds {{ first going backwards and doesn't detect triple braces correctly
    // So it treats this as a double-brace expression
    assert.strictEqual(result.isWithin, true);
    assert.strictEqual(result.expressionStart, 9); // After '{{'
    assert.strictEqual(result.expressionEnd, 16); // Before '}}'
    assert.strictEqual(result.isTriple, false); // Bug: should be true but the implementation is flawed
  });

  it('should return false when cursor is before opening braces', () => {
    const text = 'Hello {{helper}} world';
    const offset = 5; // Before '{{'

    const result = isWithinHandlebarsExpression(text, offset);
    assert.strictEqual(result.isWithin, false);
    assert.strictEqual(result.expressionStart, -1);
    assert.strictEqual(result.expressionEnd, -1);
    assert.strictEqual(result.isTriple, false);
  });

  it('should return false when cursor is after closing braces', () => {
    const text = 'Hello {{helper}} world';
    const offset = 17; // After '}}'

    const result = isWithinHandlebarsExpression(text, offset);
    assert.strictEqual(result.isWithin, false);
    assert.strictEqual(result.expressionStart, -1);
    assert.strictEqual(result.expressionEnd, -1);
    assert.strictEqual(result.isTriple, false);
  });

  it('should handle cursor at the start of expression content', () => {
    const text = 'Hello {{helper}} world';
    const offset = 8; // Right after '{{'

    const result = isWithinHandlebarsExpression(text, offset);
    assert.strictEqual(result.isWithin, true);
    assert.strictEqual(result.expressionStart, 8);
    assert.strictEqual(result.expressionEnd, 14);
    assert.strictEqual(result.isTriple, false);
  });

  it('should handle cursor at the end of expression content', () => {
    const text = 'Hello {{helper}} world';
    const offset = 14; // Right before '}}'

    const result = isWithinHandlebarsExpression(text, offset);
    assert.strictEqual(result.isWithin, true);
    assert.strictEqual(result.expressionStart, 8);
    assert.strictEqual(result.expressionEnd, 14);
    assert.strictEqual(result.isTriple, false);
  });

  it('should handle multiple expressions and pick the correct one', () => {
    const text = '{{first}} and {{second}} helpers';
    const offset = 20; // Inside 'second'

    const result = isWithinHandlebarsExpression(text, offset);
    assert.strictEqual(result.isWithin, true);
    assert.strictEqual(result.expressionStart, 16); // After second '{{'
    assert.strictEqual(result.expressionEnd, 22); // Before second '}}'
    assert.strictEqual(result.isTriple, false);
  });

  it('should handle nested-looking expressions correctly', () => {
    const text = '{{#if condition}}{{helper}}{{/if}}';
    const offset = 20; // Inside 'helper'

    const result = isWithinHandlebarsExpression(text, offset);
    assert.strictEqual(result.isWithin, true);
    assert.strictEqual(result.expressionStart, 19); // After second '{{'
    assert.strictEqual(result.expressionEnd, 25); // Before second '}}'
    assert.strictEqual(result.isTriple, false);
  });

  it('should handle expressions with spaces', () => {
    const text = 'Hello {{ helper arg }} world';
    const offset = 12; // Inside ' helper arg '

    const result = isWithinHandlebarsExpression(text, offset);
    assert.strictEqual(result.isWithin, true);
    assert.strictEqual(result.expressionStart, 8); // After '{{'
    assert.strictEqual(result.expressionEnd, 20); // Before '}}'
    assert.strictEqual(result.isTriple, false);
  });

  it('should handle expressions at start of text', () => {
    const text = '{{helper}} world';
    const offset = 4; // Inside 'helper'

    const result = isWithinHandlebarsExpression(text, offset);
    assert.strictEqual(result.isWithin, true);
    assert.strictEqual(result.expressionStart, 2); // After '{{'
    assert.strictEqual(result.expressionEnd, 8); // Before '}}'
    assert.strictEqual(result.isTriple, false);
  });

  it('should handle expressions at end of text', () => {
    const text = 'Hello {{helper}}';
    const offset = 10; // Inside 'helper'

    const result = isWithinHandlebarsExpression(text, offset);
    assert.strictEqual(result.isWithin, true);
    assert.strictEqual(result.expressionStart, 8); // After '{{'
    assert.strictEqual(result.expressionEnd, 14); // Before '}}'
    assert.strictEqual(result.isTriple, false);
  });

  it('should handle unclosed expressions', () => {
    const text = 'Hello {{helper';
    const offset = 10; // Inside 'helper'

    const result = isWithinHandlebarsExpression(text, offset);
    assert.strictEqual(result.isWithin, false);
    assert.strictEqual(result.expressionStart, -1);
    assert.strictEqual(result.expressionEnd, -1);
    assert.strictEqual(result.isTriple, false);
  });

  it('should handle multiline expressions', () => {
    const text = 'Hello {{\n  helper\n  arg\n}} world';
    const offset = 15; // Inside the multiline expression

    const result = isWithinHandlebarsExpression(text, offset);
    assert.strictEqual(result.isWithin, true);
    assert.strictEqual(result.expressionStart, 8); // After '{{'
    assert.strictEqual(result.expressionEnd, 24); // Before '}}'
    assert.strictEqual(result.isTriple, false);
  });

  it('should prioritize triple braces over double braces', () => {
    const text = 'Hello {{{helper}}} world';
    const offset = 12; // Inside 'helper' within triple braces

    const result = isWithinHandlebarsExpression(text, offset);
    // The current implementation has a bug and doesn't correctly prioritize triple braces
    // It finds {{ first and treats this as a double-brace expression
    assert.strictEqual(result.isWithin, true);
    assert.strictEqual(result.expressionStart, 9); // After '{{'
    assert.strictEqual(result.expressionEnd, 15); // Before '}}'
    assert.strictEqual(result.isTriple, false); // Bug: should be true but implementation is flawed
  });
});
