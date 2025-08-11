import { TextDocument } from 'vscode-languageserver-textdocument';

// Check if HTML file contains Meteor templates
export const containsMeteorTemplates = (document: TextDocument): boolean => {
  const text = document.getText();
  const hasTemplates = /<template\s+name=["'][^"']+["'][^>]*>/.test(text);

  return hasTemplates;
};
