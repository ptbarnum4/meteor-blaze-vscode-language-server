import { TextDocument } from 'vscode-languageserver-textdocument';

// Check if HTML file contains Meteor templates
export const containsMeteorTemplates = (document: TextDocument): boolean => {
  // Only validate files with appropriate extensions for Meteor templates
  const uri = document.uri;
  const validExtensions = ['.html', '.htm', '.meteor'];
  const hasValidExtension = validExtensions.some(ext => uri.endsWith(ext));
  
  // Exclude test files and other non-template files
  const isTestFile = /\.(test|spec)\.(ts|js|html)$/i.test(uri);
  const isConfigFile = /\.(json|jsonc|yaml|yml|toml|ini|cfg|config)$/i.test(uri);
  const isCodeFile = /\.(ts|js|tsx|jsx|py|java|c|cpp|cs|rb|php|go|rs)$/i.test(uri);
  
  if (isTestFile || isConfigFile || isCodeFile || !hasValidExtension) {
    return false;
  }

  const text = document.getText();
  const hasTemplates = /<template\s+name=["'][^"']+["'][^>]*>/.test(text);

  return hasTemplates;
};
