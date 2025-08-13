import {
  CompletionItem,
  CompletionItemKind,
  createConnection,
  Diagnostic,
  DidChangeConfigurationNotification,
  Hover,
  InitializeParams,
  InitializeResult,
  MarkupKind,
  Position,
  ProposedFeatures,
  Range,
  TextDocumentPositionParams,
  TextDocuments,
  TextDocumentSyncKind
} from 'vscode-languageserver/node';

import {
  TextDocument
} from 'vscode-languageserver-textdocument';

import fs from 'fs';
import path from 'path';

// Create a connection for the server, using Node's IPC as a transport.
let connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
let documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// Store for cross-file analysis
interface TemplateInfo {
  name: string;
  helpers: string[];
  events: string[];
  file: string;
}

interface FileAnalysis {
  jsHelpers: Map<string, string[]>;
  cssClasses: Map<string, string[]>;
  templates: Map<string, TemplateInfo>;
}

let fileAnalysis: FileAnalysis = {
  jsHelpers: new Map(),
  cssClasses: new Map(),
  templates: new Map()
};

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

connection.onInitialize((params: InitializeParams) => {
  const capabilities = params.capabilities;

  hasConfigurationCapability = !!(
    capabilities.workspace && !!capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );
  hasDiagnosticRelatedInformationCapability = !!(
    capabilities.textDocument &&
    capabilities.textDocument.publishDiagnostics &&
    capabilities.textDocument.publishDiagnostics.relatedInformation
  );

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ['{', '"', "'", '.', ' ']
      },
      hoverProvider: true,
      definitionProvider: true
    }
  };

  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: {
        supported: true
      }
    };
  }
  return result;
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    connection.client.register(DidChangeConfigurationNotification.type, undefined);
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders(_event => {
      connection.console.info('Workspace folder change event received.');
    });
  }
});

interface LanguageServerSettings {
  maxNumberOfProblems: number;
}

const defaultSettings: LanguageServerSettings = { maxNumberOfProblems: 1000 };
let globalSettings: LanguageServerSettings = defaultSettings;

let documentSettings: Map<string, Thenable<LanguageServerSettings>> = new Map();

connection.onDidChangeConfiguration(change => {
  if (hasConfigurationCapability) {
    documentSettings.clear();
  } else {
    globalSettings = <LanguageServerSettings>(
      (change.settings.meteorLanguageServer || defaultSettings)
    );
  }

  documents.all().forEach(validateTextDocument);
});

function getDocumentSettings(resource: string): Thenable<LanguageServerSettings> {
  if (!hasConfigurationCapability) {
    return Promise.resolve(globalSettings);
  }
  let result = documentSettings.get(resource);
  if (!result) {
    result = connection.workspace.getConfiguration({
      scopeUri: resource,
      section: 'meteorLanguageServer'
    });
    documentSettings.set(resource, result);
  }
  return result;
}

documents.onDidClose(e => {
  documentSettings.delete(e.document.uri);
});

documents.onDidChangeContent(change => {
  validateTextDocument(change.document);
  analyzeNeighboringFiles(change.document);
});

// Check if HTML file contains Meteor templates
function containsMeteorTemplates(document: TextDocument): boolean {
  const text = document.getText();
  return /<template\s+name=["'][^"']+["'][^>]*>/.test(text);
}

// Analyze neighboring JS/TS/CSS/LESS files
function analyzeNeighboringFiles(document: TextDocument) {
  const uri = document.uri;
  const filePath = uri.replace('file://', '');
  const dir = path.dirname(filePath);
  const baseName = path.basename(filePath, path.extname(filePath));

  // Only analyze if this HTML file contains Meteor templates
  if (!containsMeteorTemplates(document)) {
    return;
  }

  // Extract template names from the HTML document
  const text = document.getText();
  const templateNames: string[] = [];
  const templateMatches = text.matchAll(/<template\s+name=["']([^"']+)["'][^>]*>/g);
  for (const match of templateMatches) {
    templateNames.push(match[1]);
  }

  try {
    // Look for neighboring files
    const files = fs.readdirSync(dir);

    files.forEach(file => {
      const fileBaseName = path.basename(file, path.extname(file));
      const ext = path.extname(file);
      const fullPath = path.join(dir, file);

      // Analyze files with same base name OR files that match template names
      const shouldAnalyze = fileBaseName === baseName ||
                           templateNames.includes(fileBaseName) ||
                           file.startsWith(baseName);

      if (shouldAnalyze) {
        if (['.js', '.ts'].includes(ext)) {
          const helpers = analyzeJavaScriptFile(fullPath);
          // Store helpers with multiple keys for better matching
          fileAnalysis.jsHelpers.set(baseName, helpers);
          fileAnalysis.jsHelpers.set(fileBaseName, helpers);
          templateNames.forEach(templateName => {
            fileAnalysis.jsHelpers.set(templateName, helpers);
          });
        } else if (['.css', '.less'].includes(ext)) {
          const classes = analyzeCSSFile(fullPath);
          // Store CSS classes with multiple keys for better matching
          fileAnalysis.cssClasses.set(baseName, classes);
          fileAnalysis.cssClasses.set(fileBaseName, classes);
          templateNames.forEach(templateName => {
            fileAnalysis.cssClasses.set(templateName, classes);
          });
        }
      }
    });
  } catch (error) {
    // Ignore file system errors
    console.error('Error analyzing neighboring files:', error);
  }
}

function analyzeJavaScriptFile(filePath: string): string[] {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const helpers: string[] = [];

    // Pattern for Template.name.helpers() - both JS and TS
    const helperPattern = /Template\.(\w+)\.helpers\s*\(\s*\{([^}]+)\}/g;
    let match;

    while ((match = helperPattern.exec(content)) !== null) {
      const helpersContent = match[2];
      // Extract helper function names (both function() and arrow function syntax)
      const helperNamePattern = /(\w+)\s*[:=]\s*(?:function\s*\(|[\(\w\s,]*\)\s*=>|\([^)]*\)\s*\{)/g;
      let helperMatch;

      while ((helperMatch = helperNamePattern.exec(helpersContent)) !== null) {
        helpers.push(helperMatch[1]);
      }
    }

    // Also look for TypeScript typed template helpers
    const typedHelperPattern = /Template\.(\w+)\.helpers\s*\(\s*\{([^}]+)\}/g;
    while ((match = typedHelperPattern.exec(content)) !== null) {
      const helpersContent = match[2];
      // Extract method names from TypeScript object methods
      const methodPattern = /(\w+)\s*\([^)]*\)\s*\{/g;
      let methodMatch;

      while ((methodMatch = methodPattern.exec(helpersContent)) !== null) {
        if (!helpers.includes(methodMatch[1])) {
          helpers.push(methodMatch[1]);
        }
      }
    }

    return helpers;
  } catch (error) {
    console.error(`Error analyzing JavaScript/TypeScript file ${filePath}:`, error);
    return [];
  }
}

function analyzeCSSFile(filePath: string): string[] {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const classes: string[] = [];

    // Extract CSS classes (.class-name {)
    const classMatches = content.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)\s*\{/g);
    for (const match of classMatches) {
      classes.push(match[1]);
    }

    // Extract LESS/SCSS nested classes (  .class-name {)
    const nestedMatches = content.matchAll(/\s+\.([a-zA-Z][a-zA-Z0-9_-]*)\s*\{/g);
    for (const match of nestedMatches) {
      if (!classes.includes(match[1])) {
        classes.push(match[1]);
      }
    }

    // Extract ID selectors as well (#id-name {)
    const idMatches = content.matchAll(/#([a-zA-Z][a-zA-Z0-9_-]*)\s*\{/g);
    for (const match of idMatches) {
      if (!classes.includes(match[1])) {
        classes.push(match[1]);
      }
    }

    return classes;
  } catch (error) {
    console.error(`Error analyzing CSS file ${filePath}:`, error);
    return [];
  }
}

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  const settings = await getDocumentSettings(textDocument.uri);
  const text = textDocument.getText();
  const problems = 0;
  let m: RegExpExecArray | null;

  const diagnostics: Diagnostic[] = [];

  if (problems < settings.maxNumberOfProblems) {
    // Add validation logic here if needed
  }

  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onCompletion(
  (textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
    const document = documents.get(textDocumentPosition.textDocument.uri);
    if (!document) {
      return [];
    }

    const text = document.getText();
    const offset = document.offsetAt(textDocumentPosition.position);

    // Only provide Meteor completions if this HTML file contains templates
    if (!containsMeteorTemplates(document)) {
      return [];
    }

    const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
    const currentLine = text.substring(lineStart, offset);
    const completions: CompletionItem[] = [];

    // Get base file name for cross-file analysis
    const filePath = document.uri.replace('file://', '');
    const baseName = path.basename(filePath, path.extname(filePath));

    // Check if we're in a template block and get template name
    const beforeCursor = text.substring(0, offset);
    const templateMatch = beforeCursor.match(/<template\s+name=["']([^"']+)["'][^>]*>(?:(?!<\/template>)[\s\S])*$/);
    const currentTemplateName = templateMatch ? templateMatch[1] : null;

    const inTemplate = !!currentTemplateName;

    if (inTemplate) {
      // Inside template - provide Blaze helpers and CSS classes

      // Check if we're typing a helper in {{}}
      if (currentLine.includes('{{') && !currentLine.includes('}}')) {
        // Add helpers from analyzed files using multiple lookup strategies
        const lookupKeys = [baseName, currentTemplateName].filter(Boolean);

        lookupKeys.forEach(key => {
          const helpers = fileAnalysis.jsHelpers.get(key as string);
          if (helpers) {
            helpers.forEach(helper => {
              // Avoid duplicates
              if (!completions.find(c => c.label === helper)) {
                completions.push({
                  label: helper,
                  kind: CompletionItemKind.Function,
                  detail: `Template helper from ${key}`,
                  documentation: `Helper function: ${helper}`
                });
              }
            });
          }
        });

        // Also check all stored helpers for any that might match
        fileAnalysis.jsHelpers.forEach((helpers, key) => {
          helpers.forEach(helper => {
            // Avoid duplicates
            if (!completions.find(c => c.label === helper)) {
              completions.push({
                label: helper,
                kind: CompletionItemKind.Function,
                detail: `Template helper from ${key}`,
                documentation: `Helper function: ${helper}`
              });
            }
          });
        });

        // Add built-in Blaze helpers
        const blazeHelpers = [
          { name: 'each', doc: 'Iterate over a list' },
          { name: 'if', doc: 'Conditional rendering' },
          { name: 'unless', doc: 'Inverse conditional rendering' },
          { name: 'with', doc: 'Change data context' },
          { name: 'let', doc: 'Define local variables' },
          { name: '@index', doc: 'Current index in #each loop' },
          { name: '@key', doc: 'Current key in #each loop' },
          { name: '@first', doc: 'True if first item in #each loop' },
          { name: '@last', doc: 'True if last item in #each loop' },
          { name: 'this', doc: 'Current data context' }
        ];

        blazeHelpers.forEach(helper => {
          completions.push({
            label: helper.name,
            kind: CompletionItemKind.Keyword,
            detail: 'Blaze helper',
            documentation: helper.doc
          });
        });
      }

      // Check if we're typing a CSS class
      if (currentLine.includes('class=') || currentLine.includes("class='") || currentLine.includes('class="')) {
        // Add CSS classes from all analyzed files
        fileAnalysis.cssClasses.forEach((classes, key) => {
          if (key.includes(baseName)) {
            classes.forEach(className => {
              completions.push({
                label: className,
                kind: CompletionItemKind.Value,
                detail: `CSS class from ${key}`,
                documentation: `CSS class: .${className}`
              });
            });
          }
        });
      }

      // Add HTML attributes common in Meteor templates
      const meteorAttributes = [
        { name: 'data-id', doc: 'Data attribute for element identification' },
        { name: 'data-action', doc: 'Data attribute for event handling' },
        { name: 'checked', doc: 'Checkbox checked state (use with {{}}})' }
      ];

      if (currentLine.match(/<\w+[^>]*$/)) { // Inside an HTML tag
        meteorAttributes.forEach(attr => {
          completions.push({
            label: attr.name,
            kind: CompletionItemKind.Property,
            detail: 'Meteor template attribute',
            documentation: attr.doc
          });
        });
      }
    }

    return completions;
  }
);

connection.onCompletionResolve(
  (item: CompletionItem): CompletionItem => {
    return item;
  }
);

connection.onHover(
  (textDocumentPosition: TextDocumentPositionParams): Hover | null => {
    const document = documents.get(textDocumentPosition.textDocument.uri);
    if (!document) {
      return null;
    }

    // Only provide hover info if this HTML file contains templates
    if (!containsMeteorTemplates(document)) {
      return null;
    }

    const text = document.getText();
    const offset = document.offsetAt(textDocumentPosition.position);

    // Simple hover implementation - can be enhanced
    const wordRange = getWordRangeAtPosition(document, textDocumentPosition.position);
    if (!wordRange) {
      return null;
    }

    const word = text.substring(
      document.offsetAt(wordRange.start),
      document.offsetAt(wordRange.end)
    );

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `**${word}** - Meteor template element`
      },
      range: wordRange
    };
  }
);

function getWordRangeAtPosition(document: TextDocument, position: Position): Range | null {
  const text = document.getText();
  const offset = document.offsetAt(position);

  let start = offset;
  let end = offset;

  // Find word boundaries
  while (start > 0 && /\w/.test(text.charAt(start - 1))) {
    start--;
  }

  while (end < text.length && /\w/.test(text.charAt(end))) {
    end++;
  }

  if (start === end) {
    return null;
  }

  return {
    start: document.positionAt(start),
    end: document.positionAt(end)
  };
}

documents.listen(connection);
connection.listen();
