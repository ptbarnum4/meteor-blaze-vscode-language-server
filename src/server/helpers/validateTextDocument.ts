import { Diagnostic } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import getDocumentSettings from './getDocumentSettings';
import { CurrentConnectionConfig } from '../../types';

export const validateTextDocument = async (
  config: CurrentConnectionConfig,
  textDocument: TextDocument
): Promise<void> => {
  const settings = await getDocumentSettings(config, textDocument.uri);
  const text = textDocument.getText();
  const problems = 0;
  let m: RegExpExecArray | null;

  const diagnostics: Diagnostic[] = [];

  if (problems < settings.maxNumberOfProblems) {
    // Add validation logic here if needed
  }

  config.connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
};
