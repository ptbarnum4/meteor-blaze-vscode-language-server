import { DidChangeConfigurationParams } from 'vscode-languageserver/node';

import { CurrentConnectionConfig, LanguageServerSettings } from '../../types';
import { validateTextDocument } from '../helpers/validateTextDocument';

const onDidChangeConfiguration = (config: CurrentConnectionConfig) => {
  return (change: DidChangeConfigurationParams) => {
    if (config.hasConfigurationCapability) {
      config.documentSettings.clear();
    } else {
      config.globalSettings = <LanguageServerSettings>(
        (change.settings.meteorLanguageServer || { maxNumberOfProblems: 1000 })
      );
    }

    config.documents.all().forEach(doc => validateTextDocument(config, doc));
  };
};

export default onDidChangeConfiguration;
