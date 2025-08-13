import assert from 'assert';
import { describe, it } from 'node:test';

import { findEnclosingEachInContext } from '../../../server/helpers/findEnclosingEachInContext';

describe('findEnclosingEachInContext', () => {
  it('should detect each-in context from template.html example', () => {
    const content = `<template name="test">
  <div id="test">
    <h1 class="test-title">Make Boxes!</h1>

    <div class="button-wrapper">
      <button class="increment">Increment Count</button>
    </div>
    <div class="test-content">
      <p>Count: {{count}}</p>
      {{data1}}
      {{data2}}
      {{data3}}

      <div class="boxes">
        {{#each box in boxes}}
        <div class="box">
          <span class="box-text">Box</span>
          <span class="box-number">{{pad box}}</span>
        </div>
        {{/each}}
      </div>

    </div>
  </div>
</template>`;

    // Find the position of "box" in "{{pad box}}"
    const boxPosition = content.indexOf('{{pad box}}') + 6; // Position of "box"

    const result = findEnclosingEachInContext(content, boxPosition);

    assert.ok(result, 'Should find each-in context');
    assert.strictEqual(result.alias, 'box');
    assert.strictEqual(result.source, 'boxes');
  });

  it('should detect each-in context at the opening position', () => {
    const content = `{{#each box in boxes}}
{{box}}
{{/each}}`;

    const boxPosition = content.indexOf('{{box}}') + 2; // Position inside "{{box}}"

    const result = findEnclosingEachInContext(content, boxPosition);

    assert.ok(result, 'Should find each-in context');
    assert.strictEqual(result.alias, 'box');
    assert.strictEqual(result.source, 'boxes');
  });
});
