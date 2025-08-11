import * as assert from 'assert';
import { describe, it } from 'node:test';
import { trimUsageDocumentation } from '../../../server/helpers/trimUsageDocumentation';

/**
 * Test suite for trimUsageDocumentation helper function
 */
describe('trimUsageDocumentation', () => {
  it('should return default format when no usage documentation is provided', () => {
    const name = 'myHelper';
    const result = trimUsageDocumentation(name);
    assert.strictEqual(result, '{{myHelper}}');
  });

  it('should return default format when usage documentation is undefined', () => {
    const name = 'myHelper';
    const result = trimUsageDocumentation(name, undefined);
    assert.strictEqual(result, '{{myHelper}}');
  });

  it('should return default format when usage documentation is empty string', () => {
    const name = 'myHelper';
    const result = trimUsageDocumentation(name, '');
    assert.strictEqual(result, '{{myHelper}}');
  });

  it('should trim single line usage documentation', () => {
    const name = 'myHelper';
    const usageDoc = '{{myHelper arg1 arg2}}';
    const result = trimUsageDocumentation(name, usageDoc);
    assert.strictEqual(result, '{{myHelper arg1 arg2}}');
  });

  it('should trim multiline usage documentation with consistent indentation', () => {
    const name = 'myHelper';
    const usageDoc = `
    {{#myHelper arg1}}
      <div>Content</div>
    {{/myHelper}}
    `;
    const result = trimUsageDocumentation(name, usageDoc);
    assert.strictEqual(result, `{{#myHelper arg1}}
  <div>Content</div>
{{/myHelper}}`);
  });

  it('should remove leading and trailing empty lines', () => {
    const name = 'myHelper';
    const usageDoc = `

    {{myHelper}}

    `;
    const result = trimUsageDocumentation(name, usageDoc);
    assert.strictEqual(result, '{{myHelper}}');
  });

  it('should handle mixed indentation levels', () => {
    const name = 'myHelper';
    const usageDoc = `
      {{#myHelper}}
        <div>
          <span>Content</span>
        </div>
      {{/myHelper}}
    `;
    const result = trimUsageDocumentation(name, usageDoc);
    assert.strictEqual(result, `{{#myHelper}}
  <div>
    <span>Content</span>
  </div>
{{/myHelper}}`);
  });

  it('should preserve relative indentation', () => {
    const name = 'myHelper';
    const usageDoc = `
        {{#each items}}
          {{myHelper @index}}
            {{#if condition}}
              <span>{{this}}</span>
            {{/if}}
        {{/each}}
    `;
    const result = trimUsageDocumentation(name, usageDoc);
    assert.strictEqual(result, `{{#each items}}
  {{myHelper @index}}
    {{#if condition}}
      <span>{{this}}</span>
    {{/if}}
{{/each}}`);
  });

  it('should handle lines with no indentation', () => {
    const name = 'myHelper';
    const usageDoc = `
{{myHelper}}
  {{anotherHelper}}
    {{nestedHelper}}
    `;
    const result = trimUsageDocumentation(name, usageDoc);
    assert.strictEqual(result, `{{myHelper}}
  {{anotherHelper}}
    {{nestedHelper}}`);
  });

  it('should handle single line with whitespace', () => {
    const name = 'myHelper';
    const usageDoc = '    {{myHelper arg}}    ';
    const result = trimUsageDocumentation(name, usageDoc);
    assert.strictEqual(result, '{{myHelper arg}}');
  });

  it('should filter out empty lines in the middle but preserve structure', () => {
    const name = 'myHelper';
    const usageDoc = `
    {{#myHelper}}

      <div>Content</div>

    {{/myHelper}}
    `;
    const result = trimUsageDocumentation(name, usageDoc);
    // The function filters out empty lines in the middle
    assert.strictEqual(result, `{{#myHelper}}
  <div>Content</div>
{{/myHelper}}`);
  });

  it('should handle tabs and spaces mixed indentation', () => {
    const name = 'myHelper';
    // Using actual tab characters here
    const usageDoc = `
\t\t{{#myHelper}}
\t\t  <div>Content</div>
\t\t{{/myHelper}}
    `;
    const result = trimUsageDocumentation(name, usageDoc);
    // The function should handle this by finding the minimum indent
    assert.strictEqual(result, `{{#myHelper}}
  <div>Content</div>
{{/myHelper}}`);
  });

  it('should handle zero indentation correctly', () => {
    const name = 'myHelper';
    const usageDoc = `
{{myHelper}}
<div>No indent</div>
  <div>Some indent</div>
    `;
    const result = trimUsageDocumentation(name, usageDoc);
    assert.strictEqual(result, `{{myHelper}}
<div>No indent</div>
  <div>Some indent</div>`);
  });

  it('should handle complex real-world example', () => {
    const name = 'formatCurrency';
    const usageDoc = `
      Usage examples:
      {{formatCurrency amount}}
      {{formatCurrency amount currency="EUR"}}

      {{#with product}}
        Price: {{formatCurrency price}}
      {{/with}}
    `;
    const result = trimUsageDocumentation(name, usageDoc);
    // The function filters out the empty line in the middle
    assert.strictEqual(result, `Usage examples:
{{formatCurrency amount}}
{{formatCurrency amount currency="EUR"}}
{{#with product}}
  Price: {{formatCurrency price}}
{{/with}}`);
  });

  it('should handle documentation with only whitespace', () => {
    const name = 'myHelper';
    const usageDoc = '   \n  \n\t\n   ';
    const result = trimUsageDocumentation(name, usageDoc);
    // The function returns empty string when all lines are filtered out, not the default
    assert.strictEqual(result, '');
  });
});
