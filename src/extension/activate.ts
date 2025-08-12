import path from 'path';
import vscode from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind
} from 'vscode-languageclient/node';

import {
  createBlockConditionDecorationType,
  updateBlockConditionDecorations,
  updateDecorationType
} from './helpers/blockConditions/decorationType';
import { isMeteorProject } from './helpers/meteor';
import { ExtensionConfig } from '/types';


export const createActivate = (extConfig: ExtensionConfig) => {
  return (context: vscode.ExtensionContext) => {
    // Check if this is a Meteor project
    if (!isMeteorProject()) {
      console.log(
        'Meteor/Blaze Language Server: No .meteor directory found. Extension will not activate.'
      );
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
              const elseStart = leadingWhitespace
                ? contentStart + leadingWhitespace[0].length
                : contentStart;
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
    extConfig.blockConditionDecorationType = createBlockConditionDecorationType();

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
    extConfig.client = new LanguageClient(
      'meteorLanguageServer',
      'Meteor/Blaze HTML Language Server',
      serverOptions,
      clientOptions
    );

    // Register restart command
    const restartCommand = vscode.commands.registerCommand(
      'meteor-blaze-vscode-language-server.restart',
      async () => {
        if (!extConfig.client) {
          return;
        }
        await extConfig.client.stop();
        extConfig.client.start();
        vscode.window.showInformationMessage('Meteor/Blaze HTML Language Server restarted');
      }
    );

    context.subscriptions.push(restartCommand);

    // Start the client. This will also launch the server
    extConfig.client.start();

    // Set up document change listener for inline block-condition hints
    const disposable = vscode.workspace.onDidChangeTextDocument(event => {
      if (event.document.languageId === 'html' || event.document.languageId === 'handlebars') {
        updateBlockConditionDecorations(extConfig, event.document);
      }
    });

    // Set up active editor change listener
    const activeEditorDisposable = vscode.window.onDidChangeActiveTextEditor(editor => {
      if (
        editor &&
        (editor.document.languageId === 'html' || editor.document.languageId === 'handlebars')
      ) {
        updateBlockConditionDecorations(extConfig, editor.document);
      }
    });

    // Update decorations for current active editor
    if (vscode.window.activeTextEditor) {
      updateBlockConditionDecorations(extConfig, vscode.window.activeTextEditor.document);
    }

    // Set up configuration change listener
    const configDisposable = vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('meteorLanguageServer.blockConditions')) {
        updateDecorationType(extConfig);
      }
    });

    // Set up workspace folder change listener to handle dynamic addition/removal of Meteor projects
    const workspaceFoldersChangeDisposable = vscode.workspace.onDidChangeWorkspaceFolders(event => {
      // If a folder with .meteor was added or removed, we might need to restart the extension
      const hasMeteorProject = isMeteorProject();
      if (!hasMeteorProject && extConfig.client) {
        // No longer a Meteor project, deactivate
        vscode.window.showInformationMessage(
          'Meteor/Blaze Language Server: No .meteor directory found. Deactivating extension.'
        );
        extConfig.client.stop();
      } else if (hasMeteorProject && !extConfig.client) {
        // Became a Meteor project, but this would require reactivating the extension
        vscode.window.showInformationMessage(
          'Meteor/Blaze Language Server: .meteor directory detected. Please reload the window to activate the extension.'
        );
      }
    });

    context.subscriptions.push(
      restartCommand,
      disposable,
      activeEditorDisposable,
      configDisposable,
      workspaceFoldersChangeDisposable
    );

    // Log activation
    console.log('Meteor/Blaze HTML Language Server is now active for Meteor project!');
    vscode.window.showInformationMessage(
      'Meteor/Blaze HTML Language Server activated for Meteor project!'
    );

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
  };
};
