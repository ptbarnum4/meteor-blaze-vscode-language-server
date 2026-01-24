import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocumentChangeEvent } from 'vscode-languageserver/node';

import { analyzeNeighboringFiles } from '../helpers/analyzeNeighboringFiles';
import { containsMeteorTemplates } from '../helpers/containsMeteorTemplates';
import { validateTextDocument } from '../helpers/validateTextDocument';
import { CurrentConnectionConfig } from '/types';

export const createOnDidChangeContent = (config: CurrentConnectionConfig) => {
  return (change: TextDocumentChangeEvent<TextDocument>) => {
    const document = change.document;
    if (!document) {
      return;
    }

    const hasTemplates = containsMeteorTemplates(document);

    if (hasTemplates) {
      validateTextDocument(config, document);
      analyzeNeighboringFiles(config.fileAnalysis, document);
    }
  };
};

const onDidChangeContent = createOnDidChangeContent;
export default onDidChangeContent;
