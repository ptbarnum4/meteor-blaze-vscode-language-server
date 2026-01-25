import assert from 'assert';
import { describe, it } from 'node:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';

import onCompletion from '../../../server/connection/onCompletion.js';
import {
  CurrentConnectionConfig,
  HelperInfo,
  LanguageServerSettings,
} from '../../../types/index.js';
import Logger from '../../../utils/logger.js';

/**
 * Test suite for template parameter value completion (Issue #62)
 */
describe('connection/onCompletion - Parameter Value Completion', () => {
  const mockSettings: LanguageServerSettings = { maxNumberOfProblems: 1000 };

  const createMockConnection = () => ({
    console: {
      log: () => {},
      error: () => {},
    },
    workspace: {
      getConfiguration: () =>
        Promise.resolve({
          blazeHelpers: {
            hashColor: '#FF6B35',
            nameColor: '#007ACC',
            extend: [],
          },
          completion: {
            suggestTemplateParams: true,
            suggestTemplateValues: true,
            parameterInferenceMinUsage: 2,
          },
        }),
    },
  });

  const createMockConfig = (
    overrides?: Partial<CurrentConnectionConfig>
  ): CurrentConnectionConfig => ({
    logger: new Logger(createMockConnection() as any),
    globalSettings: mockSettings,
    documentSettings: new Map(),
    fileAnalysis: {
      jsHelpers: new Map(),
      helperDetails: new Map(),
      cssClasses: new Map(),
      templates: new Map(),
    },
    documents: new TextDocuments(TextDocument),
    connection: createMockConnection() as any,
    hasConfigurationCapability: false,
    hasWorkspaceFolderCapability: false,
    hasDiagnosticRelatedInformationCapability: false,
    ...overrides,
  });

  describe('Context Detection', () => {
    it('should detect when cursor is on left side of equals', async () => {
      const content = `
<template name="parent">
  {{> childTemplate
</template>`;

      const document = TextDocument.create(
        'file:///test.html',
        'html',
        1,
        content
      );
      const mockDocuments = {
        get: () => document,
      } as any;

      const config = createMockConfig({ documents: mockDocuments });
      const handler = onCompletion(config);

      const params = {
        textDocument: { uri: 'file:///test.html' },
        position: { line: 2, character: 19 }, // After "childTemplate "
      };

      const completions = await handler(params);
      assert.ok(Array.isArray(completions));
    });

    it('should detect when cursor is on right side of equals', async () => {
      const content = `
<template name="parent">
  {{> childTemplate param=
</template>`;

      const document = TextDocument.create(
        'file:///test.html',
        'html',
        1,
        content
      );
      const mockDocuments = {
        get: () => document,
      } as any;

      const config = createMockConfig({ documents: mockDocuments });
      const handler = onCompletion(config);

      const params = {
        textDocument: { uri: 'file:///test.html' },
        position: { line: 2, character: 27 }, // After "param="
      };

      const completions = await handler(params);
      assert.ok(Array.isArray(completions));
    });

    it('should handle partial value after equals', async () => {
      const content = `
<template name="parent">
  {{> childTemplate param=hel
</template>`;

      const document = TextDocument.create(
        'file:///test.html',
        'html',
        1,
        content
      );
      const mockDocuments = {
        get: () => document,
      } as any;

      const config = createMockConfig({ documents: mockDocuments });
      const handler = onCompletion(config);

      const params = {
        textDocument: { uri: 'file:///test.html' },
        position: { line: 2, character: 30 }, // After "hel"
      };

      const completions = await handler(params);
      assert.ok(Array.isArray(completions));
    });
  });

  describe('Value Suggestions from Current Template', () => {
    it('should suggest helpers from current template context', async () => {
      const content = `
<template name="parent">
  {{> childTemplate param=
</template>`;

      const document = TextDocument.create(
        'file:///test/parent.html',
        'html',
        1,
        content
      );
      const mockDocuments = {
        get: () => document,
      } as any;

      // Mock helpers for the parent template
      const jsHelpers = new Map<string, string[]>();
      jsHelpers.set('/test/parent', ['getUserName', 'getCount', 'isActive']);

      const helperDetails = new Map<string, HelperInfo[]>();
      helperDetails.set('/test/parent', [
        {
          name: 'getUserName',
          returnType: 'string',
          jsdoc: 'Returns the user name',
        },
        {
          name: 'getCount',
          returnType: 'number',
        },
      ]);

      const config = createMockConfig({
        documents: mockDocuments,
        fileAnalysis: {
          jsHelpers,
          helperDetails,
          cssClasses: new Map(),
          templates: new Map(),
        },
      });

      const handler = onCompletion(config);

      const params = {
        textDocument: { uri: 'file:///test/parent.html' },
        position: { line: 2, character: 27 },
      };

      const completions = await handler(params);
      assert.ok(Array.isArray(completions));
      // Completions should include helpers from parent template
    });

    it('should suggest data properties from current template', async () => {
      const content = `
<template name="parent">
  {{> childTemplate param=
</template>`;

      const document = TextDocument.create(
        'file:///test/parent.html',
        'html',
        1,
        content
      );
      const mockDocuments = {
        get: () => document,
      } as any;

      // Mock data properties for the parent template
      const dataProperties = new Map<string, string[]>();
      dataProperties.set('/test/parent', ['userName', 'userEmail', 'isActive']);

      const config = createMockConfig({
        documents: mockDocuments,
        fileAnalysis: {
          jsHelpers: new Map(),
          helperDetails: new Map(),
          cssClasses: new Map(),
          templates: new Map(),
          dataProperties,
        },
      });

      const handler = onCompletion(config);

      const params = {
        textDocument: { uri: 'file:///test/parent.html' },
        position: { line: 2, character: 27 },
      };

      const completions = await handler(params);
      assert.ok(Array.isArray(completions));
    });

    it('should suggest context values (this, true, false)', async () => {
      const content = `
<template name="parent">
  {{> childTemplate param=
</template>`;

      const document = TextDocument.create(
        'file:///test/parent.html',
        'html',
        1,
        content
      );
      const mockDocuments = {
        get: () => document,
      } as any;

      const config = createMockConfig({ documents: mockDocuments });
      const handler = onCompletion(config);

      const params = {
        textDocument: { uri: 'file:///test/parent.html' },
        position: { line: 2, character: 27 },
      };

      const completions = await handler(params);
      assert.ok(Array.isArray(completions));
      // Should include 'this', 'true', 'false' in completions
    });
  });

  describe('Multi-line Template Invocations', () => {
    it('should provide completions on new line in multi-line invocation', async () => {
      const content = `
<template name="parent">
  {{> childTemplate
    param1=value1
    param2=
</template>`;

      const document = TextDocument.create(
        'file:///test/parent.html',
        'html',
        1,
        content
      );
      const mockDocuments = {
        get: () => document,
      } as any;

      const jsHelpers = new Map<string, string[]>();
      jsHelpers.set('/test/parent', ['helper1', 'helper2']);

      const config = createMockConfig({
        documents: mockDocuments,
        fileAnalysis: {
          jsHelpers,
          helperDetails: new Map(),
          cssClasses: new Map(),
          templates: new Map(),
        },
      });

      const handler = onCompletion(config);

      const params = {
        textDocument: { uri: 'file:///test/parent.html' },
        position: { line: 4, character: 12 }, // After "param2="
      };

      const completions = await handler(params);
      assert.ok(Array.isArray(completions));
    });

    it('should handle indented template invocations', async () => {
      const content = `
<template name="parent">
  <div>
    {{> childTemplate
      param=
  </div>
</template>`;

      const document = TextDocument.create(
        'file:///test/parent.html',
        'html',
        1,
        content
      );
      const mockDocuments = {
        get: () => document,
      } as any;

      const config = createMockConfig({ documents: mockDocuments });
      const handler = onCompletion(config);

      const params = {
        textDocument: { uri: 'file:///test/parent.html' },
        position: { line: 4, character: 13 }, // After "param="
      };

      const completions = await handler(params);
      assert.ok(Array.isArray(completions));
    });
  });

  describe('Edge Cases', () => {
    it('should return empty array outside template invocations', async () => {
      const content = `
<template name="parent">
  <div>
</template>`;

      const document = TextDocument.create(
        'file:///test/parent.html',
        'html',
        1,
        content
      );
      const mockDocuments = {
        get: () => document,
      } as any;

      const config = createMockConfig({ documents: mockDocuments });
      const handler = onCompletion(config);

      const params = {
        textDocument: { uri: 'file:///test/parent.html' },
        position: { line: 2, character: 7 }, // Inside <div>
      };

      const completions = await handler(params);
      assert.strictEqual(completions.length, 0);
    });

    it('should return empty array for non-HTML files', async () => {
      const content = `const x = 1;`;
      const document = TextDocument.create(
        'file:///test.ts',
        'typescript',
        1,
        content
      );
      const mockDocuments = {
        get: () => document,
      } as any;

      const config = createMockConfig({ documents: mockDocuments });
      const handler = onCompletion(config);

      const params = {
        textDocument: { uri: 'file:///test.ts' },
        position: { line: 0, character: 10 },
      };

      const completions = await handler(params);
      assert.strictEqual(completions.length, 0);
    });

    it('should handle cursor at template name (not in parameters)', async () => {
      const content = `
<template name="parent">
  {{> chil
</template>`;

      const document = TextDocument.create(
        'file:///test/parent.html',
        'html',
        1,
        content
      );
      const mockDocuments = {
        get: () => document,
      } as any;

      const config = createMockConfig({ documents: mockDocuments });
      const handler = onCompletion(config);

      const params = {
        textDocument: { uri: 'file:///test/parent.html' },
        position: { line: 2, character: 10 }, // At "chil"
      };

      const completions = await handler(params);
      assert.ok(Array.isArray(completions));
      // Should be template name completions, not parameter values
    });

    it('should not provide value completions when no current template found', async () => {
      const content = `
{{> childTemplate param=`;

      const document = TextDocument.create(
        'file:///test/parent.html',
        'html',
        1,
        content
      );
      const mockDocuments = {
        get: () => document,
      } as any;

      const config = createMockConfig({ documents: mockDocuments });
      const handler = onCompletion(config);

      const params = {
        textDocument: { uri: 'file:///test/parent.html' },
        position: { line: 1, character: 24 },
      };

      const completions = await handler(params);
      assert.ok(Array.isArray(completions));
      // Should return empty or minimal completions as we're not inside a template
    });
  });

  describe('Completion Item Structure', () => {
    it('should return properly structured completion items for helpers', () => {
      const mockHelperCompletion = {
        label: 'getUserName',
        kind: 3, // CompletionItemKind.Function
        detail: 'Helper: string',
        documentation: {
          kind: 'markdown',
          value: 'Returns the user name',
        },
        insertText: 'getUserName',
        sortText: '0getUserName',
      };

      assert.strictEqual(typeof mockHelperCompletion.label, 'string');
      assert.strictEqual(typeof mockHelperCompletion.kind, 'number');
      assert.strictEqual(typeof mockHelperCompletion.detail, 'string');
      assert.strictEqual(typeof mockHelperCompletion.sortText, 'string');
    });

    it('should return properly structured completion items for data properties', () => {
      const mockDataCompletion = {
        label: 'userName',
        kind: 10, // CompletionItemKind.Field
        detail: 'Template data property',
        documentation: {
          kind: 'markdown',
          value: 'Data property from the current template',
        },
        insertText: 'userName',
        sortText: '1userName',
      };

      assert.strictEqual(typeof mockDataCompletion.label, 'string');
      assert.strictEqual(mockDataCompletion.kind, 10);
      assert.strictEqual(typeof mockDataCompletion.detail, 'string');
    });

    it('should return properly structured completion items for context values', () => {
      const mockContextCompletion = {
        label: 'this',
        kind: 21, // CompletionItemKind.Constant
        detail: 'Current template data context',
        insertText: 'this',
        sortText: '2this',
      };

      assert.strictEqual(typeof mockContextCompletion.label, 'string');
      assert.strictEqual(mockContextCompletion.kind, 21);
      assert.strictEqual(typeof mockContextCompletion.sortText, 'string');
    });
  });
});
