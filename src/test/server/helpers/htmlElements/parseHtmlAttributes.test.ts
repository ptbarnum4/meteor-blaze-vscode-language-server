import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  formatHintText,
  parseHtmlAttributes,
} from '../../../../../src/extension/helpers/htmlElements/parseHtmlAttributes';

describe('parseHtmlAttributes', () => {
  it('should extract tag name, id, and classes from a basic opening tag', () => {
    const result = parseHtmlAttributes(
      '<div id="main" class="container active">'
    );
    assert.strictEqual(result.tagName, 'div');
    assert.strictEqual(result.id, 'main');
    assert.deepStrictEqual(result.classes, ['container', 'active']);
  });

  it('should extract tag name only when no id or classes', () => {
    const result = parseHtmlAttributes('<div>');
    assert.strictEqual(result.tagName, 'div');
    assert.strictEqual(result.id, null);
    assert.deepStrictEqual(result.classes, []);
  });

  it('should extract id without classes', () => {
    const result = parseHtmlAttributes('<section id="header">');
    assert.strictEqual(result.tagName, 'section');
    assert.strictEqual(result.id, 'header');
    assert.deepStrictEqual(result.classes, []);
  });

  it('should extract classes without id', () => {
    const result = parseHtmlAttributes('<div class="btn btn-primary">');
    assert.strictEqual(result.tagName, 'div');
    assert.strictEqual(result.id, null);
    assert.deepStrictEqual(result.classes, ['btn', 'btn-primary']);
  });

  it('should handle single quotes', () => {
    const result = parseHtmlAttributes("<div id='main' class='container'>");
    assert.strictEqual(result.tagName, 'div');
    assert.strictEqual(result.id, 'main');
    assert.deepStrictEqual(result.classes, ['container']);
  });

  it('should handle multiple classes with various spacing', () => {
    const result = parseHtmlAttributes(
      '<div class="  class1   class2  class3  ">'
    );
    assert.strictEqual(result.tagName, 'div');
    assert.deepStrictEqual(result.classes, ['class1', 'class2', 'class3']);
  });

  it('should filter out Handlebars expressions in classes', () => {
    const result = parseHtmlAttributes(
      '<div class="container {{#if active}}active{{/if}}">'
    );
    assert.strictEqual(result.tagName, 'div');
    // Should only include 'container', not the Handlebars part
    assert.deepStrictEqual(result.classes, ['container']);
  });

  it('should handle empty class attribute', () => {
    const result = parseHtmlAttributes('<div class="">');
    assert.strictEqual(result.tagName, 'div');
    assert.deepStrictEqual(result.classes, []);
  });

  it('should handle case-insensitive tag names', () => {
    const result = parseHtmlAttributes('<DIV id="main">');
    assert.strictEqual(result.tagName, 'DIV');
    assert.strictEqual(result.id, 'main');
  });

  it('should handle various HTML elements', () => {
    const elements = [
      'div',
      'span',
      'section',
      'article',
      'header',
      'footer',
      'nav',
      'main',
    ];
    elements.forEach((tag) => {
      const result = parseHtmlAttributes(`<${tag} id="test">`);
      assert.strictEqual(result.tagName, tag);
      assert.strictEqual(result.id, 'test');
    });
  });
});

describe('formatHintText', () => {
  it('should format tag with id only', () => {
    const result = formatHintText('div', 'main', [], {
      showIds: true,
      showClasses: true,
      maxClassesToShow: 3,
    });
    assert.strictEqual(result, 'div#main');
  });

  it('should format tag with classes only', () => {
    const result = formatHintText('div', null, ['container', 'active'], {
      showIds: true,
      showClasses: true,
      maxClassesToShow: 3,
    });
    assert.strictEqual(result, 'div.container.active');
  });

  it('should format tag with id and classes', () => {
    const result = formatHintText('div', 'main', ['container', 'active'], {
      showIds: true,
      showClasses: true,
      maxClassesToShow: 3,
    });
    assert.strictEqual(result, 'div#main.container.active');
  });

  it('should respect showIds=false', () => {
    const result = formatHintText('div', 'main', ['container'], {
      showIds: false,
      showClasses: true,
      maxClassesToShow: 3,
    });
    assert.strictEqual(result, 'div.container');
  });

  it('should respect showClasses=false', () => {
    const result = formatHintText('div', 'main', ['container', 'active'], {
      showIds: true,
      showClasses: false,
      maxClassesToShow: 3,
    });
    assert.strictEqual(result, 'div#main');
  });

  it('should truncate classes with ellipsis when over limit', () => {
    const result = formatHintText(
      'div',
      null,
      ['class1', 'class2', 'class3', 'class4', 'class5'],
      {
        showIds: true,
        showClasses: true,
        maxClassesToShow: 3,
      }
    );
    assert.strictEqual(result, 'div.class1.class2.class3...');
  });

  it('should show all classes when maxClassesToShow is 0', () => {
    const result = formatHintText(
      'div',
      null,
      ['class1', 'class2', 'class3', 'class4', 'class5'],
      {
        showIds: true,
        showClasses: true,
        maxClassesToShow: 0,
      }
    );
    assert.strictEqual(result, 'div.class1.class2.class3.class4.class5');
  });

  it('should not add ellipsis when exactly at limit', () => {
    const result = formatHintText('div', null, ['class1', 'class2', 'class3'], {
      showIds: true,
      showClasses: true,
      maxClassesToShow: 3,
    });
    assert.strictEqual(result, 'div.class1.class2.class3');
  });

  it('should filter out Handlebars in id', () => {
    const result = formatHintText('div', '{{dynamicId}}', ['container'], {
      showIds: true,
      showClasses: true,
      maxClassesToShow: 3,
    });
    assert.strictEqual(result, 'div.container');
  });

  it('should prioritize non-Bootstrap classes', () => {
    const result = formatHintText(
      'div',
      null,
      ['my-component', 'container', 'custom-class', 'row', 'd-flex', 'special'],
      {
        showIds: true,
        showClasses: true,
        maxClassesToShow: 3,
      }
    );
    // Should show custom classes first, not Bootstrap utility classes
    assert.ok(result.includes('my-component'));
    assert.ok(result.includes('custom-class'));
    assert.ok(result.includes('special'));
  });

  it('should format with just tag name when no id or classes', () => {
    const result = formatHintText('div', null, [], {
      showIds: true,
      showClasses: true,
      maxClassesToShow: 3,
    });
    assert.strictEqual(result, 'div');
  });
});
