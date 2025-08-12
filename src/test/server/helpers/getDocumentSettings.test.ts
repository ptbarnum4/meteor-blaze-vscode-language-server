import assert from 'assert';
import { describe, it } from 'node:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node';

import getDocumentSettings from '../../../server/helpers/getDocumentSettings';
import { CurrentConnectionConfig, LanguageServerSettings } from '../../../types';

/**
 * Test suite for getDocumentSettings helper function
 */
describe('getDocumentSettings', () => {
  const defaultSettings: LanguageServerSettings = { maxNumberOfProblems: 1000 };

  // Helper function to create a mock config
  const createMockConfig = (hasConfigurationCapability: boolean, connection?: any): CurrentConnectionConfig => ({
    hasConfigurationCapability,
    globalSettings: defaultSettings,
    documentSettings: new Map(),
    connection: connection || null,
    fileAnalysis: {
      jsHelpers: new Map(),
      helperDetails: new Map(),
      cssClasses: new Map(),
      templates: new Map()
    },
    documents: new TextDocuments(TextDocument),
    hasWorkspaceFolderCapability: false,
    hasDiagnosticRelatedInformationCapability: false
  });

  it('should return global settings when configuration capability is disabled', async () => {
    const mockConfig = createMockConfig(false);

    const result = await getDocumentSettings(mockConfig, 'file:///test.html');

    assert.deepStrictEqual(result, defaultSettings);
  });

  it('should fetch settings from connection when configuration capability is enabled', async () => {
    const expectedSettings: LanguageServerSettings = { maxNumberOfProblems: 500 };

    const mockConnection = {
      workspace: {
        getConfiguration: () => Promise.resolve(expectedSettings)
      }
    };

    const mockConfig = createMockConfig(true, mockConnection);

    const result = await getDocumentSettings(mockConfig, 'file:///test.html');

    assert.deepStrictEqual(result, expectedSettings);
  });

  it('should cache document settings', async () => {
    const expectedSettings: LanguageServerSettings = { maxNumberOfProblems: 300 };

    let callCount = 0;
    const mockConnection = {
      workspace: {
        getConfiguration: () => {
          callCount++;
          return Promise.resolve(expectedSettings);
        }
      }
    };

    const mockConfig = createMockConfig(true, mockConnection);

    // First call should fetch from connection
    const result = await getDocumentSettings(mockConfig, 'file:///new-test.html');
    assert.deepStrictEqual(result, expectedSettings);
    assert.strictEqual(callCount, 1);

    // Second call should use cached result
    const cachedResult = await getDocumentSettings(mockConfig, 'file:///new-test.html');
    assert.deepStrictEqual(cachedResult, expectedSettings);
    assert.strictEqual(callCount, 1); // Should not increment
  });

  it('should handle different documents with separate cache entries', async () => {
    const settings1: LanguageServerSettings = { maxNumberOfProblems: 100 };
    const settings2: LanguageServerSettings = { maxNumberOfProblems: 200 };

    let configCallCount = 0;
    const mockConnection = {
      workspace: {
        getConfiguration: () => {
          configCallCount++;
          // Return different settings based on call count
          return Promise.resolve(configCallCount === 1 ? settings1 : settings2);
        }
      }
    };

    const mockConfig = createMockConfig(true, mockConnection);

    const result1 = await getDocumentSettings(mockConfig, 'file:///test1.html');
    const result2 = await getDocumentSettings(mockConfig, 'file:///test2.html');

    assert.deepStrictEqual(result1, settings1);
    assert.deepStrictEqual(result2, settings2);
    assert.strictEqual(configCallCount, 2);
  });
});
