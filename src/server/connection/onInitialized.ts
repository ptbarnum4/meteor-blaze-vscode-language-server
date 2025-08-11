import { DidChangeConfigurationNotification, InitializedParams } from 'vscode-languageserver/node';

import { CurrentConnectionConfig } from '/types';

const onInitialized = (config: CurrentConnectionConfig) => {
  return (_params: InitializedParams) => {
    const connection = config.connection;
    if (config.hasConfigurationCapability) {
      connection.client.register(DidChangeConfigurationNotification.type, undefined);
    }
    if (config.hasWorkspaceFolderCapability) {
      connection.workspace.onDidChangeWorkspaceFolders(_event => {
        connection.console.log('Workspace folder change event received.');
      });
    }
  };
};
export default onInitialized;
