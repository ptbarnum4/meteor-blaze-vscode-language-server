import assert from 'assert';
import { describe, it } from 'node:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CompletionItem, CompletionItemKind, TextDocuments } from 'vscode-languageserver/node';

import onCompletionResolve from '/server/connection/onCompletionResolve';
import { CurrentConnectionConfig, LanguageServerSettings } from '/types';

/**
 * Test suite for onCompletionResolve connection handler
 */
describe('connection/onCompletionResolve', () => {
  const mockSettings: LanguageServerSettings = { maxNumberOfProblems: 1000 };

  const createMockConnection = () => ({
    console: {
      log: () => {} // Mock console.log
    }
  });

  const createMockConfig = (
    overrides?: Partial<CurrentConnectionConfig>
  ): CurrentConnectionConfig => ({
    globalSettings: mockSettings,
    documentSettings: new Map(),
    fileAnalysis: {
      jsHelpers: new Map(),
      helperDetails: new Map(),
      cssClasses: new Map(),
      templates: new Map()
    },
    documents: new TextDocuments(TextDocument),
    connection: createMockConnection() as any,
    hasConfigurationCapability: false,
    hasWorkspaceFolderCapability: false,
    hasDiagnosticRelatedInformationCapability: false,
    ...overrides
  });

  it('should return completion resolve handler function', () => {
    const config = createMockConfig();
    const handler = onCompletionResolve(config);
    assert.strictEqual(typeof handler, 'function');
  });

  it('should return the same completion item without modification', () => {
    const config = createMockConfig();
    const handler = onCompletionResolve(config);

    const completionItem: CompletionItem = {
      label: 'testHelper',
      kind: CompletionItemKind.Function,
      detail: 'Test helper function',
      documentation: 'This is a test helper'
    };

    const result = handler(completionItem);

    // Should return the exact same object
    assert.strictEqual(result, completionItem);
    assert.strictEqual(result.label, 'testHelper');
    assert.strictEqual(result.kind, CompletionItemKind.Function);
    assert.strictEqual(result.detail, 'Test helper function');
    assert.strictEqual(result.documentation, 'This is a test helper');
  });

  it('should handle minimal completion item', () => {
    const config = createMockConfig();
    const handler = onCompletionResolve(config);

    const completionItem: CompletionItem = {
      label: 'simpleHelper'
    };

    const result = handler(completionItem);

    assert.strictEqual(result, completionItem);
    assert.strictEqual(result.label, 'simpleHelper');
  });

  it('should handle completion item with all properties', () => {
    const config = createMockConfig();
    const handler = onCompletionResolve(config);

    const completionItem: CompletionItem = {
      label: 'complexHelper',
      kind: CompletionItemKind.Function,
      detail: 'Complex helper function',
      documentation: {
        kind: 'markdown',
        value: '# Complex Helper\n\nThis is a complex helper with markdown documentation.'
      },
      sortText: '0001',
      filterText: 'complexHelper',
      insertText: 'complexHelper($1)',
      insertTextFormat: 2, // Snippet
      additionalTextEdits: [],
      command: {
        title: 'Test Command',
        command: 'test.command'
      },
      data: { customData: 'test' }
    };

    const result = handler(completionItem);

    // Should return the exact same object with all properties intact
    assert.strictEqual(result, completionItem);
    assert.strictEqual(result.label, 'complexHelper');
    assert.strictEqual(result.kind, CompletionItemKind.Function);
    assert.strictEqual(result.detail, 'Complex helper function');
    assert.deepStrictEqual(result.documentation, {
      kind: 'markdown',
      value: '# Complex Helper\n\nThis is a complex helper with markdown documentation.'
    });
    assert.strictEqual(result.sortText, '0001');
    assert.strictEqual(result.filterText, 'complexHelper');
    assert.strictEqual(result.insertText, 'complexHelper($1)');
    assert.strictEqual(result.insertTextFormat, 2);
    assert.deepStrictEqual(result.additionalTextEdits, []);
    assert.deepStrictEqual(result.command, {
      title: 'Test Command',
      command: 'test.command'
    });
    assert.deepStrictEqual(result.data, { customData: 'test' });
  });

  it('should handle different completion item kinds', () => {
    const config = createMockConfig();
    const handler = onCompletionResolve(config);

    const kinds = [
      CompletionItemKind.Function,
      CompletionItemKind.Variable,
      CompletionItemKind.Class,
      CompletionItemKind.Method,
      CompletionItemKind.Property,
      CompletionItemKind.Keyword
    ];

    kinds.forEach((kind, index) => {
      const completionItem: CompletionItem = {
        label: `item${index}`,
        kind: kind
      };

      const result = handler(completionItem);

      assert.strictEqual(result, completionItem);
      assert.strictEqual(result.kind, kind);
    });
  });

  it('should handle undefined properties gracefully', () => {
    const config = createMockConfig();
    const handler = onCompletionResolve(config);

    const completionItem: CompletionItem = {
      label: 'testHelper',
      kind: undefined,
      detail: undefined,
      documentation: undefined
    };

    const result = handler(completionItem);

    assert.strictEqual(result, completionItem);
    assert.strictEqual(result.label, 'testHelper');
    assert.strictEqual(result.kind, undefined);
    assert.strictEqual(result.detail, undefined);
    assert.strictEqual(result.documentation, undefined);
  });

  it('should preserve custom data and properties', () => {
    const config = createMockConfig();
    const handler = onCompletionResolve(config);

    const completionItem: CompletionItem = {
      label: 'customHelper',
      data: {
        type: 'meteor-helper',
        templateName: 'myTemplate',
        filePath: '/path/to/file.js',
        customProperty: { nested: { value: 'test' } }
      }
    };

    const result = handler(completionItem);

    assert.strictEqual(result, completionItem);
    assert.deepStrictEqual(result.data, {
      type: 'meteor-helper',
      templateName: 'myTemplate',
      filePath: '/path/to/file.js',
      customProperty: { nested: { value: 'test' } }
    });
  });

  it('should handle null completion item', () => {
    const config = createMockConfig();
    const handler = onCompletionResolve(config);

    // TypeScript would prevent this, but testing runtime behavior
    const result = handler(null as any);

    assert.strictEqual(result, null);
  });

  it('should work with different config states', () => {
    // Test with different configuration capabilities
    const configs = [
      createMockConfig({ hasConfigurationCapability: true }),
      createMockConfig({ hasWorkspaceFolderCapability: true }),
      createMockConfig({ hasDiagnosticRelatedInformationCapability: true })
    ];

    configs.forEach(config => {
      const handler = onCompletionResolve(config);

      const completionItem: CompletionItem = {
        label: 'testHelper',
        kind: CompletionItemKind.Function
      };

      const result = handler(completionItem);

      // Should work the same regardless of config state
      assert.strictEqual(result, completionItem);
    });
  });
});
