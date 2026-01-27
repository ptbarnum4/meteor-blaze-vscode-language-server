import * as assert from 'assert';
import { describe, it } from 'mocha';
import {
  mergeTemplateParameters,
  mergedParametersToEnhanced,
} from '../../server/helpers/mergeTemplateParameters';

describe('mergeTemplateParameters', () => {
  describe('mergeTemplateParameters', () => {
    it('should merge controller types with TSDoc descriptions', () => {
      const controllerTypes = new Map([
        ['userName', { type: 'string', doc: undefined }],
      ]);
      const tsDocParams = new Map([
        [
          'userName',
          {
            type: 'string',
            description: 'The user name',
            optional: false,
          },
        ],
      ]);
      const inferredParams: any[] = [];

      const merged = mergeTemplateParameters(
        'testTemplate',
        controllerTypes,
        tsDocParams,
        inferredParams
      );

      assert.ok(merged.has('userName'));
      const param = merged.get('userName');
      assert.strictEqual(param?.type, 'string');
      assert.strictEqual(param?.description, 'The user name');
      assert.ok(param?.sources.includes('controller'));
      assert.ok(param?.sources.includes('tsdoc'));
    });

    it('should prioritize controller types over TSDoc types', () => {
      const controllerTypes = new Map([
        ['age', { type: 'number', doc: undefined }],
      ]);
      const tsDocParams = new Map([
        [
          'age',
          {
            type: 'string',
            description: 'User age',
            optional: false,
          },
        ],
      ]);
      const inferredParams: any[] = [];

      const merged = mergeTemplateParameters(
        'testTemplate',
        controllerTypes,
        tsDocParams,
        inferredParams
      );

      const param = merged.get('age');
      assert.strictEqual(param?.type, 'number'); // Controller type wins
      assert.strictEqual(param?.description, 'User age'); // But description is added
    });

    it('should include TSDoc-only parameters', () => {
      const controllerTypes = new Map();
      const tsDocParams = new Map([
        [
          'comments',
          {
            type: 'string[]',
            description: 'List of comments',
            optional: false,
          },
        ],
      ]);
      const inferredParams: any[] = [];

      const merged = mergeTemplateParameters(
        'testTemplate',
        controllerTypes,
        tsDocParams,
        inferredParams
      );

      assert.ok(merged.has('comments'));
      const param = merged.get('comments');
      assert.strictEqual(param?.type, 'string[]');
      assert.strictEqual(param?.sources.length, 1);
      assert.ok(param?.sources.includes('tsdoc'));
    });

    it('should include inferred-only parameters', () => {
      const controllerTypes = new Map();
      const tsDocParams = new Map();
      const inferredParams = [
        { name: 'items', type: 'unknown', isOptional: false },
      ];

      const merged = mergeTemplateParameters(
        'testTemplate',
        controllerTypes,
        tsDocParams,
        inferredParams
      );

      assert.ok(merged.has('items'));
      const param = merged.get('items');
      assert.strictEqual(param?.type, 'unknown');
      assert.ok(param?.sources.includes('inferred'));
    });

    it('should merge all three sources', () => {
      const controllerTypes = new Map([
        ['userName', { type: 'string', doc: undefined }],
      ]);
      const tsDocParams = new Map([
        [
          'userName',
          {
            type: 'any',
            description: 'User name',
            optional: false,
          },
        ],
      ]);
      const inferredParams = [
        { name: 'userName', type: 'unknown', isOptional: false },
      ];

      const merged = mergeTemplateParameters(
        'testTemplate',
        controllerTypes,
        tsDocParams,
        inferredParams
      );

      const param = merged.get('userName');
      assert.strictEqual(param?.sources.length, 3);
      assert.ok(param?.sources.includes('controller'));
      assert.ok(param?.sources.includes('tsdoc'));
      assert.ok(param?.sources.includes('inferred'));
    });

    it('should handle optional parameters', () => {
      const controllerTypes = new Map();
      const tsDocParams = new Map([
        [
          'optional',
          {
            type: 'boolean',
            description: 'Optional param',
            optional: true,
          },
        ],
      ]);
      const inferredParams: any[] = [];

      const merged = mergeTemplateParameters(
        'testTemplate',
        controllerTypes,
        tsDocParams,
        inferredParams
      );

      const param = merged.get('optional');
      assert.strictEqual(param?.optional, true);
    });
  });

  describe('mergedParametersToEnhanced', () => {
    it('should convert merged parameters to enhanced format', () => {
      const merged = new Map();
      merged.set('userName', {
        name: 'userName',
        type: 'string',
        description: 'User name',
        optional: false,
        sources: ['controller', 'tsdoc'],
      });

      const enhanced = mergedParametersToEnhanced(merged);

      assert.strictEqual(enhanced.length, 1);
      assert.strictEqual(enhanced[0].name, 'userName');
      assert.strictEqual(enhanced[0].type, 'string');
      assert.strictEqual(enhanced[0].description, 'User name');
      assert.strictEqual(enhanced[0].optional, false);
      assert.strictEqual(enhanced[0].sources.length, 2);
    });

    it('should handle empty map', () => {
      const merged = new Map();
      const enhanced = mergedParametersToEnhanced(merged);

      assert.strictEqual(enhanced.length, 0);
    });

    it('should preserve all properties', () => {
      const merged = new Map();
      merged.set('optional', {
        name: 'optional',
        type: 'boolean',
        description: undefined,
        optional: true,
        sources: ['inferred'],
      });

      const enhanced = mergedParametersToEnhanced(merged);

      assert.strictEqual(enhanced[0].name, 'optional');
      assert.strictEqual(enhanced[0].type, 'boolean');
      assert.strictEqual(enhanced[0].description, undefined);
      assert.strictEqual(enhanced[0].optional, true);
    });
  });
});
