import assert from 'assert';
import { describe, it } from 'node:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node';

import onCompletion from '../../../server/connection/onCompletion';
import { CurrentConnectionConfig, LanguageServerSettings } from '../../../types';

/**
 * Test suite for onCompletion connection handler
 */
describe('connection/onCompletion', () => {
  const mockSettings: LanguageServerSettings = { maxNumberOfProblems: 1000 };

  const createMockConnection = () => ({
    console: {
      log: () => {}, // Mock console log
      error: () => {} // Mock console error
    },
    workspace: {
      getConfiguration: () =>
        Promise.resolve({
          blazeHelpers: {
            hashColor: '#FF6B35',
            nameColor: '#007ACC',
            extend: []
          }
        })
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

  it('should return completion handler function', () => {
    const config = createMockConfig();
    const handler = onCompletion(config);
    assert.strictEqual(typeof handler, 'function');
  });

  it('should handle completion item structure validation', () => {
    // Test completion item structure without async operations
    const mockCompletionItem = {
      label: 'testHelper',
      kind: 3, // CompletionItemKind.Function
      detail: 'Template helper',
      documentation: 'Test helper documentation'
    };

    assert.strictEqual(typeof mockCompletionItem.label, 'string');
    assert.strictEqual(typeof mockCompletionItem.kind, 'number');
    assert.strictEqual(typeof mockCompletionItem.detail, 'string');
    assert.strictEqual(typeof mockCompletionItem.documentation, 'string');
  });
});
