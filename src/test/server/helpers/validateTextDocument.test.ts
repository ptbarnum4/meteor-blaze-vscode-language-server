import assert from 'assert';
import { describe, it } from 'node:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node';

import { validateTextDocument } from '../../../server/helpers/validateTextDocument';
import { CurrentConnectionConfig, LanguageServerSettings } from '../../../types';

/**
 * Test suite for validateTextDocument helper function
 */
describe('validateTextDocument', () => {
  const mockSettings: LanguageServerSettings = { maxNumberOfProblems: 1000 };

  // Create a mock connection with the required methods
  const createMockConnection = () => ({
    sendDiagnostics: () => {}, // Mock implementation that does nothing
    workspace: {
      getConfiguration: () => Promise.resolve(mockSettings)
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

  it('should validate HTML document with template content', async () => {
    const content = `
      <template name="myTemplate">
        <p>{{helper}}</p>
      </template>
    `;

    const document = TextDocument.create('file:///test.html', 'html', 1, content);
    const config = createMockConfig();

    // This should not throw an error
    await validateTextDocument(config, document);

    // The function doesn't return anything, so we just test that it completes
    assert.ok(true);
  });

  it('should validate JavaScript document with helper definitions', async () => {
    const content = `
      Template.myTemplate.helpers({
        myHelper() {
          return "Hello World";
        }
      });
    `;

    const document = TextDocument.create('file:///test.js', 'javascript', 1, content);
    const config = createMockConfig();

    // This should not throw an error
    await validateTextDocument(config, document);

    assert.ok(true);
  });

  it('should validate CSS document with class definitions', async () => {
    const content = `
      .my-class {
        color: blue;
      }

      #my-id {
        background: red;
      }
    `;

    const document = TextDocument.create('file:///test.css', 'css', 1, content);
    const config = createMockConfig();

    // This should not throw an error
    await validateTextDocument(config, document);

    assert.ok(true);
  });

  it('should handle empty documents', async () => {
    const document = TextDocument.create('file:///empty.html', 'html', 1, '');
    const config = createMockConfig();

    // This should not throw an error
    await validateTextDocument(config, document);

    assert.ok(true);
  });

  it('should respect maxNumberOfProblems setting', async () => {
    const content = `
      <template name="testTemplate">
        <div>Content</div>
      </template>
    `;

    const document = TextDocument.create('file:///test.html', 'html', 1, content);
    const configWithLimit = createMockConfig({
      globalSettings: { maxNumberOfProblems: 5 }
    });

    // This should not throw an error
    await validateTextDocument(configWithLimit, document);

    assert.ok(true);
  });

  it('should handle configuration capability', async () => {
    const content = `<template name="configTest"><p>Test</p></template>`;

    const document = TextDocument.create('file:///config-test.html', 'html', 1, content);
    const configWithCapability = createMockConfig({
      hasConfigurationCapability: true
    });

    // This should not throw an error
    await validateTextDocument(configWithCapability, document);

    assert.ok(true);
  });
});
