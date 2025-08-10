import * as vscode from 'vscode';
import * as path from 'path';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind
} from 'vscode-languageclient/node';

let client: LanguageClient;

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
    if (editor.document.languageId === 'html' || editor.document.languageId === 'handlebars') {
      updateBlockConditionDecorations(editor.document);
    }
  });
}

export function activate(context: vscode.ExtensionContext) {
  // Register semantic token provider for Blaze blocks and expressions
  const legend = new vscode.SemanticTokensLegend([
    'delimiter', 'blazeBlockHash', 'blazeBlockName', 'blazeBlockSingleArg', 'blazeBlockFirstArg', 'blazeBlockArgs', 'blazeBlockIn', 'blazeExpression'
  ]);

  context.subscriptions.push(
    vscode.languages.registerDocumentSemanticTokensProvider(
      { language: 'html', scheme: 'file' },
      {
        provideDocumentSemanticTokens(document) {
          const tokensBuilder = new vscode.SemanticTokensBuilder(legend);
          const text = document.getText();
          // Find all block helper ranges (start/end positions)
          const blockRanges: Array<{ start: number, end: number }> = [];
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
                  let argsStart = blockNameStart + blockNameLength + afterBlockName.indexOf(argsMatch[1]);
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
                        if (arg === 'in' && blockTypes.includes(blockNameMatch[1])) { tokenType = 6; }
                        tokensBuilder.push(startPos.line, argsStart + argPos, arg.length, tokenType);
                        offset = argPos + arg.length;
                      }
                    });
                  }
                }
              }
            } else {
              tokensBuilder.push(startPos.line, startPos.character + 2, length - 4, 7); // blazeExpression
            }
            tokensBuilder.push(startPos.line, startPos.character + length - 2, 2, 0); // delimiter
          }
          // No tokens for any text outside of {{...}} blocks, including inside nested block helpers
          return tokensBuilder.build();
        }
      },
      legend
    )
  );
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
  const debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };  // Server options: run configuration and debug configuration
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
        vscode.workspace.createFileSystemWatcher('**/*.ts'),
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
  const restartCommand = vscode.commands.registerCommand('meteor-blaze-vscode-language-server.restart', async () => {
    if (client) {
      await client.stop();
      client.start();
      vscode.window.showInformationMessage('Meteor/Blaze HTML Language Server restarted');
    }
  });

  context.subscriptions.push(restartCommand);

  // Start the client. This will also launch the server
  client.start();

  // Set up document change listener for inline block-condition hints
  const disposable = vscode.workspace.onDidChangeTextDocument((event) => {
    if (event.document.languageId === 'html' || event.document.languageId === 'handlebars') {
      updateBlockConditionDecorations(event.document);
    }
  });

  // Set up active editor change listener
  const activeEditorDisposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor && (editor.document.languageId === 'html' || editor.document.languageId === 'handlebars')) {
      updateBlockConditionDecorations(editor.document);
    }
  });

  // Update decorations for current active editor
  if (vscode.window.activeTextEditor) {
    updateBlockConditionDecorations(vscode.window.activeTextEditor.document);
  }

  // Set up configuration change listener
  const configDisposable = vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('meteorLanguageServer.blockConditions')) {
      updateDecorationType();
    }
  });

  context.subscriptions.push(restartCommand, disposable, activeEditorDisposable, configDisposable);

  // Log activation
  console.log('Meteor/Blaze HTML Language Server is now active!');
  vscode.window.showInformationMessage('Meteor/Blaze HTML Language Server activated!');

    // Register CompletionItemProvider for propNames inside block conditions
    context.subscriptions.push(
      vscode.languages.registerCompletionItemProvider(
        [{ language: 'html', scheme: 'file' }, { language: 'handlebars', scheme: 'file' }],
        {
          provideCompletionItems(document, position) {
            const blockConfig = vscode.workspace.getConfiguration('meteorLanguageServer.blockConditions');
            type ExtendedBlock = { type: string; label: string; propNames?: string[] };
            const extendBlocks = blockConfig.get<ExtendedBlock[]>('extend', []);
            const defaultBlockTypes = [
              { type: 'if', label: 'if' },
              { type: 'each', label: 'each' },
              { type: 'unless', label: 'unless' },
              { type: 'with', label: 'with' }
            ];
            const blockTypesMap = new Map<string, { type: string; label: string; propNames?: string[] }>();
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
    const blockRegex = new RegExp(`\\{\\{\\s*(#${blockType}|\\/${blockType})(?:\\s+([^}]*)?)?\\s*\\}\\}`, 'g');
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
  if (configColor) { return configColor; }
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
              contentText: `// ${label}${propText} => ${condition}`
            }
          }
        });
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
