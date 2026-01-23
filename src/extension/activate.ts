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
  SELECTORS: ['html', 'handlebars'],
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

// Flag to prevent recursive formatting calls
let isApplyingBaseFormatter = false;

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

    // Register validate workspace command
    const validateWorkspaceCommand = vscode.commands.registerCommand(
      'meteor-blaze-vscode-language-server.validateWorkspace',
      async () => {
        if (!extConfig.client) {
          vscode.window.showErrorMessage('Meteor/Blaze Language Server is not running');
          return;
        }

        vscode.window.showInformationMessage('Validating all templates in workspace...');

        try {
          await extConfig.client.sendRequest('workspace/validateAll');
          vscode.window.showInformationMessage('Workspace validation complete. Check the Problems panel for issues.');
        } catch (error) {
          vscode.window.showErrorMessage(`Workspace validation failed: ${error}`);
        }
      }
    );

    context.subscriptions.push(restartCommand, validateWorkspaceCommand);

    // Start the client. This will also launch the server
    console.info('Meteor/Blaze Language Server: Starting language client...');
    extConfig.client.start();
    console.info('Meteor/Blaze Language Server: Language client started.');

    // Set up request handler for base formatter execution
    extConfig.client.onRequest('meteor/applyBaseFormatter', async (params: {
      uri: string;
      formatterId: string;
      options: vscode.FormattingOptions;
    }) => {
      try {
        // Prevent recursive formatting calls
        if (isApplyingBaseFormatter) {
          console.log('Prevented recursive base formatter call');
          return null;
        }

        isApplyingBaseFormatter = true;

        const uri = vscode.Uri.parse(params.uri);

        // Get the document
        const document = await vscode.workspace.openTextDocument(uri);
        if (!document) {
          console.error(`Failed to open document for formatting: ${params.uri}`);
          isApplyingBaseFormatter = false;
          return null;
        }

        // Show document in editor (required for formatting commands to work reliably)
        await vscode.window.showTextDocument(document, { preview: false, preserveFocus: true });

        // Get editor configuration for the document
        const config = vscode.workspace.getConfiguration('editor', document);
        const originalFormatter = config.get<string | null>('defaultFormatter');

        // Determine the configuration target and whether it's language-specific
        const inspection = config.inspect<string | null>('defaultFormatter');
        let configurationTarget = vscode.ConfigurationTarget.Global;
        let isLanguageSpecific = false;

        if (inspection) {
          if (inspection.workspaceFolderLanguageValue !== undefined || inspection.workspaceFolderValue !== undefined) {
            configurationTarget = vscode.ConfigurationTarget.WorkspaceFolder;
            isLanguageSpecific = inspection.workspaceFolderLanguageValue !== undefined;
          } else if (inspection.workspaceLanguageValue !== undefined || inspection.workspaceValue !== undefined) {
            configurationTarget = vscode.ConfigurationTarget.Workspace;
            isLanguageSpecific = inspection.workspaceLanguageValue !== undefined;
          } else {
            configurationTarget = vscode.ConfigurationTarget.Global;
            isLanguageSpecific = inspection.globalLanguageValue !== undefined;
          }
        }

        try {
          // Save the original text before formatting
          const originalText = document.getText();

          // Update the default formatter temporarily
          await config.update(
            'defaultFormatter',
            params.formatterId,
            configurationTarget,
            isLanguageSpecific
          );

          // Execute format document command
          // This respects the workspace html.format.* settings
          await vscode.commands.executeCommand('editor.action.formatDocument');

          // Get the current document text after formatting
          const formattedText = document.getText();

          // Check if there were any changes
          if (formattedText === originalText) {
            return null; // No changes
          }

          // Return a single edit that replaces the entire document
          const lastLine = document.lineCount - 1;
          const lastChar = document.lineAt(lastLine).text.length;

          return [{
            range: {
              start: { line: 0, character: 0 },
              end: { line: lastLine, character: lastChar }
            },
            newText: formattedText
          }];

        } finally {
          // Restore original formatter setting
          await config.update(
            'defaultFormatter',
            originalFormatter,
            configurationTarget,
            isLanguageSpecific
          );
        }
      } catch (error) {
        console.error(`Failed to execute base formatter '${params.formatterId}':`, error);
        return null;
      } finally {
        isApplyingBaseFormatter = false;
      }
    });

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

    // Show activation message unless user has chosen to hide it for this version
    const currentVersion = context.extension.packageJSON.version;
    const lastShownVersion = context.globalState.get('activationMessageVersion', '');
    const hideActivationMessage = context.globalState.get('hideActivationMessage', false);

    // Reset hideActivationMessage if version has changed
    if (lastShownVersion !== currentVersion) {
      await context.globalState.update('hideActivationMessage', false);
      await context.globalState.update('activationMessageVersion', currentVersion);
    }

    const shouldShowMessage = !hideActivationMessage || lastShownVersion !== currentVersion;

    if (shouldShowMessage) {
      const releaseNotesUrl = `https://github.com/ptbarnum4/meteor-blaze-vscode-language-server/releases/tag/${currentVersion}`;
      const extensionUrl = 'https://marketplace.visualstudio.com/items?itemName=ptbarnum4.meteor-blaze-vscode-language-server&ssr=false#overview';

      vscode.window.showInformationMessage(
        `Meteor/Blaze HTML Language Server v${currentVersion} activated for Meteor project!`,
        "Don't show again",
        'Release Notes',
        'Extension Page'
      ).then(selection => {
        if (selection === "Don't show again") {
          context.globalState.update('hideActivationMessage', true);
        } else if (selection === 'Release Notes') {
          vscode.env.openExternal(vscode.Uri.parse(releaseNotesUrl));
        } else if (selection === 'Extension Page') {
          vscode.env.openExternal(vscode.Uri.parse(extensionUrl));
        }
      });
    }

  };
};
