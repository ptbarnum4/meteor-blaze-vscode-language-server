import assert from 'assert';
import { describe, it } from 'node:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocumentChangeEvent, TextDocuments } from 'vscode-languageserver/node';

import onDidClose from '../../../server/connection/onDidClose';
import { CurrentConnectionConfig, LanguageServerSettings } from '../../../types';

/**
 * Test suite for onDidClose connection handler
 */
describe('connection/onDidClose', () => {
  const mockSettings: LanguageServerSettings = { maxNumberOfProblems: 1000 };

  const createMockConnection = () => ({
    console: {
      log: () => {} // Mock console log
    }
  });

  const createMockConfig = (overrides?: Partial<CurrentConnectionConfig>): CurrentConnectionConfig => ({
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

  it('should return close handler function', () => {
    const config = createMockConfig();
    const handler = onDidClose(config);
    assert.strictEqual(typeof handler, 'function');
  });

  it('should remove document settings when document is closed', () => {
    const config = createMockConfig();
    const documentUri = 'file:///test.html';

    // Add document settings
    config.documentSettings.set(documentUri, Promise.resolve(mockSettings));
    assert.strictEqual(config.documentSettings.size, 1);
    assert.ok(config.documentSettings.has(documentUri));

    const handler = onDidClose(config);

    const document = TextDocument.create(documentUri, 'html', 1, '<div>test</div>');
    const event: TextDocumentChangeEvent<TextDocument> = {
      document
    };

    handler(event);

    // Document settings should be removed
    assert.strictEqual(config.documentSettings.size, 0);
    assert.strictEqual(config.documentSettings.has(documentUri), false);
  });

  it('should handle closing document that has no settings', () => {
    const config = createMockConfig();
    const documentUri = 'file:///test.html';

    // Ensure no settings exist
    assert.strictEqual(config.documentSettings.size, 0);

    const handler = onDidClose(config);

    const document = TextDocument.create(documentUri, 'html', 1, '<div>test</div>');
    const event: TextDocumentChangeEvent<TextDocument> = {
      document
    };

    // Should not throw when trying to delete non-existent settings
    assert.doesNotThrow(() => {
      handler(event);
    });

    assert.strictEqual(config.documentSettings.size, 0);
  });

  it('should only remove settings for the specific document', () => {
    const config = createMockConfig();
    const documentUri1 = 'file:///test1.html';
    const documentUri2 = 'file:///test2.html';

    // Add settings for both documents
    config.documentSettings.set(documentUri1, Promise.resolve(mockSettings));
    config.documentSettings.set(documentUri2, Promise.resolve(mockSettings));
    assert.strictEqual(config.documentSettings.size, 2);

    const handler = onDidClose(config);

    const document1 = TextDocument.create(documentUri1, 'html', 1, '<div>test1</div>');
    const event: TextDocumentChangeEvent<TextDocument> = {
      document: document1
    };

    handler(event);

    // Only the first document's settings should be removed
    assert.strictEqual(config.documentSettings.size, 1);
    assert.strictEqual(config.documentSettings.has(documentUri1), false);
    assert.strictEqual(config.documentSettings.has(documentUri2), true);
  });

  it('should handle multiple close events for the same document', () => {
    const config = createMockConfig();
    const documentUri = 'file:///test.html';

    // Add document settings
    config.documentSettings.set(documentUri, Promise.resolve(mockSettings));
    assert.strictEqual(config.documentSettings.size, 1);

    const handler = onDidClose(config);

    const document = TextDocument.create(documentUri, 'html', 1, '<div>test</div>');
    const event: TextDocumentChangeEvent<TextDocument> = {
      document
    };

    // First close
    handler(event);
    assert.strictEqual(config.documentSettings.size, 0);

    // Second close of the same document should not throw
    assert.doesNotThrow(() => {
      handler(event);
    });

    assert.strictEqual(config.documentSettings.size, 0);
  });

  it('should handle various document types', () => {
    const config = createMockConfig();

    const documents = [
      { uri: 'file:///test.html', languageId: 'html' },
      { uri: 'file:///test.hbs', languageId: 'handlebars' },
      { uri: 'file:///test.js', languageId: 'javascript' },
      { uri: 'file:///test.ts', languageId: 'typescript' },
      { uri: 'file:///test.css', languageId: 'css' }
    ];

    // Add settings for all documents
    documents.forEach(doc => {
      config.documentSettings.set(doc.uri, Promise.resolve(mockSettings));
    });
    assert.strictEqual(config.documentSettings.size, documents.length);

    const handler = onDidClose(config);

    // Close each document
    documents.forEach(docInfo => {
      const document = TextDocument.create(docInfo.uri, docInfo.languageId, 1, 'content');
      const event: TextDocumentChangeEvent<TextDocument> = {
        document
      };

      assert.doesNotThrow(() => {
        handler(event);
      });
    });

    // All settings should be removed
    assert.strictEqual(config.documentSettings.size, 0);
  });

  it('should handle documents with complex URIs', () => {
    const config = createMockConfig();
    const complexUri = 'file:///very/long/path/with/spaces%20and%20special%20chars/test.html';

    // Add settings for complex URI
    config.documentSettings.set(complexUri, Promise.resolve(mockSettings));
    assert.strictEqual(config.documentSettings.size, 1);

    const handler = onDidClose(config);

    const document = TextDocument.create(complexUri, 'html', 1, '<div>test</div>');
    const event: TextDocumentChangeEvent<TextDocument> = {
      document
    };

    handler(event);

    // Settings should be removed for complex URI
    assert.strictEqual(config.documentSettings.size, 0);
    assert.strictEqual(config.documentSettings.has(complexUri), false);
  });
});
