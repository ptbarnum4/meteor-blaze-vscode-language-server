import assert from 'assert';
import { describe, it } from 'node:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { InitializeParams, TextDocuments, TextDocumentSyncKind } from 'vscode-languageserver/node';

import onInitialize from '../../../server/connection/onInitialize';
import { CurrentConnectionConfig, LanguageServerSettings } from '../../../types';

/**
 * Test suite for onInitialize connection handler
 */
describe('connection/onInitialize', () => {
  const mockSettings: LanguageServerSettings = { maxNumberOfProblems: 1000 };

  const createMockConnection = () => ({
    console: {
      log: () => {} // Mock console log
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

  it('should return initialize handler function', () => {
    const config = createMockConfig();
    const handler = onInitialize(config);
    assert.strictEqual(typeof handler, 'function');
  });

  it('should set capabilities correctly with basic client capabilities', () => {
    const config = createMockConfig();
    const handler = onInitialize(config);

    const params: InitializeParams = {
      processId: null,
      rootUri: null,
      capabilities: {
        workspace: {},
        textDocument: {}
      }
    };

    const result = handler(params);

    assert.ok(result.capabilities, 'Should have capabilities');
    assert.strictEqual(result.capabilities.textDocumentSync, TextDocumentSyncKind.Incremental);
    assert.ok(result.capabilities.completionProvider, 'Should have completion provider');
    assert.ok(
      result.capabilities.completionProvider?.resolveProvider,
      'Should resolve completions'
    );
    assert.deepStrictEqual(result.capabilities.completionProvider?.triggerCharacters, [
      '{',
      '"',
      "'",
      '.',
      ' ',
      '}'
    ]);
    assert.strictEqual(result.capabilities.hoverProvider, true);
    assert.strictEqual(result.capabilities.definitionProvider, true);
  });

  it('should detect configuration capability', () => {
    const config = createMockConfig();
    const handler = onInitialize(config);

    const params: InitializeParams = {
      processId: null,
      rootUri: null,
      capabilities: {
        workspace: {
          configuration: true
        },
        textDocument: {}
      }
    };

    handler(params);

    assert.strictEqual(config.hasConfigurationCapability, true);
  });

  it('should detect workspace folder capability', () => {
    const config = createMockConfig();
    const handler = onInitialize(config);

    const params: InitializeParams = {
      processId: null,
      rootUri: null,
      capabilities: {
        workspace: {
          workspaceFolders: true
        },
        textDocument: {}
      }
    };

    const result = handler(params);

    assert.strictEqual(config.hasWorkspaceFolderCapability, true);
    assert.ok(result.capabilities.workspace?.workspaceFolders?.supported);
  });

  it('should detect diagnostic related information capability', () => {
    const config = createMockConfig();
    const handler = onInitialize(config);

    const params: InitializeParams = {
      processId: null,
      rootUri: null,
      capabilities: {
        workspace: {},
        textDocument: {
          publishDiagnostics: {
            relatedInformation: true
          }
        }
      }
    };

    handler(params);

    assert.strictEqual(config.hasDiagnosticRelatedInformationCapability, true);
  });

  it('should handle missing capabilities gracefully', () => {
    const config = createMockConfig();
    const handler = onInitialize(config);

    const params: InitializeParams = {
      processId: null,
      rootUri: null,
      capabilities: {}
    };

    const result = handler(params);

    assert.strictEqual(config.hasConfigurationCapability, false);
    assert.strictEqual(config.hasWorkspaceFolderCapability, false);
    assert.strictEqual(config.hasDiagnosticRelatedInformationCapability, false);
    assert.ok(result.capabilities, 'Should still return capabilities');
  });

  it('should set all capabilities when client supports them', () => {
    const config = createMockConfig();
    const handler = onInitialize(config);

    const params: InitializeParams = {
      processId: null,
      rootUri: null,
      capabilities: {
        workspace: {
          configuration: true,
          workspaceFolders: true
        },
        textDocument: {
          publishDiagnostics: {
            relatedInformation: true
          }
        }
      }
    };

    const result = handler(params);

    assert.strictEqual(config.hasConfigurationCapability, true);
    assert.strictEqual(config.hasWorkspaceFolderCapability, true);
    assert.strictEqual(config.hasDiagnosticRelatedInformationCapability, true);
    assert.ok(result.capabilities.workspace?.workspaceFolders?.supported);
  });
});
