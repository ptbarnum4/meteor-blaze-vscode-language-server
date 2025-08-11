import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocumentChangeEvent } from 'vscode-languageserver/node';

import { CurrentConnectionConfig } from '/types';


const onDidClose = (config: CurrentConnectionConfig) => {
  return (event: TextDocumentChangeEvent<TextDocument>) => {
    config.documentSettings.delete(event.document.uri);
  };
};

export default onDidClose;
