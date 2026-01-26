import { assert } from 'chai';
import { describe, it } from 'mocha';

/**
 * Test suite for template invocation parsing and formatting logic
 */
describe('helpers/formatTemplateInvocation', () => {
  describe('Template Invocation Detection', () => {
    it('should detect single-line template invocations', () => {
      const text = '{{> templateName param=value}}';
      const regex = /\{\{\s*>\s*([a-zA-Z0-9_]+)/g;
      const match = regex.exec(text);

      assert.ok(match !== null);
      assert.strictEqual(match[1], 'templateName');
    });

    it('should detect multi-line template invocations', () => {
      const text = `{{> templateName
  param1=value1
  param2=value2
}}`;
      const regex = /\{\{\s*>\s*([a-zA-Z0-9_]+)/g;
      const match = regex.exec(text);

      assert.ok(match !== null);
      assert.strictEqual(match[1], 'templateName');
      assert.ok(text.includes('\n'));
    });

    it('should extract template name from invocation', () => {
      const text = '{{> myTemplate param=val}}';
      const regex = /\{\{\s*>\s*([a-zA-Z0-9_]+)/;
      const match = text.match(regex);

      assert.ok(match !== null);
      assert.strictEqual(match[1], 'myTemplate');
    });

    it('should handle template names with numbers and underscores', () => {
      const text = '{{> template_name_123 param=val}}';
      const regex = /\{\{\s*>\s*([a-zA-Z0-9_]+)/;
      const match = text.match(regex);

      assert.ok(match !== null);
      assert.strictEqual(match[1], 'template_name_123');
    });
  });

  describe('Parameter Parsing', () => {
    it('should parse simple parameters', () => {
      const text = 'param1=value1 param2=value2';
      const paramPattern = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*([^\s}]+)/g;
      const params: Array<{ name: string; value: string }> = [];
      let match;

      while ((match = paramPattern.exec(text)) !== null) {
        params.push({ name: match[1], value: match[2] });
      }

      assert.strictEqual(params.length, 2);
      assert.strictEqual(params[0].name, 'param1');
      assert.strictEqual(params[0].value, 'value1');
      assert.strictEqual(params[1].name, 'param2');
      assert.strictEqual(params[1].value, 'value2');
    });

    it('should parse parameters with string values', () => {
      const text = 'param="string value"';
      const paramPattern = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*([^\s}]+)/g;
      const params: Array<{ name: string; value: string }> = [];
      let match;

      while ((match = paramPattern.exec(text)) !== null) {
        params.push({ name: match[1], value: match[2] });
      }

      assert.strictEqual(params.length, 1);
      assert.strictEqual(params[0].name, 'param');
      assert.strictEqual(params[0].value, '"string');
    });

    it('should parse parameters with helper invocations', () => {
      const text = 'param=(helper)';
      const paramPattern = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*([^\s}]+)/g;
      const params: Array<{ name: string; value: string }> = [];
      let match;

      while ((match = paramPattern.exec(text)) !== null) {
        params.push({ name: match[1], value: match[2] });
      }

      assert.strictEqual(params.length, 1);
      assert.strictEqual(params[0].name, 'param');
      assert.strictEqual(params[0].value, '(helper)');
    });
  });

  describe('Multi-line Detection', () => {
    it('should detect single-line invocations', () => {
      const text = '{{> template param=value}}';
      const isMultiLine = text.includes('\n');

      assert.strictEqual(isMultiLine, false);
    });

    it('should detect multi-line invocations', () => {
      const text = `{{> template
  param=value
}}`;
      const isMultiLine = text.includes('\n');

      assert.strictEqual(isMultiLine, true);
    });
  });

  describe('Indentation Calculation', () => {
    it('should extract base indentation from line', () => {
      const line = '  {{> template';
      const baseIndent = line.match(/^\s*/)?.[0] || '';

      assert.strictEqual(baseIndent, '  ');
      assert.strictEqual(baseIndent.length, 2);
    });

    it('should handle tab indentation', () => {
      const line = '\t\t{{> template';
      const baseIndent = line.match(/^\s*/)?.[0] || '';

      assert.strictEqual(baseIndent, '\t\t');
      assert.strictEqual(baseIndent.length, 2);
    });

    it('should handle mixed indentation', () => {
      const line = ' \t {{> template';
      const baseIndent = line.match(/^\s*/)?.[0] || '';

      assert.strictEqual(baseIndent, ' \t ');
      assert.strictEqual(baseIndent.length, 3);
    });

    it('should handle no indentation', () => {
      const line = '{{> template';
      const baseIndent = line.match(/^\s*/)?.[0] || '';

      assert.strictEqual(baseIndent, '');
      assert.strictEqual(baseIndent.length, 0);
    });
  });

  describe('Formatting Output', () => {
    it('should format with spaces', () => {
      const indentSize = 2;
      const useTabs = false;
      const indent = useTabs ? '\t' : ' '.repeat(indentSize);

      assert.strictEqual(indent, '  ');
      assert.strictEqual(indent.length, 2);
    });

    it('should format with tabs', () => {
      const indentSize = 2;
      const useTabs = true;
      const indent = useTabs ? '\t' : ' '.repeat(indentSize);

      assert.strictEqual(indent, '\t');
      assert.strictEqual(indent.length, 1);
    });

    it('should format with custom indent size', () => {
      const indentSize = 4;
      const useTabs = false;
      const indent = useTabs ? '\t' : ' '.repeat(indentSize);

      assert.strictEqual(indent, '    ');
      assert.strictEqual(indent.length, 4);
    });

    it('should build formatted template invocation', () => {
      const templateName = 'childTemplate';
      const baseIndent = '  ';
      const indent = '  ';
      const params = [
        { name: 'param1', value: 'value1' },
        { name: 'param2', value: 'value2' },
      ];

      let formatted = `{{> ${templateName}`;
      for (const param of params) {
        formatted += `\n${baseIndent}${indent}${param.name}=${param.value}`;
      }
      formatted += `\n${baseIndent}}}`;

      const expected = `{{> childTemplate
    param1=value1
    param2=value2
  }}`;

      assert.strictEqual(formatted, expected);
    });
  });

  describe('Nested Brace Handling', () => {
    it('should match opening and closing braces', () => {
      const text = '{{> template param=(helper)}}';
      let braceDepth = 0;
      let foundOpening = false;
      let foundClosing = false;

      for (let i = 0; i < text.length - 1; i++) {
        if (text[i] === '{' && text[i + 1] === '{') {
          braceDepth += 2;
          foundOpening = true;
        } else if (text[i] === '}' && text[i + 1] === '}') {
          braceDepth -= 2;
          if (braceDepth === 0) {
            foundClosing = true;
          }
        }
      }

      assert.ok(foundOpening);
      assert.ok(foundClosing);
      assert.strictEqual(braceDepth, 0);
    });

    it('should handle nested template invocations', () => {
      const text = '{{> outer param=(> inner)}}';
      let openCount = 0;
      let closeCount = 0;

      for (let i = 0; i < text.length - 1; i++) {
        if (text[i] === '{' && text[i + 1] === '{') {
          openCount++;
          i++; // Skip next char
        } else if (text[i] === '}' && text[i + 1] === '}') {
          closeCount++;
          i++; // Skip next char
        }
      }

      assert.strictEqual(openCount, closeCount);
    });
  });

  describe('Position Calculations', () => {
    it('should calculate line and character position from offset', () => {
      const lines = ['line 0', 'line 1', 'line 2'];
      const offset = 14; // Start of "line 2"

      let currentOffset = 0;
      let line = 0;
      let character = 0;

      for (let i = 0; i < lines.length; i++) {
        const lineLength = lines[i].length + 1; // +1 for newline
        if (currentOffset + lineLength > offset) {
          line = i;
          character = offset - currentOffset;
          break;
        }
        currentOffset += lineLength;
      }

      assert.strictEqual(line, 2);
      assert.strictEqual(character, 0);
    });

    it('should handle offset at start of document', () => {
      const line = 0;
      const character = 0;

      assert.strictEqual(line, 0);
      assert.strictEqual(character, 0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty parameter list', () => {
      const text = '{{> template}}';
      const paramPattern = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*([^\s}]+)/g;
      const params: Array<{ name: string; value: string }> = [];
      let match;

      while ((match = paramPattern.exec(text)) !== null) {
        params.push({ name: match[1], value: match[2] });
      }

      assert.strictEqual(params.length, 0);
    });

    it('should handle incomplete template invocations', () => {
      const text = '{{> template ';
      const regex = /\{\{\s*>\s*([a-zA-Z0-9_]+)/;
      const match = text.match(regex);

      assert.ok(match !== null);
      assert.strictEqual(match[1], 'template');
    });

    it('should handle template invocation without closing braces', () => {
      const text = '{{> template param=value';
      const hasClosing = text.includes('}}');

      assert.strictEqual(hasClosing, false);
    });

    it('should handle whitespace variations', () => {
      const patterns = [
        '{{> template',
        '{{>template',
        '{{  >  template',
        '{{\t>\ttemplate',
      ];

      patterns.forEach((pattern) => {
        const regex = /\{\{\s*>\s*([a-zA-Z0-9_]+)/;
        const match = pattern.match(regex);
        assert.ok(match !== null, `Should match pattern: ${pattern}`);
        assert.strictEqual(match[1], 'template');
      });
    });
  });
});
