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
import Logger from '../../../utils/logger.js';

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

    it('should separate closing block condition from opening block condition on same line', async () => {
      const content = `
<template name="test">
  {{#if isActive}}
  <p>Active</p>
  {{/if}} {{#each image in images}}
  <img src="{{image.url}}" />
  {{/each}} {{#with address}}
  <p>{{street}}</p>
  {{/with}}
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

      // Should have edits for separating block conditions
      assert.ok(edits.length > 0);

      // Apply edits to see result
      let result = content;
      if (
        edits.length === 1 &&
        edits[0].range.start.line === 0 &&
        edits[0].range.start.character === 0
      ) {
        // Full document replacement
        result = edits[0].newText;
      } else {
        // Multiple edits
        for (const edit of edits.sort(
          (a, b) => b.range.start.line - a.range.start.line
        )) {
          const lines = result.split('\n');
          const startLine = edit.range.start.line;
          const startChar = edit.range.start.character;
          const endLine = edit.range.end.line;
          const endChar = edit.range.end.character;

          if (startLine === endLine) {
            const line = lines[startLine];
            lines[startLine] =
              line.substring(0, startChar) +
              edit.newText +
              line.substring(endChar);
          }
          result = lines.join('\n');
        }
      }

      // Verify that closing and opening tags are on separate lines
      assert.ok(!result.includes('{{/if}} {{#each'));
      assert.ok(!result.includes('{{/each}} {{#with'));
    });

    it('should not separate block conditions within HTML attribute strings', async () => {
      const content = `
<template name="test">
  <div class="{{#if address}}addtrss.id{{/if}}{{#if address.googleId}}address.googleId{{/if}}"></div>
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

      // Should not modify content within attribute strings
      // Apply edits to verify
      let result = content;
      if (
        edits.length === 1 &&
        edits[0].range.start.line === 0 &&
        edits[0].range.start.character === 0
      ) {
        // Full document replacement
        result = edits[0].newText;
      } else if (edits.length > 0) {
        for (const edit of edits) {
          const lines = result.split('\n');
          const startLine = edit.range.start.line;
          const startChar = edit.range.start.character;
          const endLine = edit.range.end.line;
          const endChar = edit.range.end.character;

          if (startLine === endLine) {
            const line = lines[startLine];
            lines[startLine] =
              line.substring(0, startChar) +
              edit.newText +
              line.substring(endChar);
          }
          result = lines.join('\n');
        }
      }

      // The attribute should remain unchanged
      assert.ok(
        result.includes(
          'class="{{#if address}}addtrss.id{{/if}}{{#if address.googleId}}address.googleId{{/if}}"'
        )
      );
    });

    it('should handle multiple block conditions on the same line', async () => {
      const content = `
<template name="test">
  {{#if condition1}}<p>Test1</p>{{/if}} {{#if condition2}}<p>Test2</p>{{/if}} {{#each items}}<span>{{this}}</span>{{/each}}
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

      assert.ok(edits.length > 0);

      // Apply edits
      let result = content;
      if (
        edits.length === 1 &&
        edits[0].range.start.line === 0 &&
        edits[0].range.start.character === 0
      ) {
        // Full document replacement
        result = edits[0].newText;
      } else {
        for (const edit of edits.sort(
          (a, b) => b.range.start.line - a.range.start.line
        )) {
          const lines = result.split('\n');
          const startLine = edit.range.start.line;
          const startChar = edit.range.start.character;
          const endLine = edit.range.end.line;
          const endChar = edit.range.end.character;

          if (startLine === endLine) {
            const line = lines[startLine];
            lines[startLine] =
              line.substring(0, startChar) +
              edit.newText +
              line.substring(endChar);
          }
          result = lines.join('\n');
        }
      }

      // Should separate all block conditions
      assert.ok(!result.includes('{{/if}} {{#if'));
      assert.ok(!result.includes('{{/if}} {{#each'));
    });

    it('should separate content from closing block conditions on same line', async () => {
      const content = `
<template name="test">
  {{#each image in images}}
    <img src="{{image.url}}" />
    {{firstName}} - {{image.name}} {{/each}} {{#each thing}}
    <div>{{thing.title}}</div>
  {{/each}}
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

      assert.ok(edits.length > 0);

      // Apply edits
      let result = content;
      if (
        edits.length === 1 &&
        edits[0].range.start.line === 0 &&
        edits[0].range.start.character === 0
      ) {
        // Full document replacement
        result = edits[0].newText;
      } else {
        for (const edit of edits.sort(
          (a, b) => b.range.start.line - a.range.start.line
        )) {
          const lines = result.split('\n');
          const startLine = edit.range.start.line;
          const startChar = edit.range.start.character;
          const endLine = edit.range.end.line;
          const endChar = edit.range.end.character;

          if (startLine === endLine) {
            const line = lines[startLine];
            lines[startLine] =
              line.substring(0, startChar) +
              edit.newText +
              line.substring(endChar);
          }
          result = lines.join('\n');
        }
      }

      // Verify that content and closing tags are on separate lines
      assert.ok(!result.includes('{{image.name}} {{/each}}'));
      // Also verify closing and opening are separated
      assert.ok(!result.includes('{{/each}} {{#each'));
    });

    it('should not separate single-line block conditions', async () => {
      const content = `
<template name="test">
  {{#if isActive}}<p>Active</p>{{/if}}
  {{#each items}}{{this}}{{/each}}
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

      // Apply edits
      let result = content;
      if (edits.length > 0) {
        if (
          edits.length === 1 &&
          edits[0].range.start.line === 0 &&
          edits[0].range.start.character === 0
        ) {
          // Full document replacement
          result = edits[0].newText;
        } else {
          for (const edit of edits.sort(
            (a, b) => b.range.start.line - a.range.start.line
          )) {
            const lines = result.split('\n');
            const startLine = edit.range.start.line;
            const startChar = edit.range.start.character;
            const endLine = edit.range.end.line;
            const endChar = edit.range.end.character;

            if (startLine === endLine) {
              const line = lines[startLine];
              lines[startLine] =
                line.substring(0, startChar) +
                edit.newText +
                line.substring(endChar);
            }
            result = lines.join('\n');
          }
        }
      }

      // Should still contain single-line blocks (opening and closing on same line is okay)
      // We only separate when there's other content OR when closing is followed by opening
      assert.ok(result.includes('{{#if isActive}}<p>Active</p>{{/if}}'));
      assert.ok(result.includes('{{#each items}}{{this}}{{/each}}'));
    });

    it('should handle complex multi-pattern cases in one formatting action', async () => {
      const content = `
<template name="test">
  {{#each image in images}}
    <img src="{{image.url}}" alt="{{image.altText}}" />
    {{firstName}} - {{image.name}} {{/each}} {{#each thing}}
    <div class="thing-item">
      <h3>{{thing.title}}</h3>
      <p>{{thing.description}}</p>
    </div>
  {{/each}} {{#with address}}
    <div class="address">
      {{firstName}}
      <p>{{street}}, {{city}}, {{state}} {{zip}}</p>
    </div>
  {{/with}}
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

      assert.ok(edits.length > 0);

      // Apply edits
      let result = content;
      if (
        edits.length === 1 &&
        edits[0].range.start.line === 0 &&
        edits[0].range.start.character === 0
      ) {
        // Full document replacement
        result = edits[0].newText;
      } else {
        for (const edit of edits.sort(
          (a, b) => b.range.start.line - a.range.start.line
        )) {
          const lines = result.split('\n');
          const startLine = edit.range.start.line;
          const startChar = edit.range.start.character;
          const endLine = edit.range.end.line;
          const endChar = edit.range.end.character;

          if (startLine === endLine) {
            const line = lines[startLine];
            lines[startLine] =
              line.substring(0, startChar) +
              edit.newText +
              line.substring(endChar);
          }
          result = lines.join('\n');
        }
      }

      // Verify all patterns are fixed in one go:
      // 1. Content should be separated from closing tags
      assert.ok(!result.includes('{{image.name}} {{/each}}'));

      // 2. Closing tags should be separated from opening tags
      assert.ok(!result.includes('{{/each}} {{#each'));
      assert.ok(!result.includes('{{/each}} {{#with'));

      // 3. All closing tags should be on their own lines (with proper indentation)
      const lines = result.split('\n');
      const eachClosingLines = lines.filter(
        (line) => line.trim() === '{{/each}}'
      );
      assert.ok(
        eachClosingLines.length >= 2,
        'Should have separate lines for {{/each}}'
      );

      const withClosingLines = lines.filter(
        (line) => line.trim() === '{{/with}}'
      );
      assert.ok(
        withClosingLines.length >= 1,
        'Should have separate line for {{/with}}'
      );
    });
  });
});
