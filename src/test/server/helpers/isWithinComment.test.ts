import assert from 'assert';
import { describe, it } from 'node:test';

import { isWithinComment } from '../../../server/helpers/isWithinComment';

/**
 * Test suite for isWithinComment helper function
 */
describe('isWithinComment', () => {
  describe('HTML Comments', () => {
    it('should return false when cursor is outside any comment', () => {
      const text = 'Hello world';
      const offset = 5;

      const result = isWithinComment(text, offset);
      assert.strictEqual(result.isWithin, false);
      assert.strictEqual(result.commentType, null);
    });

    it('should return true when cursor is within HTML comment', () => {
      const text = 'Hello <!-- comment --> world';
      const offset = 12; // Inside 'comment'

      const result = isWithinComment(text, offset);
      assert.strictEqual(result.isWithin, true);
      assert.strictEqual(result.commentType, 'html');
    });

    it('should return true for Blaze code in HTML comments', () => {
      const text = '<!-- {{#if data2}}\n      Hello!\n   {{/if}} -->';
      const offset = 15; // Inside the Blaze code

      const result = isWithinComment(text, offset);
      assert.strictEqual(result.isWithin, true);
      assert.strictEqual(result.commentType, 'html');
    });
  });

  describe('Handlebars Comments', () => {
    it('should return true when cursor is within handlebars block comment', () => {
      const text = 'Hello {{!-- block comment --}} world';
      const offset = 15; // Inside 'block comment'

      const result = isWithinComment(text, offset);
      assert.strictEqual(result.isWithin, true);
      assert.strictEqual(result.commentType, 'handlebars-block');
    });

    it('should return true for Blaze code in Handlebars comments', () => {
      const text = '{{!-- {{#if data2}}\n      Hello!\n   {{/if}} --}}';
      const offset = 15; // Inside the Blaze code

      const result = isWithinComment(text, offset);
      assert.strictEqual(result.isWithin, true);
      assert.strictEqual(result.commentType, 'handlebars-block');
    });

    it('should return true when cursor is within handlebars inline comment', () => {
      const text = 'Hello {{! inline comment }} world';
      const offset = 15; // Inside 'inline comment'

      const result = isWithinComment(text, offset);
      assert.strictEqual(result.isWithin, true);
      assert.strictEqual(result.commentType, 'handlebars-inline');
    });
  });

  describe('JavaScript Comments', () => {
    it('should return true when cursor is within JavaScript line comment', () => {
      const text = 'var x = 5; // this is a comment';
      const offset = 20; // Inside the comment

      const result = isWithinComment(text, offset);
      assert.strictEqual(result.isWithin, true);
      assert.strictEqual(result.commentType, 'javascript-line');
    });

    it('should return true when cursor is within JavaScript block comment', () => {
      const text = 'var x = 5; /* this is a block comment */ var y = 10;';
      const offset = 20; // Inside the comment

      const result = isWithinComment(text, offset);
      assert.strictEqual(result.isWithin, true);
      assert.strictEqual(result.commentType, 'javascript-block');
    });
  });

  describe('Real world examples from template', () => {
    it('should detect comments in template with mixed Blaze and HTML comments', () => {
      const text = `{{!-- {{#if data2}}
      Hello!
   {{/if}} --}}

      {{!-- {{data4}} --}}

      {{!-- {{ifTrue data3 data1 data4}} --}}
      <!-- {{#if data2}}
      Hello!
       {{/if}} -->

      <!-- {{data4}} -->

      <!-- {{ifTrue data3 data1 data4}} -->`;

      // Test various positions within comments
      const positions = [
        { offset: 10, expected: 'handlebars-block' }, // Inside first handlebars comment
        { offset: 65, expected: 'handlebars-block' }, // Inside second handlebars comment (at 'data4')
        { offset: 140, expected: 'html' }, // Inside first HTML comment
        { offset: 195, expected: 'html' }, // Inside second HTML comment
      ];

      positions.forEach(({ offset, expected }) => {
        const result = isWithinComment(text, offset);
        assert.strictEqual(result.isWithin, true, `Position ${offset} should be in comment`);
        assert.strictEqual(result.commentType, expected, `Position ${offset} should be ${expected} comment`);
      });
    });
  });
});
