import assert from 'node:assert';
import { describe, it } from 'node:test';
import { findMatchingOpenTag } from '../../../../../src/extension/helpers/htmlElements/findMatchingOpenTag';

describe('findMatchingOpenTag', () => {
  it('should find matching opening tag for a simple closing tag', () => {
    const html = '<div id="main">content</div>';
    const closingTagPos = html.indexOf('</div>');
    const result = findMatchingOpenTag(html, closingTagPos, 'div');

    assert.ok(result);
    assert.strictEqual(result.openingTag, '<div id="main">');
    assert.strictEqual(result.position, 0);
  });

  it('should find matching opening tag with nested same-type elements', () => {
    const html = '<div class="outer"><div class="inner">content</div></div>';
    const closingTagPos = html.lastIndexOf('</div>');
    const result = findMatchingOpenTag(html, closingTagPos, 'div');

    assert.ok(result);
    assert.strictEqual(result.openingTag, '<div class="outer">');
    assert.strictEqual(result.position, 0);
  });

  it('should find correct opening tag for inner closing tag', () => {
    const html = '<div class="outer"><div class="inner">content</div></div>';
    const firstClosingTagPos = html.indexOf('</div>');
    const result = findMatchingOpenTag(html, firstClosingTagPos, 'div');

    assert.ok(result);
    assert.strictEqual(result.openingTag, '<div class="inner">');
    assert.ok(result.position > 0);
  });

  it('should handle deeply nested elements', () => {
    const html = '<div><div><div><div>content</div></div></div></div>';
    const closingTagPos = html.indexOf('</div>');
    const result = findMatchingOpenTag(html, closingTagPos, 'div');

    assert.ok(result);
    assert.strictEqual(result.openingTag, '<div>');
    // Should match the innermost opening tag
    assert.strictEqual(result.position, html.lastIndexOf('<div>'));
  });

  it('should return null for self-closing tags', () => {
    const html = '<div><img src="test.jpg" /></div>';
    const closingTagPos = html.indexOf('</div>');
    const result = findMatchingOpenTag(html, closingTagPos, 'img');

    assert.strictEqual(result, null);
  });

  it('should handle different HTML elements', () => {
    const elements = ['section', 'article', 'header', 'footer', 'nav'];
    elements.forEach((tag) => {
      const html = `<${tag} class="test">content</${tag}>`;
      const closingTagPos = html.indexOf(`</${tag}>`);
      const result = findMatchingOpenTag(html, closingTagPos, tag);

      assert.ok(result, `Should find opening tag for ${tag}`);
      assert.strictEqual(result.openingTag, `<${tag} class="test">`);
    });
  });

  it('should handle mixed nesting of different elements', () => {
    const html =
      '<div><section><div class="inner">content</div></section></div>';
    const innerDivClosing = html.indexOf('</div>');
    const result = findMatchingOpenTag(html, innerDivClosing, 'div');

    assert.ok(result);
    assert.strictEqual(result.openingTag, '<div class="inner">');
  });

  it('should skip self-closing tags in the middle', () => {
    const html = '<div><img src="test.jpg" /><br />content</div>';
    const closingTagPos = html.indexOf('</div>');
    const result = findMatchingOpenTag(html, closingTagPos, 'div');

    assert.ok(result);
    assert.strictEqual(result.openingTag, '<div>');
    assert.strictEqual(result.position, 0);
  });

  it('should handle tags with no attributes', () => {
    const html = '<div>content</div>';
    const closingTagPos = html.indexOf('</div>');
    const result = findMatchingOpenTag(html, closingTagPos, 'div');

    assert.ok(result);
    assert.strictEqual(result.openingTag, '<div>');
    assert.strictEqual(result.position, 0);
  });

  it('should handle tags with complex attributes', () => {
    const html =
      '<div id="main" class="container active" data-value="123">content</div>';
    const closingTagPos = html.indexOf('</div>');
    const result = findMatchingOpenTag(html, closingTagPos, 'div');

    assert.ok(result);
    assert.strictEqual(
      result.openingTag,
      '<div id="main" class="container active" data-value="123">'
    );
    assert.strictEqual(result.position, 0);
  });

  it('should handle multiple nested structures', () => {
    const html = `
      <div class="outer">
        <div class="middle">
          <div class="inner">content</div>
        </div>
        <div class="sibling">more</div>
      </div>
    `;
    const outerClosingPos = html.lastIndexOf('</div>');
    const result = findMatchingOpenTag(html, outerClosingPos, 'div');

    assert.ok(result);
    assert.ok(result.openingTag.includes('class="outer"'));
  });

  it('should handle case-insensitive tag names', () => {
    const html = '<DIV id="test">content</DIV>';
    const closingTagPos = html.indexOf('</DIV>');
    const result = findMatchingOpenTag(html, closingTagPos, 'DIV');

    assert.ok(result);
    assert.strictEqual(result.openingTag, '<DIV id="test">');
  });

  it('should return null when no matching opening tag found', () => {
    const html = '</div>';
    const closingTagPos = 0;
    const result = findMatchingOpenTag(html, closingTagPos, 'div');

    assert.strictEqual(result, null);
  });

  it('should handle tags with line breaks in attributes', () => {
    const html = `<div
      id="main"
      class="container"
    >content</div>`;
    const closingTagPos = html.indexOf('</div>');
    const result = findMatchingOpenTag(html, closingTagPos, 'div');

    assert.ok(result);
    assert.ok(result.openingTag.includes('id="main"'));
  });

  it('should handle common self-closing tags', () => {
    const selfClosingTags = ['img', 'br', 'hr', 'input', 'meta', 'link'];
    selfClosingTags.forEach((tag) => {
      const html = `<div><${tag} /></div>`;
      const result = findMatchingOpenTag(html, html.indexOf(`<${tag}`), tag);
      assert.strictEqual(
        result,
        null,
        `${tag} should return null as it's self-closing`
      );
    });
  });

  it('should correctly handle alternating nested tags', () => {
    const html = '<div><span><div><span>content</span></div></span></div>';
    const firstSpanClosing = html.indexOf('</span>');
    const result = findMatchingOpenTag(html, firstSpanClosing, 'span');

    assert.ok(result);
    // Should match the innermost span
    const lastSpanOpening = html.lastIndexOf('<span>');
    assert.strictEqual(result.position, lastSpanOpening);
  });
});
