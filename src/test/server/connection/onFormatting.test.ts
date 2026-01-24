import assert from 'assert';
import { describe, it } from 'node:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  FormattingOptions,
  TextDocuments,
} from 'vscode-languageserver/node.js';

import {
  onDocumentFormatting,
  onDocumentOnTypeFormatting,
  onDocumentRangeFormatting,
} from '../../../server/connection/onFormatting.js';
import {
  CurrentConnectionConfig,
  LanguageServerSettings,
} from '../../../types/index.js';

/**
 * Test suite for onFormatting connection handlers
 */
describe('connection/onFormatting', () => {
  const mockSettings: LanguageServerSettings = { maxNumberOfProblems: 1000 };

  const createMockConnection = () => ({
    console: {
      log: () => {},
      error: () => {},
    },
    workspace: {
      getConfiguration: () =>
        Promise.resolve({
          formatting: {
            enabled: true,
            indentSize: 2,
          },
        }),
    },
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
      templates: new Map(),
    },
    documents: new TextDocuments(TextDocument),
    connection: createMockConnection() as any,
    hasConfigurationCapability: false,
    hasWorkspaceFolderCapability: false,
    hasDiagnosticRelatedInformationCapability: false,
    ...overrides,
  });

  describe('onDocumentFormatting', () => {
    it('should return formatting handler function', () => {
      const config = createMockConfig();
      const handler = onDocumentFormatting(config);
      assert.strictEqual(typeof handler, 'function');
    });

    it('should format multi-line template invocations with proper indentation', async () => {
      const content = `
<template name="test">
  {{> childTemplate param1=value1 param2=value2 param3=value3}}
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
      const handler = onDocumentFormatting(config);

      const params = {
        textDocument: { uri: 'file:///test.html' },
        options: {
          tabSize: 2,
          insertSpaces: true,
        } as FormattingOptions,
      };

      const edits = await handler(params);

      // Should return edits for formatting
      assert.ok(Array.isArray(edits));
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
      const handler = onDocumentFormatting(config);

      const params = {
        textDocument: { uri: 'file:///test.ts' },
        options: {
          tabSize: 2,
          insertSpaces: true,
        } as FormattingOptions,
      };

      const edits = await handler(params);
      assert.strictEqual(edits.length, 0);
    });

    it('should return empty array for HTML without Meteor templates', async () => {
      const content = `<div>Regular HTML content</div>`;
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
      const handler = onDocumentFormatting(config);

      const params = {
        textDocument: { uri: 'file:///test.html' },
        options: {
          tabSize: 2,
          insertSpaces: true,
        } as FormattingOptions,
      };

      const edits = await handler(params);
      assert.strictEqual(edits.length, 0);
    });

    it('should preserve single-line template invocations', async () => {
      const content = `
<template name="test">
  {{> simpleTemplate param=value}}
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
      const handler = onDocumentFormatting(config);

      const params = {
        textDocument: { uri: 'file:///test.html' },
        options: {
          tabSize: 2,
          insertSpaces: true,
        } as FormattingOptions,
      };

      const edits = await handler(params);

      // Should normalize to add spaces around {{ and }}
      assert.strictEqual(edits.length, 1);
      assert.strictEqual(edits[0].newText, '{{> simpleTemplate param=value }}');
    });

    it('should respect tab size settings', async () => {
      const content = `
<template name="test">
  {{> childTemplate
param1=value1
param2=value2
  }}
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
      const handler = onDocumentFormatting(config);

      const params = {
        textDocument: { uri: 'file:///test.html' },
        options: {
          tabSize: 4,
          insertSpaces: true,
        } as FormattingOptions,
      };

      const edits = await handler(params);
      assert.ok(Array.isArray(edits));
    });
  });

  describe('onDocumentRangeFormatting', () => {
    it('should return range formatting handler function', () => {
      const config = createMockConfig();
      const handler = onDocumentRangeFormatting(config);
      assert.strictEqual(typeof handler, 'function');
    });

    it('should format only invocations within specified range', async () => {
      const content = `
<template name="test">
  {{> template1 p1=v1 p2=v2}}
  {{> template2 p1=v1 p2=v2}}
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
      const handler = onDocumentRangeFormatting(config);

      const params = {
        textDocument: { uri: 'file:///test.html' },
        range: {
          start: { line: 0, character: 0 },
          end: { line: 2, character: 0 },
        },
        options: {
          tabSize: 2,
          insertSpaces: true,
        } as FormattingOptions,
      };

      const edits = await handler(params);
      assert.ok(Array.isArray(edits));
    });
  });

  describe('onDocumentOnTypeFormatting', () => {
    it('should return on-type formatting handler function', () => {
      const config = createMockConfig();
      const handler = onDocumentOnTypeFormatting(config);
      assert.strictEqual(typeof handler, 'function');
    });

    it('should handle Enter key inside template invocations', async () => {
      const content = `
<template name="test">
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
      const handler = onDocumentOnTypeFormatting(config);

      const params = {
        textDocument: { uri: 'file:///test.html' },
        position: { line: 2, character: 20 },
        ch: '\n',
        options: {
          tabSize: 2,
          insertSpaces: true,
        } as FormattingOptions,
      };

      const edits = await handler(params);
      assert.ok(Array.isArray(edits));
    });

    it('should return empty array when not inside template invocation', async () => {
      const content = `
<template name="test">
  <div>
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
      const handler = onDocumentOnTypeFormatting(config);

      const params = {
        textDocument: { uri: 'file:///test.html' },
        position: { line: 2, character: 7 },
        ch: '\n',
        options: {
          tabSize: 2,
          insertSpaces: true,
        } as FormattingOptions,
      };

      const edits = await handler(params);
      assert.strictEqual(edits.length, 0);
    });
  });

  describe('Formatting Edge Cases', () => {
    it('should handle nested template invocations', async () => {
      const content = `
<template name="test">
  {{> outer
    param1=(> inner innerP=val)
  }}
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
      const handler = onDocumentFormatting(config);

      const params = {
        textDocument: { uri: 'file:///test.html' },
        options: {
          tabSize: 2,
          insertSpaces: true,
        } as FormattingOptions,
      };

      const edits = await handler(params);
      assert.ok(Array.isArray(edits));
    });

    it('should handle template invocations with complex parameter values', async () => {
      const content = `
<template name="test">
  {{> template
    str="text value"
    helper=(getHelper)
    expr=(add 1 2)
  }}
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
      const handler = onDocumentFormatting(config);

      const params = {
        textDocument: { uri: 'file:///test.html' },
        options: {
          tabSize: 2,
          insertSpaces: true,
        } as FormattingOptions,
      };

      const edits = await handler(params);
      assert.ok(Array.isArray(edits));
    });

    it('should return empty array for documents without templates', async () => {
      const content = `<div>No templates</div>`;
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
      const handler = onDocumentFormatting(config);

      const params = {
        textDocument: { uri: 'file:///test.html' },
        options: {
          tabSize: 2,
          insertSpaces: true,
        } as FormattingOptions,
      };

      const edits = await handler(params);
      assert.strictEqual(edits.length, 0);
    });

    it('should format template with 0 parameters to single line', async () => {
      const content = `
<template name="test">
  {{> myTemplate

    }}
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
      const handler = onDocumentFormatting(config);

      const params = {
        textDocument: { uri: 'file:///test.html' },
        options: {
          tabSize: 2,
          insertSpaces: true,
        } as FormattingOptions,
      };

      const edits = await handler(params);
      assert.strictEqual(edits.length, 1);
      assert.strictEqual(edits[0].newText, '{{> myTemplate }}');
    });

    it('should format template with 1 parameter to single line', async () => {
      const content = `
<template name="test">
  {{> myTemplate
 param1="Something"

    }}
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
      const handler = onDocumentFormatting(config);

      const params = {
        textDocument: { uri: 'file:///test.html' },
        options: {
          tabSize: 2,
          insertSpaces: true,
        } as FormattingOptions,
      };

      const edits = await handler(params);
      assert.strictEqual(edits.length, 1);
      assert.strictEqual(
        edits[0].newText,
        '{{> myTemplate param1="Something" }}'
      );
    });

    it('should format template with 2+ parameters to multi-line', async () => {
      const content = `
<template name="test">
<div>
{{> myTemplate
 param1="Something"
   param2="Another Thing"
         param3="Third Thing"
         }}
</div>
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
      const handler = onDocumentFormatting(config);

      const params = {
        textDocument: { uri: 'file:///test.html' },
        options: {
          tabSize: 2,
          insertSpaces: true,
        } as FormattingOptions,
      };

      const edits = await handler(params);
      assert.strictEqual(edits.length, 1);

      const expectedFormatted = `{{> myTemplate
  param1="Something"
  param2="Another Thing"
  param3="Third Thing"
}}`;
      assert.strictEqual(edits[0].newText, expectedFormatted);
    });

    it('should handle parameters with spaces in quoted values', async () => {
      const content = `
<template name="test">
  {{> template
    title="This is a title with spaces"
      description="Another value with spaces"
    }}
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
      const handler = onDocumentFormatting(config);

      const params = {
        textDocument: { uri: 'file:///test.html' },
        options: {
          tabSize: 2,
          insertSpaces: true,
        } as FormattingOptions,
      };

      const edits = await handler(params);
      assert.strictEqual(edits.length, 1);

      const expectedFormatted = `{{> template
    title="This is a title with spaces"
    description="Another value with spaces"
  }}`;
      assert.strictEqual(edits[0].newText, expectedFormatted);
    });

    it('should handle mixed single and double quotes', async () => {
      const content = `
<template name="test">
  {{> template
    param1='single quotes'
    param2="double quotes"
    }}
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
      const handler = onDocumentFormatting(config);

      const params = {
        textDocument: { uri: 'file:///test.html' },
        options: {
          tabSize: 2,
          insertSpaces: true,
        } as FormattingOptions,
      };

      const edits = await handler(params);
      assert.strictEqual(edits.length, 1);

      const expectedFormatted = `{{> template
    param1='single quotes'
    param2="double quotes"
  }}`;
      assert.strictEqual(edits[0].newText, expectedFormatted);
    });

    it('should handle unquoted parameter values', async () => {
      const content = `
<template name="test">
  {{> template
    param1=value1
    param2=value2
    }}
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
      const handler = onDocumentFormatting(config);

      const params = {
        textDocument: { uri: 'file:///test.html' },
        options: {
          tabSize: 2,
          insertSpaces: true,
        } as FormattingOptions,
      };

      const edits = await handler(params);
      assert.strictEqual(edits.length, 1);

      const expectedFormatted = `{{> template
    param1=value1
    param2=value2
  }}`;
      assert.strictEqual(edits[0].newText, expectedFormatted);
    });

    it('should not modify already correctly formatted single-line template', async () => {
      const content = `
<template name="test">
  {{> template }}
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
      const handler = onDocumentFormatting(config);

      const params = {
        textDocument: { uri: 'file:///test.html' },
        options: {
          tabSize: 2,
          insertSpaces: true,
        } as FormattingOptions,
      };

      const edits = await handler(params);
      assert.strictEqual(edits.length, 0);
    });

    it('should not modify already correctly formatted multi-line template', async () => {
      const content = `
<template name="test">
<div>
  {{> template
    param1="Value1"
    param2="Value2"
  }}
</div>
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
      const handler = onDocumentFormatting(config);

      const params = {
        textDocument: { uri: 'file:///test.html' },
        options: {
          tabSize: 2,
          insertSpaces: true,
        } as FormattingOptions,
      };

      const edits = await handler(params);
      assert.strictEqual(edits.length, 0);
    });

    it('should handle parameters with nested helper expressions containing spaces', async () => {
      const content = `
<template name="test">
  {{> alumniListCard
    alum=alum
    addToAlumni=addToAlumni
    gradProgram=(getFinalProgram alum.alumni.graduation.programId)
  }}
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
      const handler = onDocumentFormatting(config);

      const params = {
        textDocument: { uri: 'file:///test.html' },
        options: {
          tabSize: 2,
          insertSpaces: true,
        } as FormattingOptions,
      };

      const edits = await handler(params);

      // Should not truncate the parameter value
      if (edits.length > 0) {
        const formatted = edits[0].newText;
        assert.ok(
          formatted.includes(
            'gradProgram=(getFinalProgram alum.alumni.graduation.programId)'
          ),
          'Should preserve full parameter value with nested helper expression'
        );
      }
    });

    it('should format badly indented template with nested helper expressions', async () => {
      const content = `
<template name="test">
     {{ > alumniListCard
                alum=alum
                    addToAlumni=addToAlumni
                 gradProgram=(getFinalProgram alum.alumni.graduation.programId)
                   }}
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
      const handler = onDocumentFormatting(config);

      const params = {
        textDocument: { uri: 'file:///test.html' },
        options: {
          tabSize: 2,
          insertSpaces: true,
        } as FormattingOptions,
      };

      const edits = await handler(params);

      assert.strictEqual(edits.length, 1);

      const expectedFormatted = `{{> alumniListCard
       alum=alum
       addToAlumni=addToAlumni
       gradProgram=(getFinalProgram alum.alumni.graduation.programId)
     }}`;

      assert.strictEqual(edits[0].newText, expectedFormatted);
    });
  });
});
