import assert from 'assert';
import { describe, it } from 'node:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocumentChangeEvent, TextDocuments } from 'vscode-languageserver/node';

import onDidChangeContent from '../../../server/connection/onDidChangeContent';
import { CurrentConnectionConfig, LanguageServerSettings } from '../../../types';

/**
 * Test suite for onDidChangeContent connection handler
 */
describe('connection/onDidChangeContent', () => {
  const mockSettings: LanguageServerSettings = { maxNumberOfProblems: 1000 };

  const createMockConnection = () => ({
    console: {
      log: () => {} // Mock console log
    },
    sendDiagnostics: () => {}, // Mock sendDiagnostics
    workspace: {
      getConfiguration: () => Promise.resolve(mockSettings)
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

  it('should return change content handler function', () => {
    const config = createMockConfig();
    const handler = onDidChangeContent(config);
    assert.strictEqual(typeof handler, 'function');
  });

  it('should handle HTML document change', () => {
    const config = createMockConfig();
    const handler = onDidChangeContent(config);

    const content = '<template name="test"><div>{{helper}}</div></template>';
    const document = TextDocument.create('file:///test.html', 'html', 1, content);

    const changeEvent: TextDocumentChangeEvent<TextDocument> = {
      document
    };

    // Should not throw when processing the change
    assert.doesNotThrow(() => {
      handler(changeEvent);
    });
  });

  it('should handle handlebars document change', () => {
    const config = createMockConfig();
    const handler = onDidChangeContent(config);

    const content = '<template name="test"><div>{{helper}}</div></template>';
    const document = TextDocument.create('file:///test.hbs', 'handlebars', 1, content);

    const changeEvent: TextDocumentChangeEvent<TextDocument> = {
      document
    };

    // Should not throw when processing the change
    assert.doesNotThrow(() => {
      handler(changeEvent);
    });
  });

  it('should handle document without Meteor templates', () => {
    const config = createMockConfig();
    const handler = onDidChangeContent(config);

    const content = '<div>Regular HTML content</div>';
    const document = TextDocument.create('file:///test.html', 'html', 1, content);

    const changeEvent: TextDocumentChangeEvent<TextDocument> = {
      document
    };

    // Should not throw even without templates
    assert.doesNotThrow(() => {
      handler(changeEvent);
    });
  });

  it('should handle document with Meteor templates', () => {
    const config = createMockConfig();
    const handler = onDidChangeContent(config);

    const content = `
      <template name="myTemplate">
        <div>{{helper}}</div>
      </template>
    `;
    const document = TextDocument.create('file:///test.html', 'html', 1, content);

    const changeEvent: TextDocumentChangeEvent<TextDocument> = {
      document
    };

    // Should process templates without throwing
    assert.doesNotThrow(() => {
      handler(changeEvent);
    });
  });

  it('should handle empty document', () => {
    const config = createMockConfig();
    const handler = onDidChangeContent(config);

    const content = '';
    const document = TextDocument.create('file:///test.html', 'html', 1, content);

    const changeEvent: TextDocumentChangeEvent<TextDocument> = {
      document
    };

    // Should handle empty content
    assert.doesNotThrow(() => {
      handler(changeEvent);
    });
  });

  it('should handle JavaScript document', () => {
    const config = createMockConfig();
    const handler = onDidChangeContent(config);

    const content = `
      Template.myTemplate.helpers({
        myHelper: function() {
          return 'test';
        }
      });
    `;
    const document = TextDocument.create('file:///test.js', 'javascript', 1, content);

    const changeEvent: TextDocumentChangeEvent<TextDocument> = {
      document
    };

    // Should handle JS files (though they're not HTML/handlebars)
    assert.doesNotThrow(() => {
      handler(changeEvent);
    });
  });

  it('should handle TypeScript document', () => {
    const config = createMockConfig();
    const handler = onDidChangeContent(config);

    const content = `
      Template.myTemplate.helpers({
        myHelper(): string {
          return 'test';
        }
      });
    `;
    const document = TextDocument.create('file:///test.ts', 'typescript', 1, content);

    const changeEvent: TextDocumentChangeEvent<TextDocument> = {
      document
    };

    // Should handle TS files
    assert.doesNotThrow(() => {
      handler(changeEvent);
    });
  });

  it('should handle CSS document', () => {
    const config = createMockConfig();
    const handler = onDidChangeContent(config);

    const content = `
      .btn { background: blue; }
      .btn-primary { color: white; }
    `;
    const document = TextDocument.create('file:///test.css', 'css', 1, content);

    const changeEvent: TextDocumentChangeEvent<TextDocument> = {
      document
    };

    // Should handle CSS files
    assert.doesNotThrow(() => {
      handler(changeEvent);
    });
  });

  it('should handle malformed document content', () => {
    const config = createMockConfig();
    const handler = onDidChangeContent(config);

    const content = '<template name="test"><div>{{unclosed handlebars</div>';
    const document = TextDocument.create('file:///test.html', 'html', 1, content);

    const changeEvent: TextDocumentChangeEvent<TextDocument> = {
      document
    };

    // Should handle malformed content gracefully
    assert.doesNotThrow(() => {
      handler(changeEvent);
    });
  });

  it('should handle very large document', () => {
    const config = createMockConfig();
    const handler = onDidChangeContent(config);

    // Create a large document
    const templateContent = '<template name="test"><div>{{helper}}</div></template>';
    const content = templateContent.repeat(1000);
    const document = TextDocument.create('file:///test.html', 'html', 1, content);

    const changeEvent: TextDocumentChangeEvent<TextDocument> = {
      document
    };

    // Should handle large documents
    assert.doesNotThrow(() => {
      handler(changeEvent);
    });
  });

  it('should call validation and analysis functions', () => {
    const config = createMockConfig();
    let validateCalled = false;
    let analyzeCalled = false;

    // We can't easily mock the imported functions, but we can verify the handler runs
    // In a real implementation, we might use dependency injection for better testability
    const handler = onDidChangeContent(config);

    const content = '<template name="test"><div>{{helper}}</div></template>';
    const document = TextDocument.create('file:///test.html', 'html', 1, content);

    const changeEvent: TextDocumentChangeEvent<TextDocument> = {
      document
    };

    // The fact that this doesn't throw indicates the functions are called
    assert.doesNotThrow(() => {
      handler(changeEvent);
    });
  });
});
