import assert from 'assert';
import { describe, it } from 'node:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { InitializedParams, TextDocuments } from 'vscode-languageserver/node';

import onInitialized from '../../../server/connection/onInitialized';
import { CurrentConnectionConfig, LanguageServerSettings } from '../../../types';

/**
 * Test suite for onInitialized connection handler
 */
describe('connection/onInitialized', () => {
  const mockSettings: LanguageServerSettings = { maxNumberOfProblems: 1000 };

  const createMockConnection = () => ({
    console: {
      log: () => {}, // Mock console log
      info: () => {}, // Mock console info
      error: () => {} // Mock console error
    },
    client: {
      register: () => Promise.resolve() // Mock client.register
    },
    workspace: {
      onDidChangeWorkspaceFolders: () => {}, // Mock workspace folder change handler
      getConfiguration: () => Promise.resolve({ validateWorkspaceOnStartup: false }) // Mock config
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

  it('should return initialized handler function', () => {
    const config = createMockConfig();
    const handler = onInitialized(config);
    assert.strictEqual(typeof handler, 'function');
  });

  it('should register configuration change notification when capability is enabled', () => {
    let registrationCalled = false;

    const mockConnection = createMockConnection();
    mockConnection.client.register = () => {
      registrationCalled = true;
      return Promise.resolve();
    };

    const config = createMockConfig({
      hasConfigurationCapability: true,
      connection: mockConnection as any
    });

    const handler = onInitialized(config);

    const params: InitializedParams = {};

    handler(params);

    assert.strictEqual(registrationCalled, true);
  });

  it('should not register configuration change notification when capability is disabled', () => {
    let registrationCalled = false;

    const mockConnection = createMockConnection();
    mockConnection.client.register = () => {
      registrationCalled = true;
      return Promise.resolve();
    };

    const config = createMockConfig({
      hasConfigurationCapability: false,
      connection: mockConnection as any
    });

    const handler = onInitialized(config);

    const params: InitializedParams = {};

    handler(params);

    assert.strictEqual(registrationCalled, false);
  });

  it('should register workspace folder change handler when capability is enabled', () => {
    let workspaceHandlerRegistered = false;

    const mockConnection = createMockConnection();
    mockConnection.workspace.onDidChangeWorkspaceFolders = () => {
      workspaceHandlerRegistered = true;
    };

    const config = createMockConfig({
      hasWorkspaceFolderCapability: true,
      connection: mockConnection as any
    });

    const handler = onInitialized(config);

    const params: InitializedParams = {};

    handler(params);

    assert.strictEqual(workspaceHandlerRegistered, true);
  });

  it('should not register workspace folder change handler when capability is disabled', () => {
    let workspaceHandlerRegistered = false;

    const mockConnection = createMockConnection();
    mockConnection.workspace.onDidChangeWorkspaceFolders = () => {
      workspaceHandlerRegistered = true;
    };

    const config = createMockConfig({
      hasWorkspaceFolderCapability: false,
      connection: mockConnection as any
    });

    const handler = onInitialized(config);

    const params: InitializedParams = {};

    handler(params);

    assert.strictEqual(workspaceHandlerRegistered, false);
  });

  it('should handle both capabilities enabled', () => {
    let configRegistered = false;
    let workspaceRegistered = false;

    const mockConnection = createMockConnection();
    mockConnection.client.register = () => {
      configRegistered = true;
      return Promise.resolve();
    };
    mockConnection.workspace.onDidChangeWorkspaceFolders = () => {
      workspaceRegistered = true;
    };

    const config = createMockConfig({
      hasConfigurationCapability: true,
      hasWorkspaceFolderCapability: true,
      connection: mockConnection as any
    });

    const handler = onInitialized(config);

    const params: InitializedParams = {};

    handler(params);

    assert.strictEqual(configRegistered, true);
    assert.strictEqual(workspaceRegistered, true);
  });

  it('should handle neither capability enabled', () => {
    let configRegistered = false;
    let workspaceRegistered = false;

    const mockConnection = createMockConnection();
    mockConnection.client.register = () => {
      configRegistered = true;
      return Promise.resolve();
    };
    mockConnection.workspace.onDidChangeWorkspaceFolders = () => {
      workspaceRegistered = true;
    };

    const config = createMockConfig({
      hasConfigurationCapability: false,
      hasWorkspaceFolderCapability: false,
      connection: mockConnection as any
    });

    const handler = onInitialized(config);

    const params: InitializedParams = {};

    handler(params);

    assert.strictEqual(configRegistered, false);
    assert.strictEqual(workspaceRegistered, false);
  });

  it('should handle empty initialized params', () => {
    const config = createMockConfig();
    const handler = onInitialized(config);

    const params: InitializedParams = {};

    // Should not throw with empty params
    assert.doesNotThrow(() => {
      handler(params);
    });
  });

  it('should handle undefined initialized params', () => {
    const config = createMockConfig();
    const handler = onInitialized(config);

    // Should not throw with undefined params
    assert.doesNotThrow(() => {
      handler(undefined as any);
    });
  });
});
