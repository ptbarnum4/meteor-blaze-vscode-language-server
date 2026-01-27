import * as assert from 'assert';
import { describe, it } from 'mocha';
import { getTemplateCommentContext } from '../../server/helpers/isWithinTemplateComment';

describe('isWithinTemplateComment', () => {
  describe('getTemplateCommentContext', () => {
    it('should detect cursor inside template comment', () => {
      const text = `
<template name="test">
  {{!-- @param {string} name --}}
  <div>{{name}}</div>
</template>
      `;

      // Position inside the comment
      const offset = text.indexOf('@param');
      const context = getTemplateCommentContext(text, offset);

      assert.ok(context);
      assert.strictEqual(context.templateName, 'test');
      assert.strictEqual(context.isWithin, true);
    });

    it('should return null when cursor outside comment', () => {
      const text = `
<template name="test">
  <div>{{name}}</div>
</template>
      `;

      // Position outside any comment
      const offset = text.indexOf('<div>');
      const context = getTemplateCommentContext(text, offset);

      assert.strictEqual(context.isWithin, false);
    });

    it('should detect cursor position on tag', () => {
      const text = `
<template name="test">
  {{!-- @param {string} name --}}
</template>
      `;

      // Position right after "@par"
      const offset = text.indexOf('@param') + 4;
      const context = getTemplateCommentContext(text, offset);

      assert.ok(context);
      assert.ok(context.cursorInTag);
    });

    it('should handle multi-line comments', () => {
      const text = `
<template name="test">
  {{!--
    @param {string} firstName
    @param {string} lastName
  --}}
</template>
      `;

      // Position in middle of comment
      const offset = text.indexOf('firstName');
      const context = getTemplateCommentContext(text, offset);

      assert.ok(context);
      assert.strictEqual(context.isWithin, true);
      assert.strictEqual(context.templateName, 'test');
    });

    it('should detect template name from preceding template tag', () => {
      const text = `
<template name="myTemplate">
  {{!-- @param {string} test --}}
</template>
      `;

      const offset = text.indexOf('@param');
      const context = getTemplateCommentContext(text, offset);

      assert.ok(context);
      assert.strictEqual(context.templateName, 'myTemplate');
    });

    it('should handle empty comment', () => {
      const text = `
<template name="test">
  {{!--  --}}
</template>
      `;

      // Position inside empty comment
      const offset = text.indexOf('{{!--') + 6;
      const context = getTemplateCommentContext(text, offset);

      assert.ok(context);
      assert.strictEqual(context.isWithin, true);
    });
  });
});
