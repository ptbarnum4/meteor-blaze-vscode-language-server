import assert from 'assert';
import { describe, it } from 'node:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DidChangeConfigurationParams, TextDocuments } from 'vscode-languageserver/node';

import onDidChangeConfiguration from '/server/connection/onDidChangeConfiguration';
import { CurrentConnectionConfig, LanguageServerSettings } from '/types';

/**
 * Test suite for onDidChangeConfiguration connection handler
 */
describe('connection/onDidChangeConfiguration', () => {
  const mockSettings: LanguageServerSettings = { maxNumberOfProblems: 1000 };

  const createMockConnection = () => ({
    console: {
      log: () => {} // Mock console.log
    },
    sendDiagnostics: () => {}, // Mock sendDiagnostics
    workspace: {
      getConfiguration: () => Promise.resolve(mockSettings)
    }
  });

  const createMockDocuments = () => {
    const documents = new TextDocuments(TextDocument);
    // Mock the all() method to return some test documents
    documents.all = () => [
      TextDocument.create('file:///test1.html', 'html', 1, '<div>test</div>'),
      TextDocument.create('file:///test2.html', 'html', 1, '<template name="test"></template>')
    ];
    return documents;
  };

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
    documents: createMockDocuments(),
    connection: createMockConnection() as any,
    hasConfigurationCapability: false,
    hasWorkspaceFolderCapability: false,
    hasDiagnosticRelatedInformationCapability: false,
    ...overrides
  });

  it('should return configuration change handler function', () => {
    const config = createMockConfig();
    const handler = onDidChangeConfiguration(config);
    assert.strictEqual(typeof handler, 'function');
  });

  it('should clear document settings when configuration capability is enabled', () => {
    const config = createMockConfig({ hasConfigurationCapability: true });

    // Add some document settings
    config.documentSettings.set('file:///test.html', Promise.resolve(mockSettings));
    assert.strictEqual(config.documentSettings.size, 1);

    const handler = onDidChangeConfiguration(config);

    const params: DidChangeConfigurationParams = {
      settings: {}
    };

    handler(params);

    // Document settings should be cleared, but then validateTextDocument is called
    // on all documents, which adds entries back via getDocumentSettings
    // Since we have 2 mock documents, we expect 2 entries
    assert.strictEqual(config.documentSettings.size, 2);
  });

  it('should update global settings when configuration capability is disabled', () => {
    const config = createMockConfig({ hasConfigurationCapability: false });

    const newSettings = { maxNumberOfProblems: 500 };
    const handler = onDidChangeConfiguration(config);

    const params: DidChangeConfigurationParams = {
      settings: {
        meteorLanguageServer: newSettings
      }
    };

    handler(params);

    // Global settings should be updated
    assert.strictEqual(config.globalSettings.maxNumberOfProblems, 500);
  });

  it('should use default settings when meteorLanguageServer is not provided', () => {
    const config = createMockConfig({ hasConfigurationCapability: false });

    const handler = onDidChangeConfiguration(config);

    const params: DidChangeConfigurationParams = {
      settings: {}
    };

    handler(params);

    // Should use default settings
    assert.strictEqual(config.globalSettings.maxNumberOfProblems, 1000);
  });

  it('should validate all documents after configuration change', () => {
    const config = createMockConfig();

    const handler = onDidChangeConfiguration(config);

    const params: DidChangeConfigurationParams = {
      settings: {
        meteorLanguageServer: { maxNumberOfProblems: 50 }
      }
    };

    // Should not throw when validating documents
    assert.doesNotThrow(() => {
      handler(params);
    });
  });

  it('should handle empty settings object', () => {
    const config = createMockConfig({ hasConfigurationCapability: false });

    const handler = onDidChangeConfiguration(config);

    const params: DidChangeConfigurationParams = {
      settings: {}
    };

    assert.doesNotThrow(() => {
      handler(params);
    });

    // Should maintain default settings
    assert.strictEqual(config.globalSettings.maxNumberOfProblems, 1000);
  });

  it('should handle null/undefined settings', () => {
    const config = createMockConfig({ hasConfigurationCapability: false });

    const handler = onDidChangeConfiguration(config);

    const params: DidChangeConfigurationParams = {
      settings: {
        meteorLanguageServer: null
      }
    };

    assert.doesNotThrow(() => {
      handler(params);
    });
  });

  it('should preserve existing document settings map when capability enabled', () => {
    const config = createMockConfig({ hasConfigurationCapability: true });
    const originalMap = config.documentSettings;

    // Add some settings
    config.documentSettings.set('file:///test.html', Promise.resolve(mockSettings));

    const handler = onDidChangeConfiguration(config);

    const params: DidChangeConfigurationParams = {
      settings: {}
    };

    handler(params);

    // Should be the same map object, just cleared, then repopulated by validateTextDocument
    assert.strictEqual(config.documentSettings, originalMap);
    // Should have 2 entries from the 2 mock documents after validation
    assert.strictEqual(config.documentSettings.size, 2);
  });
});
