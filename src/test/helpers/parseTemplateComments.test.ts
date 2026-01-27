import * as assert from 'assert';
import { describe, it } from 'mocha';
import {
  extractAllTemplateComments,
  extractTemplateComment,
  parseTemplateDocTags,
  validateTemplateDoc,
} from '../../server/helpers/parseTemplateComments';

describe('parseTemplateComments', () => {
  describe('extractTemplateComment', () => {
    it('should extract first comment from template', () => {
      const html = `
<template name="test">
  {{!-- @param {string} name --}}
  <div>{{name}}</div>
</template>
      `;
      const result = extractTemplateComment(html, 'test');
      assert.ok(result);
      assert.strictEqual(result.templateName, 'test');
      assert.ok(result.commentText.includes('@param'));
    });

    it('should return null if no comments exist', () => {
      const html = `
<template name="test">
  <div>No comments</div>
</template>
      `;
      const result = extractTemplateComment(html, 'test');
      assert.strictEqual(result, null);
    });

    it('should handle multi-line comments', () => {
      const html = `
<template name="test">
  {{!--
    @param {string} firstName
    @param {string} lastName
  --}}
  <div>{{firstName}} {{lastName}}</div>
</template>
      `;
      const result = extractTemplateComment(html, 'test');
      assert.ok(result);
      assert.ok(result.commentText.includes('firstName'));
      assert.ok(result.commentText.includes('lastName'));
    });
  });

  describe('parseTemplateDocTags', () => {
    it('should parse @param with type and description', () => {
      const comment = '@param {string} userName - The user name';
      const tags = parseTemplateDocTags(comment);

      assert.strictEqual(tags.length, 1);
      assert.strictEqual(tags[0].tag, 'param');
      assert.strictEqual(tags[0].name, 'userName');
      assert.strictEqual(tags[0].type, 'string');
      assert.strictEqual(tags[0].description, 'The user name');
      assert.strictEqual(tags[0].optional, false);
    });

    it('should parse @param with optional indicator', () => {
      const comment = '@param {string} [userName] - Optional user name';
      const tags = parseTemplateDocTags(comment);

      assert.strictEqual(tags.length, 1);
      assert.strictEqual(tags[0].optional, true);
    });

    it('should parse @param with complex types', () => {
      const comment =
        '@param {{ name: string; age: number }} user - User object';
      const tags = parseTemplateDocTags(comment);

      assert.strictEqual(tags.length, 1);
      assert.strictEqual(tags[0].type, '{ name: string; age: number }');
    });

    it('should parse @template tag', () => {
      const comment = '@template myTemplate';
      const tags = parseTemplateDocTags(comment);

      assert.strictEqual(tags.length, 1);
      assert.strictEqual(tags[0].tag, 'template');
      assert.strictEqual(tags[0].name, 'myTemplate');
    });

    it('should parse @description tag', () => {
      const comment = '@description This is a test template';
      const tags = parseTemplateDocTags(comment);

      assert.strictEqual(tags.length, 1);
      assert.strictEqual(tags[0].tag, 'description');
      assert.strictEqual(tags[0].description, 'This is a test template');
    });

    it('should handle multi-line descriptions', () => {
      const comment = `@description This is a long
description that spans
multiple lines`;
      const tags = parseTemplateDocTags(comment);

      assert.strictEqual(tags.length, 1);
      assert.ok(tags[0].description?.includes('long'));
      assert.ok(tags[0].description?.includes('multiple lines'));
    });
  });

  describe('validateTemplateDoc', () => {
    it('should validate @template matches actual name', () => {
      const tags = parseTemplateDocTags('@template wrongName');
      const issues = validateTemplateDoc(tags, 'actualName', 'warning');

      assert.strictEqual(issues.length, 1);
      assert.ok(issues[0].message.includes('does not match'));
    });

    it('should detect duplicate parameter names', () => {
      const comment = `
        @param {string} name - First
        @param {number} name - Second
      `;
      const tags = parseTemplateDocTags(comment);
      const issues = validateTemplateDoc(tags, 'test', 'warning');

      const duplicateIssues = issues.filter((i) =>
        i.message.includes('Duplicate')
      );
      assert.ok(duplicateIssues.length > 0);
    });

    it('should return empty array when validation is off', () => {
      const tags = parseTemplateDocTags('@template wrongName');
      const issues = validateTemplateDoc(tags, 'actualName', 'off');

      assert.strictEqual(issues.length, 0);
    });
  });

  describe('extractAllTemplateComments', () => {
    it('should extract comments from multiple templates', () => {
      const html = `
<template name="template1">
  {{!-- @param {string} name --}}
  <div>{{name}}</div>
</template>

<template name="template2">
  {{!-- @param {number} age --}}
  <div>{{age}}</div>
</template>
      `;
      const docs = extractAllTemplateComments(html);

      assert.strictEqual(docs.size, 2);
      assert.ok(docs.has('template1'));
      assert.ok(docs.has('template2'));

      const doc1 = docs.get('template1');
      assert.ok(doc1);
      assert.ok(doc1.parameters.has('name'));
    });
  });
});
