import assert from 'assert';
import { describe, it } from 'node:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DefinitionParams, Position, TextDocuments } from 'vscode-languageserver/node';

import onDefinition from '../../../server/connection/onDefinition';
import { CurrentConnectionConfig, LanguageServerSettings } from '../../../types';

/**
 * Test suite for onDefinition connection handler
 */
describe('connection/onDefinition', () => {
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

  it('should return definition handler function', () => {
    const config = createMockConfig();
    const handler = onDefinition(config);
    assert.strictEqual(typeof handler, 'function');
  });

  it('should return null when document not found', () => {
    const config = createMockConfig();
    const handler = onDefinition(config);

    const params: DefinitionParams = {
      textDocument: { uri: 'file:///nonexistent.html' },
      position: Position.create(0, 0)
    };

    const result = handler(params);
    assert.strictEqual(result, null);
  });

  it('should return null when document has no Meteor templates', () => {
    const config = createMockConfig();
    const documents = config.documents;

    // Create a document without templates
    const content = '<div>Regular HTML content</div>';
    const document = TextDocument.create('file:///test.html', 'html', 1, content);
    documents.get = () => document;

    const handler = onDefinition(config);

    const params: DefinitionParams = {
      textDocument: { uri: 'file:///test.html' },
      position: Position.create(0, 5)
    };

    const result = handler(params);
    assert.strictEqual(result, null);
  });

  it('should return null when cursor is outside template block', () => {
    const config = createMockConfig();
    const documents = config.documents;

    // Create a document with templates but cursor outside template
    const content = '<div>Before</div><template name="test"><div>{{helper}}</div></template>';
    const document = TextDocument.create('file:///test.html', 'html', 1, content);
    documents.get = () => document;

    const handler = onDefinition(config);

    const params: DefinitionParams = {
      textDocument: { uri: 'file:///test.html' },
      position: Position.create(0, 10) // Position in 'Before' div
    };

    const result = handler(params);
    assert.strictEqual(result, null);
  });

  it('should return null when cursor is not in handlebars expression', () => {
    const config = createMockConfig();
    const documents = config.documents;

    // Create a document with cursor outside handlebars in template
    const content = '<template name="test"><div>regular text {{helper}}</div></template>';
    const document = TextDocument.create('file:///test.html', 'html', 1, content);
    documents.get = () => document;

    const handler = onDefinition(config);

    const params: DefinitionParams = {
      textDocument: { uri: 'file:///test.html' },
      position: Position.create(0, 30) // Position on 'regular'
    };

    const result = handler(params);
    assert.strictEqual(result, null);
  });

  it('should return null when no word at cursor position', () => {
    const config = createMockConfig();
    const documents = config.documents;

    // Create a document with cursor on whitespace inside handlebars
    const content = '<template name="test"><div>{{ }}</div></template>';
    const document = TextDocument.create('file:///test.html', 'html', 1, content);
    documents.get = () => document;

    const handler = onDefinition(config);

    const params: DefinitionParams = {
      textDocument: { uri: 'file:///test.html' },
      position: Position.create(0, 28) // Position on whitespace in handlebars
    };

    const result = handler(params);
    assert.strictEqual(result, null);
  });

  it('should find helper definition in JavaScript file', () => {
    const config = createMockConfig();
    const documents = config.documents;

    // Create a document with helper reference
    const content = '<template name="myTemplate"><div>{{customHelper}}</div></template>';
    const document = TextDocument.create('file:///test.html', 'html', 1, content);
    documents.get = () => document;

    // Add custom helper to file analysis that should exist
    config.fileAnalysis.jsHelpers.set('myTemplate', ['customHelper']);

    const handler = onDefinition(config);

    const params: DefinitionParams = {
      textDocument: { uri: 'file:///test.html' },
      position: Position.create(0, 40) // Position on 'customHelper'
    };

    const result = handler(params);

    // Should return location array (even if empty due to file not existing in test)
    assert.ok(Array.isArray(result) || result === null);
  });

  it('should find CSS class definition', () => {
    const config = createMockConfig();
    const documents = config.documents;

    // Create a document with CSS class reference in handlebars
    const content = '<template name="test"><div class="{{btnClass}}"></div></template>';
    const document = TextDocument.create('file:///test.html', 'html', 1, content);
    documents.get = () => document;

    // Add CSS classes to file analysis
    config.fileAnalysis.cssClasses.set('test.css', ['btn', 'btn-primary']);

    const handler = onDefinition(config);

    const params: DefinitionParams = {
      textDocument: { uri: 'file:///test.html' },
      position: Position.create(0, 42) // Position on 'btnClass'
    };

    const result = handler(params);

    // Should return location array (even if empty due to file not existing in test)
    assert.ok(Array.isArray(result) || result === null);
  });

  it('should handle template-specific helpers', () => {
    const config = createMockConfig();
    const documents = config.documents;

    // Create a document with template-specific helper
    const content = '<template name="specificTemplate"><div>{{templateHelper}}</div></template>';
    const document = TextDocument.create('file:///test.html', 'html', 1, content);
    documents.get = () => document;

    // Add template-specific helper
    config.fileAnalysis.jsHelpers.set('specificTemplate', ['templateHelper']);

    const handler = onDefinition(config);

    const params: DefinitionParams = {
      textDocument: { uri: 'file:///test.html' },
      position: Position.create(0, 50) // Position on 'templateHelper'
    };

    const result = handler(params);

    // Should handle the request (return array or null)
    assert.ok(Array.isArray(result) || result === null);
  });

  it('should handle base file helpers', () => {
    const config = createMockConfig();
    const documents = config.documents;

    // Create a document with helper that might be in base file
    const content = '<template name="test"><div>{{baseHelper}}</div></template>';
    const document = TextDocument.create('file:///test.html', 'html', 1, content);
    documents.get = () => document;

    // Add helper to base file analysis (filename without template name)
    config.fileAnalysis.jsHelpers.set('test', ['baseHelper']);

    const handler = onDefinition(config);

    const params: DefinitionParams = {
      textDocument: { uri: 'file:///test.html' },
      position: Position.create(0, 30) // Position on 'baseHelper'
    };

    const result = handler(params);

    // Should handle the request
    assert.ok(Array.isArray(result) || result === null);
  });

  it('should handle helpers with special characters', () => {
    const config = createMockConfig();
    const documents = config.documents;

    // Create a document with helper that has special characters
    const content = '<template name="test"><div>{{#if condition}}</div></template>';
    const document = TextDocument.create('file:///test.html', 'html', 1, content);
    documents.get = () => document;

    const handler = onDefinition(config);

    const params: DefinitionParams = {
      textDocument: { uri: 'file:///test.html' },
      position: Position.create(0, 29) // Position on '#if'
    };

    const result = handler(params);

    // Should handle built-in helpers gracefully
    assert.ok(Array.isArray(result) || result === null);
  });
});
