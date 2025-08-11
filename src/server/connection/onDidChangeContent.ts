import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocumentChangeEvent } from 'vscode-languageserver/node';

import { CurrentConnectionConfig } from '../../types';
import { analyzeNeighboringFiles } from '../helpers/analyzeNeighboringFiles';
import { containsMeteorTemplates } from '../helpers/containsMeteorTemplates';
import { validateTextDocument } from '../helpers/validateTextDocument';

const onDidChangeContent = (config: CurrentConnectionConfig) => {
  return (change: TextDocumentChangeEvent<TextDocument>) => {
    const connection = config.connection;
    connection.console.log(`🔥🔥🔥 CUSTOM FILE CHANGE HANDLER RUNNING 🔥🔥🔥`);
    connection.console.log(`[DEBUG] File change event received for: ${change.document.uri}`);
    connection.console.log(`[DEBUG] Document language ID: ${change.document.languageId}`);
    connection.console.log(`[DEBUG] Document content length: ${change.document.getText().length}`);

    // Support both 'html' and 'handlebars' language IDs
    const isHtmlOrHandlebars = ['html', 'handlebars'].includes(change.document.languageId);
    connection.console.log(`[DEBUG] Is HTML or Handlebars: ${isHtmlOrHandlebars}`);

    const hasTemplates = containsMeteorTemplates(change.document);
    connection.console.log(`[DEBUG] Contains Meteor templates: ${hasTemplates}`);

    if (hasTemplates) {
      connection.console.log(`[DEBUG] Processing template file: ${change.document.uri}`);
    }

    validateTextDocument(config, change.document);
    analyzeNeighboringFiles(config.fileAnalysis, change.document);
  };
};

export default onDidChangeContent;
