import {
  createConnection,
  TextDocuments,
  Diagnostic,
  DiagnosticSeverity,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  TextDocumentSyncKind,
  InitializeResult,
  Hover,
  MarkupKind,
  Position,
  Range,
  Location,
  DefinitionParams
} from 'vscode-languageserver/node';

import {
  TextDocument
} from 'vscode-languageserver-textdocument';

import * as fs from 'fs';
import * as path from 'path';

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
  connection.console.log('🚀🚀🚀 METEOR LANGUAGE SERVER STARTING WITH NEW DEBUG CODE 🚀🚀🚀');
  connection.console.log('Meteor Language Server initializing...');
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

  connection.console.log('Meteor Language Server capabilities configured');
  return result;
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    connection.client.register(DidChangeConfigurationNotification.type, undefined);
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders(_event => {
      connection.console.log('Workspace folder change event received.');
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
  connection.console.log(`🔥🔥🔥 CUSTOM FILE CHANGE HANDLER RUNNING 🔥🔥🔥`);
  connection.console.log(`[DEBUG] File change event received for: ${change.document.uri}`);
  connection.console.log(`[DEBUG] Document language ID: ${change.document.languageId}`);
  connection.console.log(`[DEBUG] Document content length: ${change.document.getText().length}`);

  // Support both 'html' and 'handlebars' language IDs
  const isHtmlOrHandlebars = ['html', 'handlebars'].includes(change.document.languageId);
  connection.console.log(`[DEBUG] Is HTML or Handlebars: ${isHtmlOrHandlebars}`);

  const hasTemplates = containsMeteorTemplates(change.document);
  connection.console.log(`[DEBUG] Contains Meteor templates: ${hasTemplates}`);

  if (hasTemplates) {
    connection.console.log(`[DEBUG] Processing template file: ${change.document.uri}`);
  }

  validateTextDocument(change.document);
  analyzeNeighboringFiles(change.document);
});

// Check if HTML file contains Meteor templates
function containsMeteorTemplates(document: TextDocument): boolean {
  const text = document.getText();
  const hasTemplates = /<template\s+name=["'][^"']+["'][^>]*>/.test(text);
  connection.console.log(`[DEBUG] containsMeteorTemplates check:`);
  connection.console.log(`[DEBUG]   - Document URI: ${document.uri}`);
  connection.console.log(`[DEBUG]   - Text preview: "${text.substring(0, 100)}..."`);
  connection.console.log(`[DEBUG]   - Has templates: ${hasTemplates}`);
  return hasTemplates;
}

// Check if cursor position is within handlebars expression
function isWithinHandlebarsExpression(text: string, offset: number): { isWithin: boolean; expressionStart: number; expressionEnd: number; isTriple: boolean } {
  // Look backwards for opening braces
  let start = -1;
  let isTriple = false;

  for (let i = offset - 1; i >= 0; i--) {
    if (text.substring(i, i + 3) === '{{{') {
      start = i;
      isTriple = true;
      break;
    } else if (text.substring(i, i + 2) === '{{' && text.substring(i, i + 3) !== '{{{') {
      start = i;
      isTriple = false;
      break;
    }
  }

  if (start === -1) {
    return { isWithin: false, expressionStart: -1, expressionEnd: -1, isTriple: false };
  }

  // Look forwards for closing braces
  const searchPattern = isTriple ? '}}}' : '}}';
  const searchStart = start + (isTriple ? 3 : 2);

  for (let i = searchStart; i <= text.length - searchPattern.length; i++) {
    if (text.substring(i, i + searchPattern.length) === searchPattern) {
      // Check if cursor is within the expression
      if (offset >= searchStart && offset <= i) {
        return {
          isWithin: true,
          expressionStart: searchStart,
          expressionEnd: i,
          isTriple
        };
      }
      break;
    }
  }

  return { isWithin: false, expressionStart: -1, expressionEnd: -1, isTriple: false };
}

// Analyze neighboring JS/TS/CSS/LESS files
function analyzeNeighboringFiles(document: TextDocument) {
  const uri = document.uri;
  const filePath = uri.replace('file://', '');
  const dir = path.dirname(filePath);
  const baseName = path.basename(filePath, path.extname(filePath));

  connection.console.log(`[DEBUG] Analyzing neighboring files for: ${filePath}`);
  connection.console.log(`[DEBUG] Dir: ${dir}, BaseName: ${baseName}`);

  // Only analyze if this HTML file contains Meteor templates
  if (!containsMeteorTemplates(document)) {
    connection.console.log(`[DEBUG] No Meteor templates found in ${filePath}`);
    return;
  }

  // Extract template names from the HTML document
  const text = document.getText();
  const templateNames: string[] = [];
  const templateMatches = text.matchAll(/<template\s+name=["']([^"']+)["'][^>]*>/g);
  for (const match of templateMatches) {
    templateNames.push(match[1]);
  }

  connection.console.log(`[DEBUG] Template names found: ${JSON.stringify(templateNames)}`);

  try {
    // Look for neighboring files
    const files = fs.readdirSync(dir);
    connection.console.log(`[DEBUG] Files in directory: ${JSON.stringify(files)}`);

    files.forEach(file => {
      const fileBaseName = path.basename(file, path.extname(file));
      const ext = path.extname(file);
      const fullPath = path.join(dir, file);

      // Analyze files with same base name OR files that match template names
      const shouldAnalyze = fileBaseName === baseName ||
                           templateNames.includes(fileBaseName) ||
                           file.startsWith(baseName);

      connection.console.log(`[DEBUG] File: ${file}, BaseName: ${fileBaseName}, ShouldAnalyze: ${shouldAnalyze}`);
      connection.console.log(`[DEBUG]   - fileBaseName === baseName: ${fileBaseName === baseName} (${fileBaseName} === ${baseName})`);
      connection.console.log(`[DEBUG]   - templateNames.includes(fileBaseName): ${templateNames.includes(fileBaseName)} (templateNames: ${JSON.stringify(templateNames)} includes ${fileBaseName})`);
      connection.console.log(`[DEBUG]   - file.startsWith(baseName): ${file.startsWith(baseName)} (${file} starts with ${baseName})`);
      
      if (file === 'nestedTemplate.ts') {
        connection.console.log(`[DEBUG] 🔍 SPECIAL CHECK FOR nestedTemplate.ts:`);
        connection.console.log(`[DEBUG]   - fileBaseName: "${fileBaseName}"`);
        connection.console.log(`[DEBUG]   - baseName: "${baseName}"`);
        connection.console.log(`[DEBUG]   - templateNames: ${JSON.stringify(templateNames)}`);
        connection.console.log(`[DEBUG]   - templateNames.includes("${fileBaseName}"): ${templateNames.includes(fileBaseName)}`);
      }
      if (shouldAnalyze) {
        if (['.js', '.ts'].includes(ext)) {
          connection.console.log(`[DEBUG] Analyzing JavaScript/TypeScript file: ${fullPath}`);
          const result = analyzeJavaScriptFile(fullPath);
          const helpers = result.helpers;
          const extractedTemplateName = result.templateName;

          connection.console.log(`[DEBUG] Found helpers: ${JSON.stringify(helpers)}`);
          connection.console.log(`[DEBUG] Extracted template name from code: ${extractedTemplateName}`);

          // Store helpers with directory-specific keys to ensure same-directory matching
          const dirKey = `${dir}/${baseName}`;
          const dirFileKey = `${dir}/${fileBaseName}`;

          fileAnalysis.jsHelpers.set(dirKey, helpers);
          fileAnalysis.jsHelpers.set(dirFileKey, helpers);

          // If we extracted a template name from the code, use that as a key too (with directory)
          if (extractedTemplateName) {
            const dirTemplateKey = `${dir}/${extractedTemplateName}`;
            fileAnalysis.jsHelpers.set(dirTemplateKey, helpers);
            connection.console.log(`[DEBUG] Stored helpers under dir-specific template name: ${dirTemplateKey}`);
          }

          // Also store under template names found in HTML (with directory)
          templateNames.forEach(templateName => {
            const dirTemplateKey = `${dir}/${templateName}`;
            fileAnalysis.jsHelpers.set(dirTemplateKey, helpers);
            connection.console.log(`[DEBUG] Stored helpers under dir-specific HTML template name: ${dirTemplateKey}`);
          });
        } else if (['.css', '.less'].includes(ext)) {
          connection.console.log(`[DEBUG] Analyzing CSS/LESS file: ${fullPath}`);
          const classes = analyzeCSSFile(fullPath);
          connection.console.log(`[DEBUG] Found CSS classes: ${JSON.stringify(classes)}`);
          // Store CSS classes with directory-specific keys for same-directory matching
          const dirKey = `${dir}/${baseName}`;
          const dirFileKey = `${dir}/${fileBaseName}`;

          fileAnalysis.cssClasses.set(dirKey, classes);
          fileAnalysis.cssClasses.set(dirFileKey, classes);
          templateNames.forEach(templateName => {
            const dirTemplateKey = `${dir}/${templateName}`;
            fileAnalysis.cssClasses.set(dirTemplateKey, classes);
          });
        }
      }
    });
  } catch (error) {
    // Ignore file system errors
    connection.console.log(`[DEBUG] Error analyzing neighboring files: ${error}`);
    console.error('Error analyzing neighboring files:', error);
  }
}

function analyzeJavaScriptFile(filePath: string): { helpers: string[], templateName?: string } {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const helpers: string[] = [];
    let extractedTemplateName: string | undefined;

    // Find Template.name.helpers() calls with proper brace matching
    const templateHelperPattern = /Template\.(\w+)\.helpers\s*\(\s*\{/g;
    let match;

    while ((match = templateHelperPattern.exec(content)) !== null) {
      // Extract the template name from Template.templateName.helpers
      const templateNameFromCode = match[1];
      if (!extractedTemplateName) {
        extractedTemplateName = templateNameFromCode;
      }

      connection.console.log(`[DEBUG] Found Template.${templateNameFromCode}.helpers() in ${filePath}`);

      const startIndex = match.index + match[0].length - 1; // Start at the opening brace
      let braceCount = 1;
      let endIndex = startIndex + 1;

      // Find the matching closing brace
      while (endIndex < content.length && braceCount > 0) {
        if (content[endIndex] === '{') {
          braceCount++;
        } else if (content[endIndex] === '}') {
          braceCount--;
        }
        endIndex++;
      }

      if (braceCount === 0) {
        // Extract the content between braces
        const helpersContent = content.substring(startIndex + 1, endIndex - 1);

        // Extract helper function names (multiple patterns to cover different syntax)
        const patterns = [
          // Method syntax: methodName() {
          /(\w+)\s*\([^)]*\)\s*\{/g,
          // TypeScript method syntax: methodName(): ReturnType {
          /(\w+)\s*\([^)]*\)\s*:\s*[^{]*\{/g,
          // Property syntax: methodName: function() {
          /(\w+)\s*:\s*function\s*\([^)]*\)\s*\{/g,
          // Arrow function syntax: methodName: () => {
          /(\w+)\s*:\s*\([^)]*\)\s*=>\s*[\{\.]/g,
          // Arrow function without parens: methodName: arg => {
          /(\w+)\s*:\s*\w+\s*=>\s*[\{\.]/g
        ];

        patterns.forEach(pattern => {
          let helperMatch;
          while ((helperMatch = pattern.exec(helpersContent)) !== null) {
            if (!helpers.includes(helperMatch[1])) {
              helpers.push(helperMatch[1]);
            }
          }
        });
      }
    }

    connection.console.log(`[DEBUG] Extracted helpers from ${filePath}: ${JSON.stringify(helpers)}`);
    connection.console.log(`[DEBUG] Extracted template name: ${extractedTemplateName}`);

    return { helpers, templateName: extractedTemplateName };
  } catch (error) {
    console.error(`Error analyzing JavaScript/TypeScript file ${filePath}:`, error);
    return { helpers: [] };
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
    connection.console.log('Completion requested');
    const document = documents.get(textDocumentPosition.textDocument.uri);
    if (!document) {
      connection.console.log('No document found');
      return [];
    }

    const text = document.getText();
    const offset = document.offsetAt(textDocumentPosition.position);

    connection.console.log(`Document URI: ${document.uri}`);
    connection.console.log(`Document language ID: ${document.languageId}`);
    connection.console.log(`Document contains templates: ${containsMeteorTemplates(document)}`);

    // Only provide Meteor completions if this HTML/Handlebars file contains templates
    if (!containsMeteorTemplates(document)) {
      connection.console.log('No Meteor templates found in document');
      return [];
    }

    // Check if cursor is within handlebars expression
    const handlebarsInfo = isWithinHandlebarsExpression(text, offset);
    if (!handlebarsInfo.isWithin) {
      connection.console.log('Cursor not within handlebars expression');
      return [];
    }

    connection.console.log(`Within handlebars expression: ${handlebarsInfo.isTriple ? 'triple' : 'double'} braces`);

    const completions: CompletionItem[] = [];

    // Get base file name for cross-file analysis
    const filePath = document.uri.replace('file://', '');
    const dir = path.dirname(filePath);
    const baseName = path.basename(filePath, path.extname(filePath));

    // Check if we're in a template block and get template name
    const beforeCursor = text.substring(0, offset);
    const templateMatch = beforeCursor.match(/<template\s+name=["']([^"']+)["'][^>]*>(?:(?!<\/template>)[\s\S])*$/);
    const currentTemplateName = templateMatch ? templateMatch[1] : null;

    connection.console.log(`Current template: ${currentTemplateName}`);

    if (currentTemplateName) {
      // Add helpers from analyzed files using directory-specific lookup strategies
      const dirLookupKeys = [
        `${dir}/${baseName}`,
        `${dir}/${currentTemplateName}`
      ].filter(Boolean);

      connection.console.log(`Looking up helpers with directory-specific keys: ${JSON.stringify(dirLookupKeys)}`);
      connection.console.log(`[COMPLETION DEBUG] Available helpers map keys: ${JSON.stringify(Array.from(fileAnalysis.jsHelpers.keys()))}`);

      dirLookupKeys.forEach(key => {
        const helpers = fileAnalysis.jsHelpers.get(key as string);
        connection.console.log(`🔍 LOOKUP KEY: "${key}" → HELPERS: ${helpers ? JSON.stringify(helpers) : 'NONE FOUND'}`);
        if (helpers) {
          helpers.forEach(helper => {
            // Avoid duplicates
            if (!completions.find(c => c.label === helper)) {
              const sourceFile = key.split('/').pop(); // Get just the filename from the key
              completions.push({
                label: helper,
                kind: CompletionItemKind.Function,
                detail: `Template helper from ${sourceFile}`,
                documentation: `Helper function: ${helper}`
              });
            }
          });
        }
      });

      // Add built-in Blaze helpers
      const blazeHelpers = [
        { name: '#each', doc: 'Iterate over a list' },
        { name: '#if', doc: 'Conditional rendering' },
        { name: '#unless', doc: 'Inverse conditional rendering' },
        { name: '#with', doc: 'Change data context' },
        { name: '#let', doc: 'Define local variables' },
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

    connection.console.log(`Returning ${completions.length} completions`);
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
    connection.console.log('Hover requested');
    const document = documents.get(textDocumentPosition.textDocument.uri);
    if (!document) {
      connection.console.log('No document found for hover');
      return null;
    }

    // Only provide hover info if this HTML/Handlebars file contains templates
    if (!containsMeteorTemplates(document)) {
      connection.console.log('No Meteor templates found for hover');
      return null;
    }

    connection.console.log(`Hover on document: ${document.uri}`);

    const text = document.getText();
    const offset = document.offsetAt(textDocumentPosition.position);
    const filePath = document.uri.replace('file://', '');
    const dir = path.dirname(filePath);
    const baseName = path.basename(filePath, path.extname(filePath));

    // Check if we're in a template block and get template name
    const beforeCursor = text.substring(0, offset);
    const templateMatch = beforeCursor.match(/<template\s+name=["']([^"']+)["'][^>]*>(?:(?!<\/template>)[\s\S])*$/);
    const currentTemplateName = templateMatch ? templateMatch[1] : null;

    if (!currentTemplateName) {
      return null; // Only provide hover info inside templates
    }

    // Get word at current position
    const wordRange = getWordRangeAtPosition(document, textDocumentPosition.position);
    if (!wordRange) {
      return null;
    }

    const word = text.substring(
      document.offsetAt(wordRange.start),
      document.offsetAt(wordRange.end)
    );

    // Check if we're inside a handlebars expression
    const handlebarsInfo = isWithinHandlebarsExpression(text, offset);
    if (!handlebarsInfo.isWithin) {
      connection.console.log('Cursor not within handlebars expression for hover');
      return null;
    }

    connection.console.log(`Hovering over "${word}" within handlebars expression`);
    connection.console.log(`[HOVER DEBUG] Current template: ${currentTemplateName}`);
    connection.console.log(`[HOVER DEBUG] File path: ${filePath}`);
    connection.console.log(`[HOVER DEBUG] Dir: ${dir}`);
    connection.console.log(`[HOVER DEBUG] Base name: ${baseName}`);

    // Look for this helper in analyzed files using directory-specific keys
    const dirLookupKeys = [
      `${dir}/${baseName}`,
      `${dir}/${currentTemplateName}`
    ].filter(Boolean);

    connection.console.log(`[HOVER DEBUG] Lookup keys: ${JSON.stringify(dirLookupKeys)}`);
    connection.console.log(`[HOVER DEBUG] Available helpers map keys: ${JSON.stringify(Array.from(fileAnalysis.jsHelpers.keys()))}`);

    for (const key of dirLookupKeys) {
      const helpers = fileAnalysis.jsHelpers.get(key as string);
      connection.console.log(`[HOVER DEBUG] Key "${key}" → Helpers: ${helpers ? JSON.stringify(helpers) : 'NONE'}`);
      if (helpers && helpers.includes(word)) {
        // Get template file info
        const templateFileName = path.basename(filePath);

        const hoverContent = [
          `**${word}** - Template Helper`,
          ``,
          `**Template:** ${currentTemplateName}`,
          ``,
          `**Template File:** ${templateFileName}`,
          ``,
          `**Source:** Finding actual file...`,
          ``,
          `This is a helper function defined in the template's JavaScript/TypeScript file.`,
          ``,
          `**Usage:** \`{{${word}}}\``
        ];

        // Try to find additional context from the source file
        let actualSourceFile = 'Unknown';
        let foundDefinition = false;
        try {
          // Extract filename from directory-specific key (e.g., "/path/to/test" -> "test")
          const keyParts = key.split('/');
          const keyBaseName = keyParts[keyParts.length - 1];

          // Try multiple possible file names based on template name and HTML file base name
          const possibleFiles = [
            path.join(dir, `${keyBaseName}.js`),
            path.join(dir, `${keyBaseName}.ts`),
            path.join(dir, `${currentTemplateName}.js`),
            path.join(dir, `${currentTemplateName}.ts`),
            path.join(dir, `${baseName}.js`),
            path.join(dir, `${baseName}.ts`)
          ];

          connection.console.log(`[HOVER DEBUG] Checking possible files: ${JSON.stringify(possibleFiles)}`);

          for (const file of possibleFiles) {
            connection.console.log(`[HOVER DEBUG] Checking if file exists: ${file}`);
            if (require('fs').existsSync(file)) {
              connection.console.log(`[HOVER DEBUG] Found file: ${file}`);
              actualSourceFile = path.basename(file); // This includes the full filename with extension
              const content = require('fs').readFileSync(file, 'utf8');
              const helperRegex = new RegExp(`${word}\\s*[:=]?\\s*(?:function\\s*\\(|\\([^)]*\\)\\s*=>|\\([^)]*\\)\\s*\\{)`, 'g');
              const match = helperRegex.exec(content);
              if (match) {
                foundDefinition = true;
                hoverContent[6] = `**Source:** ${actualSourceFile}`;
                hoverContent.push(``, `**Definition found in:** \`${actualSourceFile}\``);
                break;
              } else {
                // File exists but definition not found, still update source but note it
                hoverContent[6] = `**Source:** ${actualSourceFile} (helper not found in file)`;
              }
            } else {
              connection.console.log(`[HOVER DEBUG] File does not exist: ${file}`);
            }
          }

          // If no file found at all, try to infer from the key
          if (actualSourceFile === 'Unknown') {
            hoverContent[6] = `**Source:** ${keyBaseName}.js/ts (checked: ${currentTemplateName}, ${baseName}, ${keyBaseName} - none found)`;
          } else if (!foundDefinition && actualSourceFile !== 'Unknown') {
            // File exists but helper not found in it
            hoverContent[6] = `**Source:** ${actualSourceFile} (helper not located)`;
          }
        } catch (error) {
          // Ignore file read errors
          const keyParts = key.split('/');
          const keyBaseName = keyParts[keyParts.length - 1];
          hoverContent[6] = `**Source:** ${keyBaseName} (file read error: ${error})`;
        }

        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: hoverContent.join('\n')
          },
          range: wordRange
        };
      }
    }

    // Check if it's a built-in Blaze helper
    const blazeHelpers: { [key: string]: string } = {
      '#each': 'Iterates over a list or cursor, creating a new data context for each item',
      '#if': 'Conditionally renders content based on a truthy expression',
      '#unless': 'Conditionally renders content based on a falsy expression (opposite of if)',
      '#with': 'Changes the data context for the block content',
      '#let': 'Defines local template variables',
      '@index': 'The current index in an #each loop (0-based)',
      '@key': 'The current key in an #each loop over an object',
      '@first': 'True if this is the first item in an #each loop',
      '@last': 'True if this is the last item in an #each loop',
      'this': 'References the current data context'
    };

    if (blazeHelpers[word]) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: [
            `**${word}** - Built-in Blaze Helper`,
            ``,
            blazeHelpers[word],
            ``,
            `**Usage:** \`{{${word}}}\` or \`{{#${word}}}...{{/${word}}}\``
          ].join('\n')
        },
        range: wordRange
      };
    }

    return null;
  }
);

connection.onDefinition(
  (params: DefinitionParams): Location[] | null => {
    connection.console.log('Definition requested');
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      connection.console.log('No document found for definition');
      return null;
    }

    // Only provide definitions if this HTML/Handlebars file contains templates
    if (!containsMeteorTemplates(document)) {
      connection.console.log('No Meteor templates found for definition');
      return null;
    }

    const text = document.getText();
    const offset = document.offsetAt(params.position);
    const filePath = document.uri.replace('file://', '');
    const dir = path.dirname(filePath);
    const baseName = path.basename(filePath, path.extname(filePath));

    // Check if we're in a template block and get template name
    const beforeCursor = text.substring(0, offset);
    const templateMatch = beforeCursor.match(/<template\s+name=["']([^"']+)["'][^>]*>(?:(?!<\/template>)[\s\S])*$/);
    const currentTemplateName = templateMatch ? templateMatch[1] : null;

    if (!currentTemplateName) {
      return null; // Only provide definitions inside templates
    }

    // Check if we're inside a handlebars expression
    const handlebarsInfo = isWithinHandlebarsExpression(text, offset);
    if (!handlebarsInfo.isWithin) {
      connection.console.log('Cursor not within handlebars expression for definition');
      return null;
    }

    // Get word at current position
    const wordRange = getWordRangeAtPosition(document, params.position);
    if (!wordRange) {
      return null;
    }

    const word = text.substring(
      document.offsetAt(wordRange.start),
      document.offsetAt(wordRange.end)
    );

    connection.console.log(`Looking for definition of "${word}" within handlebars expression`);

    // Look for this helper in analyzed files using directory-specific keys
    const dirLookupKeys = [
      `${dir}/${baseName}`,
      `${dir}/${currentTemplateName}`
    ].filter(Boolean);

    for (const key of dirLookupKeys) {
      const helpers = fileAnalysis.jsHelpers.get(key as string);
      if (helpers && helpers.includes(word)) {
        try {
          // Extract filename from directory-specific key
          const keyParts = key.split('/');
          const keyBaseName = keyParts[keyParts.length - 1];

          // Try multiple possible file names based on template name and HTML file base name
          const possibleFiles = [
            path.join(dir, `${keyBaseName}.js`),
            path.join(dir, `${keyBaseName}.ts`),
            path.join(dir, `${currentTemplateName}.js`),
            path.join(dir, `${currentTemplateName}.ts`),
            path.join(dir, `${baseName}.js`),
            path.join(dir, `${baseName}.ts`)
          ];

          for (const file of possibleFiles) {
            if (require('fs').existsSync(file)) {
              const content = require('fs').readFileSync(file, 'utf8');

              // Find the helper definition in the file
              const lines = content.split('\n');
              for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const helperRegex = new RegExp(`\\b${word}\\s*[:=]?\\s*(?:function\\s*\\(|\\([^)]*\\)\\s*=>|\\([^)]*\\)\\s*\\{)`);
                const match = helperRegex.exec(line);
                if (match) {
                  connection.console.log(`Found definition of "${word}" at line ${i + 1} in ${file}`);
                  return [{
                    uri: `file://${file}`,
                    range: {
                      start: { line: i, character: match.index || 0 },
                      end: { line: i, character: (match.index || 0) + word.length }
                    }
                  }];
                }
              }
            }
          }
        } catch (error) {
          connection.console.log(`Error finding definition: ${error}`);
        }
      }
    }

    return null;
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
