import * as assert from 'assert';
import { describe, it } from 'node:test';
import { extractTemplateParameters } from '../../../server/helpers/extractTemplateParameters.js';

describe('extractTemplateParameters', () => {
  it('should extract parameters from block helpers correctly', () => {
    const templateContent = `
      <div class="user-card">
        <h2>{{userName}}</h2>
        <p>Age: {{userAge}}</p>
        <p>Active: {{this.isActive}}</p>
        <p>Formatted: {{formatText userDescription}}</p>

        {{#if isActive}}
          <p>The user is active.</p>
        {{else}}
          <p>The user is not active.</p>
        {{/if}}

        {{#each image in images}}
          <img src="{{image.url}}"
            alt="{{image.altText}}" />
            {{firstName}} - {{image.name}}
        {{/each}}

        {{#each thing}}
          <div class="thing-item">
            <h3>{{thing.title}}</h3>
            <p>{{thing.description}}</p>
          </div>
        {{/each}}

        {{#with address}}
          <div class="address">
            <p>{{street}}, {{city}}, {{state}} {{zip}}</p>
          </div>
        {{/with}}
      </div>
    `;

    const params = extractTemplateParameters(templateContent, []);
    const paramNames = params.map((p) => p.name).sort();

    // Expected: userName, userAge, isActive, userDescription, images, firstName, thing, address
    const expected = [
      'address',
      'firstName',
      'images',
      'isActive',
      'thing',
      'userDescription',
      'userName',
      'userAge',
    ];

    console.log('Extracted params:', paramNames);
    console.log('Expected params:', expected);

    // Check that all expected parameters are present
    assert.strictEqual(
      paramNames.length,
      expected.length,
      'Should have correct number of parameters'
    );
    for (const expectedParam of expected) {
      assert.ok(
        paramNames.includes(expectedParam),
        `Should include parameter: ${expectedParam}`
      );
    }
  });

  it('should extract "images" not "image" from each-in block', () => {
    const templateContent = `
      {{#each image in images}}
        <img src="{{image.url}}" />
      {{/each}}
    `;

    const params = extractTemplateParameters(templateContent, []);
    const paramNames = params.map((p) => p.name);

    assert.ok(paramNames.includes('images'), 'Should include "images"');
    assert.ok(
      !paramNames.includes('image'),
      'Should NOT include "image" (the alias)'
    );
  });

  it('should extract params from #with block', () => {
    const templateContent = `
      {{#with address}}
        <p>{{street}}, {{city}}</p>
      {{/with}}
    `;

    const params = extractTemplateParameters(templateContent, []);
    const paramNames = params.map((p) => p.name);

    assert.ok(paramNames.includes('address'), 'Should include "address"');
    assert.ok(
      !paramNames.includes('street'),
      'Should NOT include "street" (inside with block)'
    );
    assert.ok(
      !paramNames.includes('city'),
      'Should NOT include "city" (inside with block)'
    );
  });

  it('should extract params from #each block', () => {
    const templateContent = `
      {{#each thing}}
        <h3>{{thing.title}}</h3>
      {{/each}}
    `;

    const params = extractTemplateParameters(templateContent, []);
    const paramNames = params.map((p) => p.name);

    assert.ok(paramNames.includes('thing'), 'Should include "thing"');
  });

  it('should extract non-alias variables inside each-in block', () => {
    const templateContent = `
      {{#each image in images}}
        <div>{{firstName}} - {{image.name}}</div>
      {{/each}}
    `;

    const params = extractTemplateParameters(templateContent, []);
    const paramNames = params.map((p) => p.name);

    assert.ok(paramNames.includes('images'), 'Should include "images"');
    assert.ok(
      paramNames.includes('firstName'),
      'Should include "firstName" (not a lookup on alias)'
    );
    assert.ok(
      !paramNames.includes('image'),
      'Should NOT include "image" (the alias)'
    );
  });

  it('should extract variable used outside of with block', () => {
    const templateContent = `
      <p>{{title}}</p>
      {{#with address}}
        <p>{{title}}</p>
      {{/with}}
    `;

    const params = extractTemplateParameters(templateContent, []);
    const paramNames = params.map((p) => p.name);

    assert.ok(paramNames.includes('address'), 'Should include "address"');
    assert.ok(
      paramNames.includes('title'),
      'Should include "title" (used outside with block)'
    );
  });

  it('should infer object type for #with parameters', () => {
    const templateContent = `
      {{#with address}}
        <p>{{street}}, {{city}}, {{state}} {{zip}}</p>
      {{/with}}
    `;

    const params = extractTemplateParameters(templateContent, []);
    const addressParam = params.find((p) => p.name === 'address');

    assert.ok(addressParam, 'Should extract address parameter');
    assert.ok(addressParam?.inferredType, 'Should have inferred type');
    assert.ok(
      addressParam?.inferredType?.includes('street'),
      'Type should include street property'
    );
    assert.ok(
      addressParam?.inferredType?.includes('city'),
      'Type should include city property'
    );
    assert.ok(
      addressParam?.inferredType?.includes('state'),
      'Type should include state property'
    );
    assert.ok(
      addressParam?.inferredType?.includes('zip'),
      'Type should include zip property'
    );
  });

  it('should infer array of strings for #each without property lookups', () => {
    const templateContent = `
      {{#each names}}
        <p>{{this}}</p>
      {{/each}}
    `;

    const params = extractTemplateParameters(templateContent, []);
    const namesParam = params.find((p) => p.name === 'names');

    assert.ok(namesParam, 'Should extract names parameter');
    assert.strictEqual(
      namesParam?.inferredType,
      'string[]',
      'Should infer string[] type'
    );
  });

  it('should infer array of objects for #each with property lookups', () => {
    const templateContent = `
      {{#each users}}
        <p>{{users.firstName}} {{users.lastName}}</p>
      {{/each}}
    `;

    const params = extractTemplateParameters(templateContent, []);
    const usersParam = params.find((p) => p.name === 'users');

    assert.ok(usersParam, 'Should extract users parameter');
    assert.ok(usersParam?.inferredType, 'Should have inferred type');
    assert.ok(
      usersParam?.inferredType?.includes('firstName'),
      'Type should include firstName property'
    );
    assert.ok(
      usersParam?.inferredType?.includes('lastName'),
      'Type should include lastName property'
    );
    assert.ok(
      usersParam?.inferredType?.endsWith('}[]'),
      'Should be an Array type'
    );
    assert.ok(
      usersParam?.inferredType?.startsWith('{'),
      'Should contain object type'
    );
  });

  it('should infer array type for #each-in with property lookups', () => {
    const templateContent = `
      {{#each image in images}}
        <img src="{{image.url}}" alt="{{image.altText}}" />
      {{/each}}
    `;

    const params = extractTemplateParameters(templateContent, []);
    const imagesParam = params.find((p) => p.name === 'images');

    assert.ok(imagesParam, 'Should extract images parameter');
    assert.ok(imagesParam?.inferredType, 'Should have inferred type');
    assert.ok(
      imagesParam?.inferredType?.includes('url'),
      'Type should include url property'
    );
    assert.ok(
      imagesParam?.inferredType?.includes('altText'),
      'Type should include altText property'
    );
  });

  it('should default to string for parameters not in blocks', () => {
    const templateContent = `
      <h2>{{userName}}</h2>
      <p>{{userAge}}</p>
    `;

    const params = extractTemplateParameters(templateContent, []);

    for (const param of params) {
      assert.strictEqual(
        param.inferredType,
        'string',
        `Parameter ${param.name} should default to string type`
      );
    }
  });
});
