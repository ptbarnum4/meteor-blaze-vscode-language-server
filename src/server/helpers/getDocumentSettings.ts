import { CurrentConnectionConfig, LanguageServerSettings } from '../../types';

const getDocumentSettings = (
  config: CurrentConnectionConfig,
  resource: string
): Thenable<LanguageServerSettings> => {
  if (!config.hasConfigurationCapability) {
    return Promise.resolve(config.globalSettings);
  }
  let result = config.documentSettings.get(resource);
  if (!result) {
    result = config.connection.workspace.getConfiguration({
      scopeUri: resource,
      section: 'meteorLanguageServer'
    });
    config.documentSettings.set(resource, result);
  }
  return result;
};

export default getDocumentSettings;
