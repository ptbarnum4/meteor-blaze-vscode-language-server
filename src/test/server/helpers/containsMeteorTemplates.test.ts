import * as assert from 'assert';
import { describe, it } from 'node:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { containsMeteorTemplates } from '../../../server/helpers/containsMeteorTemplates';

/**
 * Test suite for containsMeteorTemplates helper function
 */
describe('containsMeteorTemplates', () => {
  it('should return true for documents with Meteor templates', () => {
    const content = `
      <div>Some content</div>
      <template name="myTemplate">
        <p>Template content</p>
      </template>
    `;
    const document = TextDocument.create('file:///test.html', 'html', 1, content);

    const result = containsMeteorTemplates(document);
    assert.strictEqual(result, true);
  });

  it('should return true for templates with single quotes', () => {
    const content = `<template name='singleQuoteTemplate'><div>Content</div></template>`;
    const document = TextDocument.create('file:///test.html', 'html', 1, content);

    const result = containsMeteorTemplates(document);
    assert.strictEqual(result, true);
  });

  it('should return true for templates with additional attributes', () => {
    const content = `<template name="testTemplate" data-test="value"><span>Test</span></template>`;
    const document = TextDocument.create('file:///test.html', 'html', 1, content);

    const result = containsMeteorTemplates(document);
    assert.strictEqual(result, true);
  });

  it('should return false for documents without Meteor templates', () => {
    const content = `
      <div>Some content</div>
      <p>No templates here</p>
    `;
    const document = TextDocument.create('file:///test.html', 'html', 1, content);

    const result = containsMeteorTemplates(document);
    assert.strictEqual(result, false);
  });

  it('should return false for empty documents', () => {
    const content = '';
    const document = TextDocument.create('file:///test.html', 'html', 1, content);

    const result = containsMeteorTemplates(document);
    assert.strictEqual(result, false);
  });

  it('should return false for documents with template-like content but no name attribute', () => {
    const content = `<template><div>No name attribute</div></template>`;
    const document = TextDocument.create('file:///test.html', 'html', 1, content);

    const result = containsMeteorTemplates(document);
    assert.strictEqual(result, false);
  });

  it('should handle multiple templates', () => {
    const content = `
      <template name="template1">Content 1</template>
      <template name="template2">Content 2</template>
    `;
    const document = TextDocument.create('file:///test.html', 'html', 1, content);

    const result = containsMeteorTemplates(document);
    assert.strictEqual(result, true);
  });
});
