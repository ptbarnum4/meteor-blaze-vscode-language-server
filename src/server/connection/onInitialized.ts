import { DidChangeConfigurationNotification, InitializedParams } from 'vscode-languageserver/node';

import { validateWorkspace } from '../helpers/validateWorkspace';
import { CurrentConnectionConfig } from '/types';

const onInitialized = (config: CurrentConnectionConfig) => {
  return async (_params: InitializedParams) => {
    const connection = config.connection;
    if (config.hasConfigurationCapability) {
      connection.client.register(DidChangeConfigurationNotification.type, undefined);
    }
    if (config.hasWorkspaceFolderCapability) {
      connection.workspace.onDidChangeWorkspaceFolders(_event => {
        connection.console.info('Workspace folder change event received.');
      });
    }

    // Validate all workspace files on initialization if enabled
    if (config.hasWorkspaceFolderCapability) {
      try {
        const settings = await connection.workspace.getConfiguration('meteorLanguageServer');
        const validateOnStartup = settings?.validateWorkspaceOnStartup !== false; // Default to true

        if (validateOnStartup) {
          connection.console.info('Performing initial workspace validation...');
          await validateWorkspace(config);
        } else {
          connection.console.info('Workspace validation on startup is disabled in settings.');
        }
      } catch (error) {
        connection.console.error(`Error checking validation settings: ${error}`);
      }
    }
  };
};
export default onInitialized;
