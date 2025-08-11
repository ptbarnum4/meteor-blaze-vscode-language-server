import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, Range } from 'vscode-languageserver/node';

export const getWordRangeAtPosition = (
  document: TextDocument,
  position: Position
): Range | null => {
  const text = document.getText();
  const offset = document.offsetAt(position);

  let start = offset;
  let end = offset;

  // Match valid Blaze helper characters: #, @, letters, numbers, and underscores
  const validChar = /[#@a-zA-Z0-9_]/;

  while (start > 0 && validChar.test(text.charAt(start - 1))) {
    start--;
  }

  while (end < text.length && validChar.test(text.charAt(end))) {
    end++;
  }

  if (start === end) {
    return null;
  }

  return {
    start: document.positionAt(start),
    end: document.positionAt(end)
  };
};
