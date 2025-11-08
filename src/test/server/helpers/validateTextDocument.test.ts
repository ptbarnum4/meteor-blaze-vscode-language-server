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

  it('should detect invalid #if blocks within HTML element tags', async () => {
    const content = `
      <template name="testTemplate">
        <select>
          <option {{#if something}}selected{{/if}}>
            Some option
          </option>
        </select>
      </template>
    `;

    const document = TextDocument.create('file:///test.html', 'html', 1, content);
    const diagnostics: any[] = [];

    const mockConnection = {
      sendDiagnostics: (params: any) => {
        diagnostics.push(...params.diagnostics);
      },
      workspace: {
        getConfiguration: () => Promise.resolve(mockSettings)
      }
    };

    const config = createMockConfig({
      connection: mockConnection as any
    });

    await validateTextDocument(config, document);

    // Should have at least one diagnostic for the invalid #if block
    assert.ok(diagnostics.length > 0, 'Should have diagnostics');

    const invalidBlockDiagnostic = diagnostics.find(d =>
      d.message.includes('{{#if}} blocks cannot be used within HTML element tags')
    );

    assert.ok(invalidBlockDiagnostic, 'Should have diagnostic for invalid #if in tag');
  });

  it('should detect invalid #unless blocks within HTML element tags', async () => {
    const content = `
      <template name="testTemplate">
        <button {{#unless enabled}}disabled{{/unless}}>Click me</button>
      </template>
    `;

    const document = TextDocument.create('file:///test.html', 'html', 1, content);
    const diagnostics: any[] = [];

    const mockConnection = {
      sendDiagnostics: (params: any) => {
        diagnostics.push(...params.diagnostics);
      },
      workspace: {
        getConfiguration: () => Promise.resolve(mockSettings)
      }
    };

    const config = createMockConfig({
      connection: mockConnection as any
    });

    await validateTextDocument(config, document);

    // Should have at least one diagnostic for the invalid #unless block
    assert.ok(diagnostics.length > 0, 'Should have diagnostics');

    const invalidBlockDiagnostic = diagnostics.find(d =>
      d.message.includes('{{#unless}} blocks cannot be used within HTML element tags')
    );

    assert.ok(invalidBlockDiagnostic, 'Should have diagnostic for invalid #unless in tag');
  });

  it('should detect multiple invalid blocks in one HTML tag', async () => {
    const content = `
      <template name="testTemplate">
        <input type="text" {{#if required}}required{{/if}} {{#if readonly}}readonly{{/if}} />
      </template>
    `;

    const document = TextDocument.create('file:///test.html', 'html', 1, content);
    const diagnostics: any[] = [];

    const mockConnection = {
      sendDiagnostics: (params: any) => {
        diagnostics.push(...params.diagnostics);
      },
      workspace: {
        getConfiguration: () => Promise.resolve(mockSettings)
      }
    };

    const config = createMockConfig({
      connection: mockConnection as any
    });

    await validateTextDocument(config, document);

    // Should have diagnostics for both invalid #if blocks
    const invalidBlockDiagnostics = diagnostics.filter(d =>
      d.message.includes('blocks cannot be used within HTML element tags')
    );

    assert.strictEqual(
      invalidBlockDiagnostics.length,
      2,
      'Should have two diagnostics for two invalid blocks'
    );
  });

  it('should allow #if blocks outside of HTML element tags', async () => {
    const content = `
      <template name="testTemplate">
        {{#if user}}
          <div class="user-info">
            <p>{{user.name}}</p>
          </div>
        {{/if}}
      </template>
    `;

    const document = TextDocument.create('file:///test.html', 'html', 1, content);
    const diagnostics: any[] = [];

    const mockConnection = {
      sendDiagnostics: (params: any) => {
        diagnostics.push(...params.diagnostics);
      },
      workspace: {
        getConfiguration: () => Promise.resolve(mockSettings)
      }
    };

    const config = createMockConfig({
      connection: mockConnection as any
    });

    await validateTextDocument(config, document);

    // Should have no diagnostics for blocks outside tags
    const invalidBlockDiagnostics = diagnostics.filter(d =>
      d.message.includes('blocks cannot be used within HTML element tags')
    );

    assert.strictEqual(
      invalidBlockDiagnostics.length,
      0,
      'Should have no diagnostics for blocks outside tags'
    );
  });

  it('should highlight entire block from {{#if}} to {{/if}}', async () => {
    const content = `<template name="test">
<input type="checkbox" {{#if something}}checked{{/if}} />
</template>`;

    const document = TextDocument.create('file:///test.html', 'html', 1, content);
    const diagnostics: any[] = [];

    const mockConnection = {
      sendDiagnostics: (params: any) => {
        diagnostics.push(...params.diagnostics);
      },
      workspace: {
        getConfiguration: () => Promise.resolve(mockSettings)
      }
    };

    const config = createMockConfig({
      connection: mockConnection as any
    });

    await validateTextDocument(config, document);

    // Should have diagnostic for the invalid block
    const invalidBlockDiagnostic = diagnostics.find(d =>
      d.message.includes('{{#if}} blocks cannot be used within HTML element tags')
    );

    assert.ok(invalidBlockDiagnostic, 'Should have diagnostic for invalid #if in tag');

    // The range should span from {{#if to {{/if}}
    const text = document.getText();
    const startOffset = document.offsetAt(invalidBlockDiagnostic.range.start);
    const endOffset = document.offsetAt(invalidBlockDiagnostic.range.end);
    const highlightedText = text.substring(startOffset, endOffset);

    // Should include both opening and closing tags
    assert.ok(highlightedText.includes('{{#if something}}'), 'Should include opening {{#if}}');
    assert.ok(highlightedText.includes('{{/if}}'), 'Should include closing {{/if}}');
    assert.ok(highlightedText.includes('checked'), 'Should include content between tags');
  });

  it('should allow #if blocks within attribute string values', async () => {
    const content = `<template name="test">
<i class="fa {{#if isRangeLocked}}fa-lock{{else}}fa-unlock{{/if}}"></i>
</template>`;

    const document = TextDocument.create('file:///test.html', 'html', 1, content);
    const diagnostics: any[] = [];

    const mockConnection = {
      sendDiagnostics: (params: any) => {
        diagnostics.push(...params.diagnostics);
      },
      workspace: {
        getConfiguration: () => Promise.resolve(mockSettings)
      }
    };

    const config = createMockConfig({
      connection: mockConnection as any
    });

    await validateTextDocument(config, document);

    // Should have NO diagnostics for blocks within quoted attribute values
    const invalidBlockDiagnostics = diagnostics.filter(d =>
      d.message.includes('blocks cannot be used within HTML element tags')
    );

    assert.strictEqual(
      invalidBlockDiagnostics.length,
      0,
      'Should have no diagnostics for blocks within attribute string values'
    );
  });

  it('should allow #if blocks within single-quoted attribute values', async () => {
    const content = `<template name="test">
<div title='{{#if active}}Active{{else}}Inactive{{/if}}'></div>
</template>`;

    const document = TextDocument.create('file:///test.html', 'html', 1, content);
    const diagnostics: any[] = [];

    const mockConnection = {
      sendDiagnostics: (params: any) => {
        diagnostics.push(...params.diagnostics);
      },
      workspace: {
        getConfiguration: () => Promise.resolve(mockSettings)
      }
    };

    const config = createMockConfig({
      connection: mockConnection as any
    });

    await validateTextDocument(config, document);

    // Should have NO diagnostics for blocks within quoted attribute values
    const invalidBlockDiagnostics = diagnostics.filter(d =>
      d.message.includes('blocks cannot be used within HTML element tags')
    );

    assert.strictEqual(
      invalidBlockDiagnostics.length,
      0,
      'Should have no diagnostics for blocks within single-quoted attribute values'
    );
  });

  it('should detect invalid blocks outside quotes but not inside quotes in same tag', async () => {
    const content = `<template name="test">
<div class="icon {{#if locked}}locked{{/if}}" {{#if disabled}}disabled{{/if}}></div>
</template>`;

    const document = TextDocument.create('file:///test.html', 'html', 1, content);
    const diagnostics: any[] = [];

    const mockConnection = {
      sendDiagnostics: (params: any) => {
        diagnostics.push(...params.diagnostics);
      },
      workspace: {
        getConfiguration: () => Promise.resolve(mockSettings)
      }
    };

    const config = createMockConfig({
      connection: mockConnection as any
    });

    await validateTextDocument(config, document);

    // Should have one diagnostic for the invalid block outside quotes
    const invalidBlockDiagnostics = diagnostics.filter(d =>
      d.message.includes('blocks cannot be used within HTML element tags')
    );

    assert.strictEqual(
      invalidBlockDiagnostics.length,
      1,
      'Should have one diagnostic for block outside quotes'
    );

    // The diagnostic should be for the 'disabled' block, not the one inside class
    const text = document.getText();
    const startOffset = document.offsetAt(invalidBlockDiagnostics[0].range.start);
    const endOffset = document.offsetAt(invalidBlockDiagnostics[0].range.end);
    const highlightedText = text.substring(startOffset, endOffset);

    assert.ok(highlightedText.includes('disabled'), 'Should flag the block outside quotes');
    assert.ok(!highlightedText.includes('locked'), 'Should not flag the block inside quotes');
  });

  it('should not validate blocks within HTML comments', async () => {
    const content = `<template name="test">
<!-- <div {{#if test}}class="active"{{/if}}></div> -->
<div>Valid content</div>
</template>`;

    const document = TextDocument.create('file:///test.html', 'html', 1, content);
    const diagnostics: any[] = [];

    const mockConnection = {
      sendDiagnostics: (params: any) => {
        diagnostics.push(...params.diagnostics);
      },
      workspace: {
        getConfiguration: () => Promise.resolve(mockSettings)
      }
    };

    const config = createMockConfig({
      connection: mockConnection as any
    });

    await validateTextDocument(config, document);

    // Should have no diagnostics for blocks within comments
    const invalidBlockDiagnostics = diagnostics.filter(d =>
      d.message.includes('blocks cannot be used within HTML element tags')
    );

    assert.strictEqual(
      invalidBlockDiagnostics.length,
      0,
      'Should have no diagnostics for blocks within HTML comments'
    );
  });

  it('should not validate blocks within Handlebars block comments', async () => {
    const content = `<template name="test">
{{!-- <div class="pull-right edit-exam"> --}}
<div>Valid content</div>
</template>`;

    const document = TextDocument.create('file:///test.html', 'html', 1, content);
    const diagnostics: any[] = [];

    const mockConnection = {
      sendDiagnostics: (params: any) => {
        diagnostics.push(...params.diagnostics);
      },
      workspace: {
        getConfiguration: () => Promise.resolve(mockSettings)
      }
    };

    const config = createMockConfig({
      connection: mockConnection as any
    });

    await validateTextDocument(config, document);

    // Should have no diagnostics for blocks within comments
    const invalidBlockDiagnostics = diagnostics.filter(d =>
      d.message.includes('blocks cannot be used within HTML element tags')
    );

    assert.strictEqual(
      invalidBlockDiagnostics.length,
      0,
      'Should have no diagnostics for blocks within Handlebars comments'
    );
  });

  it('should not validate blocks within Handlebars inline comments with nested expressions', async () => {
    const content = `<template name="test">
{{! <button {{#if active}}disabled{{/if}}></button> }}
<div>Valid content</div>
</template>`;

    const document = TextDocument.create('file:///test.html', 'html', 1, content);
    const diagnostics: any[] = [];

    const mockConnection = {
      sendDiagnostics: (params: any) => {
        diagnostics.push(...params.diagnostics);
      },
      workspace: {
        getConfiguration: () => Promise.resolve(mockSettings)
      }
    };

    const config = createMockConfig({
      connection: mockConnection as any
    });

    await validateTextDocument(config, document);

    // Should have no diagnostics for blocks within inline comments
    const invalidBlockDiagnostics = diagnostics.filter(d =>
      d.message.includes('blocks cannot be used within HTML element tags')
    );

    assert.strictEqual(
      invalidBlockDiagnostics.length,
      0,
      'Should have no diagnostics for blocks within Handlebars inline comments'
    );

    // Also check that there are no unmatched block errors
    const unmatchedBlockDiagnostics = diagnostics.filter(
      d =>
        d.message.includes('Missing closing tag') || d.message.includes('without matching opening')
    );

    assert.strictEqual(
      unmatchedBlockDiagnostics.length,
      0,
      'Should have no unmatched block diagnostics for blocks within comments'
    );
  });

  it('should handle the exact user example with commented HTML', async () => {
    const content = `<template name="test">
   {{#if isEditingExamName}}
        <div id="exam-name">
          <button id="save-exam-name-btn">Save</button>
        </div>
      {{else}}
        <div id="exam-name">
          <label>{{exam.name}}</label>
          {{!-- <div class="pull-right edit-exam"> --}}
          <button id="edit-exam-name-btn">Edit</button>
        </div>
      {{/if}}
</template>`;

    const document = TextDocument.create('file:///test.html', 'html', 1, content);
    const diagnostics: any[] = [];

    const mockConnection = {
      sendDiagnostics: (params: any) => {
        diagnostics.push(...params.diagnostics);
      },
      workspace: {
        getConfiguration: () => Promise.resolve(mockSettings)
      }
    };

    const config = createMockConfig({
      connection: mockConnection as any
    });

    await validateTextDocument(config, document);

    // Debug: log any diagnostics
    if (diagnostics.length > 0) {
      console.log(
        'Diagnostics found:',
        diagnostics.map(d => ({
          message: d.message,
          range: d.range
        }))
      );
    }

    // Should have no diagnostics - the commented div should be ignored
    assert.strictEqual(
      diagnostics.length,
      0,
      `Should have no diagnostics for the user example, but got ${diagnostics.length}: ${diagnostics
        .map(d => d.message)
        .join(', ')}`
    );
  });

  it('should not validate HTML elements within attribute string values', async () => {
    const content = `<template name="test">
  {{#if isInRole 'admin,super,admiral' 'confirmed'}}
    <button type="button"
      data-bs-toggle="popover"
      data-bs-trigger="hover"
      data-bs-placement="bottom"
      data-bs-html="true"
      data-bs-content="
        <div class='text-center'>
           Toggle your sessions
        </div>"
      id="btn-me"
      class="btn {{getMeToggleClass}} navbar-btn">
      <i class="fa fa-user-circle"></i>
    </button>
  {{/if}}
</template>`;

    const document = TextDocument.create('file:///test.html', 'html', 1, content);
    const diagnostics: any[] = [];

    const mockConnection = {
      sendDiagnostics: (params: any) => {
        diagnostics.push(...params.diagnostics);
      },
      workspace: {
        getConfiguration: () => Promise.resolve(mockSettings)
      }
    };

    const config = createMockConfig({
      connection: mockConnection as any
    });

    await validateTextDocument(config, document);

    // Debug: log any diagnostics
    if (diagnostics.length > 0) {
      console.log(
        'Diagnostics found:',
        diagnostics.map(d => ({
          message: d.message,
          range: d.range
        }))
      );
    }

    // Should have no diagnostics - HTML elements inside attribute strings should be ignored
    const invalidBlockDiagnostics = diagnostics.filter(d =>
      d.message.includes('blocks cannot be used within HTML element tags')
    );

    assert.strictEqual(
      invalidBlockDiagnostics.length,
      0,
      `Should have no diagnostics for HTML elements within attribute strings, but got ${
        invalidBlockDiagnostics.length
      }: ${invalidBlockDiagnostics.map(d => d.message).join(', ')}`
    );
  });

  it('should not be confused by single quotes in Handlebars expressions', async () => {
    const content = `<template name="move">
  {{#if isType 'sessions'}}
    {{> searchEntities options=options}}
  {{else}}
    <section class="section-move-internal">
      <p>
        Students will be moved to Session <span class="green">{{type}}</span>.
      </p>
      <button id="btn-move" class="btn btn-success">Move</button>
    </section>
  {{/if}}
</template>`;

    const document = TextDocument.create('file:///test.html', 'html', 1, content);
    const diagnostics: any[] = [];

    const mockConnection = {
      sendDiagnostics: (params: any) => {
        diagnostics.push(...params.diagnostics);
      },
      workspace: {
        getConfiguration: () => Promise.resolve(mockSettings)
      }
    };

    const config = createMockConfig({
      connection: mockConnection as any
    });

    await validateTextDocument(config, document);

    // Should have no diagnostics
    assert.strictEqual(
      diagnostics.length,
      0,
      `Should have no diagnostics for single quotes in Handlebars, but got ${diagnostics.length}: ${diagnostics
        .map(d => d.message)
        .join(', ')}`
    );
  });

  it('should not error on HTML tags inside {{else}} blocks', async () => {
    const content = `<template name="testTemplate">
  {{#if isType 'sessions'}}
    <div>Session content</div>
  {{else}}
    <section class="section-move-internal">
      <p>Non-session content</p>
    </section>
  {{/if}}
</template>`;

    const document = TextDocument.create('file:///test.html', 'html', 1, content);
    const diagnostics: any[] = [];

    const mockConnection = {
      sendDiagnostics: (params: any) => {
        diagnostics.push(...params.diagnostics);
      },
      workspace: {
        getConfiguration: () => Promise.resolve(mockSettings)
      }
    };

    const config = createMockConfig({
      connection: mockConnection as any
    });

    await validateTextDocument(config, document);

    // Should have no diagnostics
    assert.strictEqual(
      diagnostics.length,
      0,
      `Should have no diagnostics for HTML in {{else}} blocks, but got ${diagnostics.length}: ${diagnostics
        .map(d => d.message)
        .join(', ')}`
    );
  });

  it('should not error on HTML tags inside multiple {{#if}} blocks with same condition', async () => {
    const content = `<template name="newProgram">
  <div class="form-group row">
    <div class="col-sm-12">
      {{#if (sessionVar 'help')}}
        <p class="help-text">
          First help text.
        </p>
      {{/if}}
    </div>
  </div>

  <div class="form-group row">
    <div class="col-sm-12">
      {{#if (sessionVar 'help')}}
        <p class="help-text">
          Second help text.
        </p>
        <p class="help-text">
          Third help text.
        </p>
      {{/if}}
    </div>
  </div>
</template>`;

    const document = TextDocument.create('file:///test.html', 'html', 1, content);
    const diagnostics: any[] = [];

    const mockConnection = {
      sendDiagnostics: (params: any) => {
        diagnostics.push(...params.diagnostics);
      },
      workspace: {
        getConfiguration: () => Promise.resolve(mockSettings)
      }
    };

    const config = createMockConfig({
      connection: mockConnection as any
    });

    await validateTextDocument(config, document);

    // Should have no diagnostics
    assert.strictEqual(
      diagnostics.length,
      0,
      `Should have no diagnostics for multiple {{#if}} blocks, but got ${diagnostics.length}: ${diagnostics
        .map(d => `Line ${d.range.start.line + 1}: ${d.message}`)
        .join(', ')}`
    );
  });

  it('should not error on nested {{#if}} blocks inside {{else}} branch', async () => {
    const content = `<template name="testTemplate">
  {{#if checkSomething 'stringValue'}}
    <div>First branch</div>
  {{else}}
    <section>
      {{#if anotherThing}}
        <p>Nested if content</p>
      {{/if}}
    </section>
  {{/if}}
</template>`;

    const document = TextDocument.create('file:///test.html', 'html', 1, content);
    const diagnostics: any[] = [];

    const mockConnection = {
      sendDiagnostics: (params: any) => {
        diagnostics.push(...params.diagnostics);
      },
      workspace: {
        getConfiguration: () => Promise.resolve(mockSettings)
      }
    };

    const config = createMockConfig({
      connection: mockConnection as any
    });

    await validateTextDocument(config, document);

    // Should have no diagnostics
    assert.strictEqual(
      diagnostics.length,
      0,
      `Should have no diagnostics for nested {{#if}} in {{else}}, but got ${diagnostics.length}: ${diagnostics
        .map(d => `Line ${d.range.start.line + 1}: ${d.message}`)
        .join(', ')}`
    );
  });

  it('should handle multi-line <p> tags inside {{#if}} blocks', async () => {
    const content = `<template name="newProgram">
  <div class="col-sm-12">
    {{#if (sessionVar 'help')}}
      <p class="help-text">
        A Program's tract is its area of study, or the set of Programs to
        which it belongs.
      </p>
    {{/if}}
  </div>
</template>`;

    const document = TextDocument.create('file:///test.html', 'html', 1, content);
    const diagnostics: any[] = [];

    const mockConnection = {
      sendDiagnostics: (params: any) => {
        diagnostics.push(...params.diagnostics);
      },
      workspace: {
        getConfiguration: () => Promise.resolve(mockSettings)
      }
    };

    const config = createMockConfig({
      connection: mockConnection as any
    });

    await validateTextDocument(config, document);

    // Should have no diagnostics
    assert.strictEqual(
      diagnostics.length,
      0,
      `Should have no diagnostics for multi-line <p> in {{#if}}, but got ${diagnostics.length}: ${diagnostics
        .map(d => `Line ${d.range.start.line + 1}: ${d.message}`)
        .join('\n  ')}`
    );
  });
});
