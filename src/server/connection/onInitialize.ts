import {
    InitializeParams,
    InitializeResult,
    TextDocumentSyncKind
} from 'vscode-languageserver/node';

import { CurrentConnectionConfig } from '/types';

const onInitialize = (config: CurrentConnectionConfig) => {
  return (params: InitializeParams) => {
    const connection = config.connection;
    connection.console.log('🚀🚀🚀 METEOR LANGUAGE SERVER STARTING WITH NEW DEBUG CODE 🚀🚀🚀');
    connection.console.log('Meteor Language Server initializing...');
    const capabilities = params.capabilities;

    config.hasConfigurationCapability = !!(
      capabilities.workspace && !!capabilities.workspace.configuration
    );
    config.hasWorkspaceFolderCapability = !!(
      capabilities.workspace && !!capabilities.workspace.workspaceFolders
    );
    config.hasDiagnosticRelatedInformationCapability = !!(
      capabilities.textDocument &&
      capabilities.textDocument.publishDiagnostics &&
      capabilities.textDocument.publishDiagnostics.relatedInformation
    );

    const result: InitializeResult = {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        completionProvider: {
          resolveProvider: true,
          triggerCharacters: ['{', '"', "'", '.', ' ', '}']
        },
        hoverProvider: true,
        definitionProvider: true
      }
    };

    if (config.hasWorkspaceFolderCapability) {
      result.capabilities.workspace = {
        workspaceFolders: {
          supported: true
        }
      };
    }

    connection.console.log('Meteor Language Server capabilities configured');
    return result;
  };
};

export default onInitialize;
