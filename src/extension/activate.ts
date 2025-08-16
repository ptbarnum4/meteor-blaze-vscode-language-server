import path from 'path';
import vscode from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind
} from 'vscode-languageclient/node';

import createCompletionItemProvider from './helpers/activate/createCompletionItemProvider';
import createSemanticProvider from './helpers/activate/createSemanticProvider';
import promptIfNoConfigsSet from './helpers/activate/promptIfNoConfigsSet';
import {
  createBlockConditionDecorationType,
  updateBlockConditionDecorations,
  updateDecorationType
} from './helpers/blockConditions/decorationType';
import { isMeteorProject } from './helpers/meteor';
import { ExtensionConfig } from '/types';

const ACTIVATE_CONFIGS = {
  LEGEND: [
    'delimiter',
    'blazeBlockHash',
    'blazeBlockName',
    'blazeBlockSingleArg',
    'blazeBlockFirstArg',
    'blazeBlockArgs',
    'blazeBlockIn',
    'blazeExpression'
  ],
  SELECTORS: ['html', 'handlebars', 'javascript', 'typescript'],
  FILE_EVENT_PATHS: [
    '**/.meteor/packages',
    '**/.meteor/versions',
    '**/package.js',
    '**/packages/**',
    '**/*.html',
    '**/*.hbs',
    '**/*.css',
    '**/*.less',
    '**/*.js',
    '**/*.ts'
  ]
};

export const createActivate = (extConfig: ExtensionConfig) => {
  return async (context: vscode.ExtensionContext) => {
    // Check if this is a Meteor project
    const hasMeteorProject = await isMeteorProject();
    if (!hasMeteorProject) {
      return;
    }
    console.info('Meteor/Blaze Language Server: Extension activation started...');
    // Register semantic token provider for Blaze blocks and expressions
    const legend = new vscode.SemanticTokensLegend(ACTIVATE_CONFIGS.LEGEND);
    const semanticProvider = createSemanticProvider(legend);

    const documentSelector: vscode.DocumentSelector[] = ACTIVATE_CONFIGS.SELECTORS.map(
      language =>
        ({
          language,
          scheme: 'file'
        } as vscode.DocumentSelector)
    );

    for (const selector of documentSelector) {
      context.subscriptions.push(
        vscode.languages.registerDocumentSemanticTokensProvider(selector, semanticProvider, legend)
      );
    }
    promptIfNoConfigsSet();
    console.info('Meteor/Blaze HTML Language Server extension activating...');

    // Initialize decoration type with current settings
    extConfig.blockConditionDecorationType = createBlockConditionDecorationType();

    // The server is implemented in node
    const serverModule = context.asAbsolutePath(path.join('dist', 'server.js'));

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
      documentSelector: documentSelector as string[],
      synchronize: {
        // Notify the server about file changes to Meteor-related files
        fileEvents: ACTIVATE_CONFIGS.FILE_EVENT_PATHS.map(pattern =>
          vscode.workspace.createFileSystemWatcher(pattern)
        )
      }
    };

    // Create the language client and start the client
    console.info('Meteor/Blaze Language Server: Creating language client...');
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
    console.info('Meteor/Blaze Language Server: Starting language client...');
    extConfig.client.start();
    console.info('Meteor/Blaze Language Server: Language client started.');

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
    const workspaceFoldersChangeDisposable = vscode.workspace.onDidChangeWorkspaceFolders(
      async _event => {
        // If a folder with .meteor was added or removed, we might need to restart the extension
        const hasMeteorProject = await isMeteorProject();
        if (hasMeteorProject && !extConfig.client) {
          // Became a Meteor project, but this would require reactivating the extension
          vscode.window.showInformationMessage(
            'Meteor/Blaze Language Server: .meteor directory detected. Please reload the window to activate the extension.'
          );
        }
      }
    );

    // Register CompletionItemProvider for propNames inside block conditions
    const completionItemProvider = createCompletionItemProvider();

    context.subscriptions.push(
      restartCommand,
      disposable,
      activeEditorDisposable,
      configDisposable,
      workspaceFoldersChangeDisposable,
      completionItemProvider,
    );

    // Log activation
    console.info('Meteor/Blaze HTML Language Server is now active for Meteor project!');
    vscode.window.showInformationMessage(
      'Meteor/Blaze HTML Language Server activated for Meteor project!'
    );

  };
};
