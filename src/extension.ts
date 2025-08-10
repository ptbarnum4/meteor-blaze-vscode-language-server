import * as vscode from 'vscode';
import * as path from 'path';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind
} from 'vscode-languageclient/node';

let client: LanguageClient;

export function activate(context: vscode.ExtensionContext) {
  console.log('Meteor Language Server extension activating...');

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
    'Meteor Language Server',
    serverOptions,
    clientOptions
  );

  // Register restart command
  const restartCommand = vscode.commands.registerCommand('meteor-blaze-vscode-language-server.restart', async () => {
    if (client) {
      await client.stop();
      client.start();
      vscode.window.showInformationMessage('Meteor Language Server restarted');
    }
  });

  context.subscriptions.push(restartCommand);

  // Start the client. This will also launch the server
  client.start();

  // Log activation
  console.log('Meteor Language Server is now active!');
  vscode.window.showInformationMessage('Meteor Language Server activated!');
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
