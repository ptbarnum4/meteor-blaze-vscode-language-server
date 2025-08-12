import path from 'path';
import fs from 'fs';
import vscode from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind
} from 'vscode-languageclient/node';

let client: LanguageClient;

// Check if the current workspace contains a Meteor project
function isMeteorProject(): boolean {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    return false;
  }

  // Check each workspace folder for a .meteor directory
  for (const folder of workspaceFolders) {
    const meteorPath = path.join(folder.uri.fsPath, '.meteor');
    try {
      if (fs.existsSync(meteorPath) && fs.statSync(meteorPath).isDirectory()) {
        return true;
      }
    } catch (error) {
      // Ignore errors and continue checking
      console.log(`Error checking for .meteor directory in ${folder.uri.fsPath}:`, error);
    }
  }

  return false;
}

// Decoration type for block-condition hints (created dynamically based on settings)
let blockConditionDecorationType: vscode.TextEditorDecorationType;

function createBlockConditionDecorationType(): vscode.TextEditorDecorationType {
  const config = vscode.workspace.getConfiguration('meteorLanguageServer.blockConditions');

  // Get settings with fallbacks
  const colorSetting = config.get<string>('color', 'editorCodeLens.foreground');
  const fontStyle = config.get<string>('fontStyle', 'italic');
  const margin = config.get<string>('margin', '0 0 0 1em');

  // Handle color setting - can be theme color name or hex color
  let color: string | vscode.ThemeColor;
  if (colorSetting.startsWith('#')) {
    color = colorSetting;
  } else {
    color = new vscode.ThemeColor(colorSetting);
  }

  return vscode.window.createTextEditorDecorationType({
    after: {
      color: color,
      fontStyle: fontStyle as any,
      margin: margin
    }
  });
}

function updateDecorationType() {
  // Dispose old decoration type if it exists
  if (blockConditionDecorationType) {
    blockConditionDecorationType.dispose();
  }

  // Create new decoration type with current settings
  blockConditionDecorationType = createBlockConditionDecorationType();

  // Update decorations for all visible editors
  vscode.window.visibleTextEditors.forEach(editor => {
    if (
      ['html', 'handlebars', 'meteor-html', 'meteor-handlebars'].includes(
        editor.document.languageId
      )
    ) {
      updateBlockConditionDecorations(editor.document);
    }
  });
}

export function activate(context: vscode.ExtensionContext) {
  // Check if this is a Meteor project
  if (!isMeteorProject()) {
    console.log('Meteor/Blaze Language Server: No .meteor directory found. Extension will not activate.');
    return;
  }

  console.log('Meteor/Blaze Language Server: .meteor directory found. Activating extension...');

  // Register semantic token provider for Blaze blocks and expressions
  const legend = new vscode.SemanticTokensLegend([
    'delimiter',
    'blazeBlockHash',
    'blazeBlockName',
    'blazeBlockSingleArg',
    'blazeBlockFirstArg',
    'blazeBlockArgs',
    'blazeBlockIn',
    'blazeExpression'
  ]);

  const semanticProvider: vscode.DocumentSemanticTokensProvider = {
    provideDocumentSemanticTokens(document) {
      const tokensBuilder = new vscode.SemanticTokensBuilder(legend);
      const text = document.getText();
      // Find all block helper ranges (start/end positions)
      const blockRanges: Array<{ start: number; end: number }> = [];
      const blockStartRegex = /\{\{#(\w+)/g;
      const blockEndRegex = /\{\{\/(\w+)\}\}/g;
      let blockMatch;
      while ((blockMatch = blockStartRegex.exec(text)) !== null) {
        const blockType = blockMatch[1];
        const startIdx = blockMatch.index;
        blockEndRegex.lastIndex = startIdx;
        let endMatch;
        while ((endMatch = blockEndRegex.exec(text)) !== null) {
          if (endMatch[1] === blockType) {
            blockRanges.push({ start: startIdx, end: endMatch.index + endMatch[0].length });
            break;
          }
        }
      }

      // Only highlight Blaze expressions and block helper syntax
      const blazeRegex = /\{\{[#/]?\w+.*?\}\}/g;
      let match;
      while ((match = blazeRegex.exec(text)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        // Check if this {{...}} is inside a block helper range
        let insideBlock = false;
        for (const range of blockRanges) {
          if (start > range.start && end < range.end) {
            insideBlock = true;
            break;
          }
        }
        // Only highlight Blaze expressions and block helper syntax
        const startPos = document.positionAt(start);
        const length = end - start;
        tokensBuilder.push(startPos.line, startPos.character, 2, 0); // delimiter

        if (match[0].startsWith('{{#') || match[0].startsWith('{{/')) {
          tokensBuilder.push(startPos.line, startPos.character + 2, 1, 1); // blazeBlockHash
          const blockNameMatch = /^\{\{[#/](\w+)/.exec(match[0]);
          if (blockNameMatch) {
            const blockNameStart = startPos.character + 3;
            const blockNameLength = blockNameMatch[1].length;
            tokensBuilder.push(startPos.line, blockNameStart, blockNameLength, 2); // blazeBlockName
            const afterBlockName = match[0].slice(2 + 1 + blockNameLength, match[0].length - 2);
            const argsMatch = /^\s*(.+)$/.exec(afterBlockName);
            if (argsMatch && argsMatch[1].length > 0) {
              let argsStart =
                blockNameStart + blockNameLength + afterBlockName.indexOf(argsMatch[1]);
              const argsTokens = argsMatch[1].split(/\s+/);
              let offset = 0;
              const blockTypes = ['if', 'each', 'unless', 'with', 'mrkdwn'];
              if (argsTokens.length === 1 && argsTokens[0].length > 0) {
                tokensBuilder.push(startPos.line, argsStart, argsTokens[0].length, 3); // blazeBlockSingleArg
              } else {
                argsTokens.forEach((arg, i) => {
                  if (arg.length > 0) {
                    const argPos = argsMatch[1].indexOf(arg, offset);
                    let tokenType = i === 0 ? 4 : 5;
                    if (arg === 'in' && blockTypes.includes(blockNameMatch[1])) {
                      tokenType = 6;
                    }
                    tokensBuilder.push(startPos.line, argsStart + argPos, arg.length, tokenType);
                    offset = argPos + arg.length;
                  }
                });
              }
            }
          }
        } else {
          // Handle regular expressions like {{pad box}} or {{helper arg1 arg2}}
          const expressionContent = match[0].slice(2, -2).trim(); // Remove {{ and }}

          // Special handling for {{else}} - highlight as blazeBlockName
          if (expressionContent === 'else') {
            const contentStart = startPos.character + 2;
            const leadingWhitespace = match[0].slice(2).match(/^\s*/);
            const elseStart = leadingWhitespace ? contentStart + leadingWhitespace[0].length : contentStart;
            tokensBuilder.push(startPos.line, elseStart, 4, 2); // blazeBlockName (same as block names)
          } else {
            // Handle other expressions
            const tokens = expressionContent.split(/\s+/).filter(token => token.length > 0);

            if (tokens.length > 0) {
              const contentStart = startPos.character + 2;
              let currentOffset = 0;

              // Find the actual start position of content (skip whitespace)
              const leadingWhitespace = match[0].slice(2).match(/^\s*/);
              if (leadingWhitespace) {
                currentOffset = leadingWhitespace[0].length;
              }

              if (tokens.length === 1) {
                // Single token - use blazeExpression for the whole thing
                const tokenPosition = expressionContent.indexOf(tokens[0], currentOffset);
                const tokenStart = contentStart + tokenPosition;
                tokensBuilder.push(startPos.line, tokenStart, tokens[0].length, 7); // blazeExpression
              } else {
                // Multiple tokens - follow block condition pattern
                tokens.forEach((token, index) => {
                  const tokenPosition = expressionContent.indexOf(token, currentOffset);
                  const tokenStart = contentStart + tokenPosition;

                  if (index === 0) {
                    // First argument gets blazeBlockFirstArg
                    tokensBuilder.push(startPos.line, tokenStart, token.length, 4); // blazeBlockFirstArg
                  } else {
                    // Subsequent arguments get blazeBlockArgs
                    tokensBuilder.push(startPos.line, tokenStart, token.length, 5); // blazeBlockArgs
                  }

                  currentOffset = tokenPosition + token.length;
                });
              }
            }
          }
        }
        tokensBuilder.push(startPos.line, startPos.character + length - 2, 2, 0); // delimiter
      }
      // No tokens for any text outside of {{...}} blocks, including inside nested block helpers
      return tokensBuilder.build();
    }
  };

  const selectors: vscode.DocumentSelector = [
    { language: 'html', scheme: 'file' },
    { language: 'handlebars', scheme: 'file' },
    { language: 'meteor-handlebars', scheme: 'file' },
    { language: 'meteor-html', scheme: 'file' }
  ];
  for (const sel of selectors as vscode.DocumentFilter[]) {
    context.subscriptions.push(
      vscode.languages.registerDocumentSemanticTokensProvider(sel, semanticProvider, legend)
    );
  }
  // Prompt user to set editor.tokenColorCustomizations for Blaze token colors
  vscode.window.showInformationMessage(
    'For full Blaze token coloring, add editor.tokenColorCustomizations to your settings. See example-blaze-token-theme.jsonc for details.'
  );
  console.log('Meteor/Blaze HTML Language Server extension activating...');

  // Initialize decoration type with current settings
  blockConditionDecorationType = createBlockConditionDecorationType();

  // The server is implemented in node
  const serverModule = context.asAbsolutePath(path.join('dist', 'server.js'));

  console.log(`Server module path: ${serverModule}`);

  // Debug options for the server
  const debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] }; // Server options: run configuration and debug configuration
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: debugOptions
    }
  };

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    // Register the server for HTML and Handlebars documents with Meteor template detection
    documentSelector: [
      { scheme: 'file', language: 'html' },
      { scheme: 'file', language: 'handlebars' },
      { scheme: 'file', language: 'javascript' },
      { scheme: 'file', language: 'typescript' }
    ],
    synchronize: {
      // Notify the server about file changes to Meteor-related files
      fileEvents: [
        vscode.workspace.createFileSystemWatcher('**/.meteor/packages'),
        vscode.workspace.createFileSystemWatcher('**/.meteor/versions'),
        vscode.workspace.createFileSystemWatcher('**/package.js'),
        vscode.workspace.createFileSystemWatcher('**/packages/**'),
        vscode.workspace.createFileSystemWatcher('**/*.html'),
        vscode.workspace.createFileSystemWatcher('**/*.hbs'),
        vscode.workspace.createFileSystemWatcher('**/*.css'),
        vscode.workspace.createFileSystemWatcher('**/*.less'),
        vscode.workspace.createFileSystemWatcher('**/*.js'),
        vscode.workspace.createFileSystemWatcher('**/*.ts')
      ]
    }
  };

  // Create the language client and start the client
  client = new LanguageClient(
    'meteorLanguageServer',
    'Meteor/Blaze HTML Language Server',
    serverOptions,
    clientOptions
  );

  // Register restart command
  const restartCommand = vscode.commands.registerCommand(
    'meteor-blaze-vscode-language-server.restart',
    async () => {
      if (client) {
        await client.stop();
        client.start();
        vscode.window.showInformationMessage('Meteor/Blaze HTML Language Server restarted');
      }
    }
  );

  context.subscriptions.push(restartCommand);

  // Start the client. This will also launch the server
  client.start();

  // Set up document change listener for inline block-condition hints
  const disposable = vscode.workspace.onDidChangeTextDocument(event => {
    if (event.document.languageId === 'html' || event.document.languageId === 'handlebars') {
      updateBlockConditionDecorations(event.document);
    }
  });

  // Set up active editor change listener
  const activeEditorDisposable = vscode.window.onDidChangeActiveTextEditor(editor => {
    if (
      editor &&
      (editor.document.languageId === 'html' || editor.document.languageId === 'handlebars')
    ) {
      updateBlockConditionDecorations(editor.document);
    }
  });

  // Update decorations for current active editor
  if (vscode.window.activeTextEditor) {
    updateBlockConditionDecorations(vscode.window.activeTextEditor.document);
  }

  // Set up configuration change listener
  const configDisposable = vscode.workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration('meteorLanguageServer.blockConditions')) {
      updateDecorationType();
    }
  });

  // Set up workspace folder change listener to handle dynamic addition/removal of Meteor projects
  const workspaceFoldersChangeDisposable = vscode.workspace.onDidChangeWorkspaceFolders(event => {
    // If a folder with .meteor was added or removed, we might need to restart the extension
    const hasMeteorProject = isMeteorProject();
    if (!hasMeteorProject && client) {
      // No longer a Meteor project, deactivate
      vscode.window.showInformationMessage('Meteor/Blaze Language Server: No .meteor directory found. Deactivating extension.');
      client.stop();
    } else if (hasMeteorProject && !client) {
      // Became a Meteor project, but this would require reactivating the extension
      vscode.window.showInformationMessage('Meteor/Blaze Language Server: .meteor directory detected. Please reload the window to activate the extension.');
    }
  });

  context.subscriptions.push(restartCommand, disposable, activeEditorDisposable, configDisposable, workspaceFoldersChangeDisposable);

  // Log activation
  console.log('Meteor/Blaze HTML Language Server is now active for Meteor project!');
  vscode.window.showInformationMessage('Meteor/Blaze HTML Language Server activated for Meteor project!');

  // Register CompletionItemProvider for propNames inside block conditions
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      [
        { language: 'html', scheme: 'file' },
        { language: 'handlebars', scheme: 'file' }
      ],
      {
        provideCompletionItems(document, position) {
          const blockConfig = vscode.workspace.getConfiguration(
            'meteorLanguageServer.blockConditions'
          );
          type ExtendedBlock = { type: string; label: string; propNames?: string[] };
          const extendBlocks = blockConfig.get<ExtendedBlock[]>('extend', []);
          const defaultBlockTypes = [
            { type: 'if', label: 'if' },
            { type: 'each', label: 'each' },
            { type: 'unless', label: 'unless' },
            { type: 'with', label: 'with' }
          ];
          const blockTypesMap = new Map<
            string,
            { type: string; label: string; propNames?: string[] }
          >();
          defaultBlockTypes.forEach(b => blockTypesMap.set(b.type, b));
          extendBlocks.forEach(b => blockTypesMap.set(b.type, b));
          const blockTypes: ExtendedBlock[] = Array.from(blockTypesMap.values());

          const text = document.getText();
          const offset = document.offsetAt(position);

          // Find the nearest opening block before the cursor
          let foundBlock: ExtendedBlock | undefined;
          let blockStart = -1;
          blockTypes.forEach(({ type, propNames }) => {
            // Regex for {{#blockType ...}}
            const regex = new RegExp(`\{\{\s*#${type}(?:\s+[^}]*)?\}\}`, 'g');
            let match;
            while ((match = regex.exec(text)) !== null) {
              const start = match.index;
              const endRegex = new RegExp(`\{\{\s*\/${type}\s*\}\}`, 'g');
              endRegex.lastIndex = regex.lastIndex;
              const endMatch = endRegex.exec(text);
              const end = endMatch ? endMatch.index + endMatch[0].length : text.length;
              if (offset >= start && offset <= end) {
                foundBlock = { type, label: type, propNames };
                blockStart = start;
                break;
              }
            }
          });

          if (foundBlock && foundBlock.propNames && foundBlock.propNames.length > 0) {
            return foundBlock.propNames.map(p => {
              const item = new vscode.CompletionItem(p, vscode.CompletionItemKind.Property);
              item.detail = `Custom property for block #${foundBlock!.type}`;
              return item;
            });
          }
          return undefined;
        }
      },
      ...[' ', '.', ':', ','] // Trigger on space and common chars
    )
  );
}

function containsMeteorTemplates(document: vscode.TextDocument): boolean {
  const text = document.getText();
  return /<template\s+name=["'][^"']+["'][^>]*>/.test(text);
}

function findMatchingIfCondition(textBeforeEndIf: string): string | null {
  return findMatchingBlockCondition(textBeforeEndIf, 'if');
}

function findMatchingBlockCondition(textBeforeEndBlock: string, blockType: string): string | null {
  // Stack to track nested block pairs
  const stack: string[] = [];

  // Find all block patterns, working backwards
  // Allow blocks with or without a condition
  const blockRegex = new RegExp(
    `\\{\\{\\s*(#${blockType}|\\/${blockType})(?:\\s+([^}]*)?)?\\s*\\}\\}`,
    'g'
  );
  const matches: { type: string; condition: string; index: number }[] = [];

  let match;
  while ((match = blockRegex.exec(textBeforeEndBlock)) !== null) {
    const type = match[1];
    const condition = match[2] ? match[2].trim() : '';
    matches.push({ type, condition, index: match.index });
  }

  // Process matches in reverse order (from end to beginning)
  for (let i = matches.length - 1; i >= 0; i--) {
    const { type, condition } = matches[i];

    if (type === `/${blockType}`) {
      // Push closing block onto stack
      stack.push(`end${blockType}`);
    } else if (type === `#${blockType}`) {
      if (stack.length > 0) {
        // Pop matching end block
        stack.pop();
      } else {
        // This is our matching opening block
        return condition;
      }
    }
  }

  return null;
}

function findEnclosingBlockForElse(text: string, elseOffset: number): { type: 'if' | 'unless'; condition: string } | null {
  // Find all #if, #unless, {{else}}, /if, /unless blocks before the else position
  type Block =
    | { type: 'open'; blockType: 'if' | 'unless'; condition: string; position: number; length: number }
    | { type: 'close'; blockType: 'if' | 'unless'; position: number; length: number }
    | { type: 'else'; position: number; length: number };

  const allBlocks: Block[] = [];

  // Match all relevant block patterns
  const patterns = [
    { regex: /\{\{\s*#(if|unless)\s+([^}]+)\s*\}\}/g, isOpening: true },
    { regex: /\{\{\s*\/(if|unless)\s*\}\}/g, isOpening: false },
    { regex: /\{\{\s*else\s*\}\}/g, isElse: true }
  ];

  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.regex.exec(text)) !== null) {
      if (match.index >= elseOffset) {
        break; // Only consider blocks before our else
      }

      if (pattern.isElse) {
        allBlocks.push({
          type: 'else',
          position: match.index,
          length: match[0].length
        });
      } else if (pattern.isOpening) {
        allBlocks.push({
          type: 'open',
          blockType: match[1] as 'if' | 'unless',
          condition: match[2].trim(),
          position: match.index,
          length: match[0].length
        });
      } else {
        allBlocks.push({
          type: 'close',
          blockType: match[1] as 'if' | 'unless',
          position: match.index,
          length: match[0].length
        });
      }
    }
  });

  // Sort by position
  allBlocks.sort((a, b) => a.position - b.position);

  // Track the stack of open blocks
  const stack: Array<{ blockType: 'if' | 'unless'; condition: string }> = [];
  let elseCount = 0;

  for (const block of allBlocks) {
    if (block.type === 'open') {
      stack.push({ blockType: block.blockType, condition: block.condition });
    } else if (block.type === 'close') {
      if (stack.length > 0 && stack[stack.length - 1].blockType === block.blockType) {
        stack.pop();
      }
    } else if (block.type === 'else') {
      elseCount++;
    }
  }

  // The else we're looking for should be the (elseCount + 1)th else
  // Return the condition from the top of the stack (innermost open block)
  if (stack.length > 0) {
    const enclosingBlock = stack[stack.length - 1];
    return {
      type: enclosingBlock.blockType,
      condition: enclosingBlock.condition
    };
  }

  return null;
}

function updateBlockConditionDecorations(document: vscode.TextDocument) {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document !== document) {
    return;
  }

  // Check if block condition hints are enabled
  const blockConfig = vscode.workspace.getConfiguration('meteorLanguageServer.blockConditions');
  const enabled = blockConfig.get<boolean>('enabled', true);

  if (!enabled) {
    editor.setDecorations(blockConditionDecorationType, []);
    return;
  }

  // Only process documents with Meteor templates
  if (!containsMeteorTemplates(document)) {
    editor.setDecorations(blockConditionDecorationType, []);
    return;
  }

  // Get blazeHelpers config for colors
  const blazeConfig = vscode.workspace.getConfiguration('meteorLanguageServer.blazeHelpers');
  // Use theme token colors if not provided
  let hashColor = blazeConfig.get<string>('hashColor', '');
  let nameColor = blazeConfig.get<string>('nameColor', '');
  // Fallback to Blaze theme default if not provided
  if (!nameColor) {
    nameColor = '#f07dff'; // Blaze default for blazeBlockName
  }
  let bracketColor = blazeConfig.get<string>('bracketColor', '');

  // Try to use theme color, but fallback to config color if theme color is not defined
  function getThemeOrConfigColor(scope: string, configColor: string) {
    // Try to use theme color, but fallback to config color if theme color is not defined
    // VS Code does not provide a direct API to check if a theme color is defined, so we use configColor if present
    if (configColor) {
      return configColor;
    }
    return new vscode.ThemeColor(scope) as any;
  }

  hashColor = getThemeOrConfigColor('constant.character.hash.meteor', hashColor);
  nameColor = getThemeOrConfigColor('entity.name.tag.meteor keyword.control.meteor', nameColor);
  bracketColor = getThemeOrConfigColor('punctuation.definition.bracket.meteor', bracketColor);

  const text = document.getText();
  const decorations: vscode.DecorationOptions[] = [];

  // Get custom block types from config
  // Support custom propNames in extended blockConditions
  type ExtendedBlock = { type: string; label: string; propNames?: string[] };
  const extendBlocks = blockConfig.get<ExtendedBlock[]>('extend', []);
  // Define the default block types
  const defaultBlockTypes = [
    { type: 'if', label: 'if' },
    { type: 'each', label: 'each' },
    { type: 'unless', label: 'unless' },
    { type: 'with', label: 'with' }
  ];
  // Merge and deduplicate by type
  const blockTypesMap = new Map<string, { type: string; label: string }>();
  defaultBlockTypes.forEach(b => blockTypesMap.set(b.type, b));
  extendBlocks.forEach(b => blockTypesMap.set(b.type, b));
  const blockTypes: ExtendedBlock[] = Array.from(blockTypesMap.values());

  // Process each block type
  blockTypes.forEach(({ type, label, propNames }) => {
    // Find all {{/blockType}} patterns and add decorations showing the condition
    const endBlockRegex = new RegExp(`\{\{\s*\/${type}\s*\}\}`, 'g');
    let match;

    while ((match = endBlockRegex.exec(text)) !== null) {
      // Look backwards to find the matching {{#blockType}} condition
      const beforeEndBlock = text.substring(0, match.index);
      const condition = findMatchingBlockCondition(beforeEndBlock, type);

      let propText = '';
      if (propNames && propNames.length > 0) {
        propText = ` [props: ${propNames.join(', ')}]`;
      }

      if (condition) {
        const endPos = document.positionAt(match.index + match[0].length);

        decorations.push({
          range: new vscode.Range(endPos, endPos),
          renderOptions: {
            after: {
              contentText: `// END ${label}${propText} ${condition}`
            }
          }
        });
      }
    }

    // Find all {{else}} patterns within if/unless blocks and add condition hints
    if (type === 'if' || type === 'unless') {
      const elseRegex = /\{\{\s*else\s*\}\}/g;
      let elseMatch;

      while ((elseMatch = elseRegex.exec(text)) !== null) {
        // Use the new function to find the enclosing block
        const enclosingBlock = findEnclosingBlockForElse(text, elseMatch.index);

        if (enclosingBlock && enclosingBlock.type === type) {
          // Determine the prefix based on block type
          const prefix = type === 'unless' ? 'IS' : 'NOT';
          const elsePos = document.positionAt(elseMatch.index + elseMatch[0].length);

          decorations.push({
            range: new vscode.Range(elsePos, elsePos),
            renderOptions: {
              after: {
                contentText: `// ${prefix} ${enclosingBlock.condition}`
              }
            }
          });
        }
      }
    }
  });

  editor.setDecorations(blockConditionDecorationType, decorations);
}

export function deactivate(): Thenable<void> | undefined {
  // Dispose decoration type
  if (blockConditionDecorationType) {
    blockConditionDecorationType.dispose();
  }

  if (!client) {
    return undefined;
  }
  return client.stop();
}
