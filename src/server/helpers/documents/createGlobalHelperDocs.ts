import path from 'path';

import { MarkupKind } from 'vscode-languageserver';
import { Range } from 'vscode-languageserver/node';

import { GlobalHelperInfo } from '/types';

const createGlobalTemplateHelperDocs = (
  globalHelper: GlobalHelperInfo,
  word: string,
  wordRange: Range
) => {
  const hoverContent = [`**\`${word}\`** - Global Template Helper`, ``];

  // Add JSDoc description if available
  if (globalHelper.jsdoc) {
    hoverContent.push(
      '```ts\n/**\n * ' + globalHelper.jsdoc.split('\n').join('\n * ') + '\n*/\n```'
    );
    hoverContent.push(``);
  }

  // Add signature information
  if (globalHelper.signature) {
    hoverContent.push(`**Signature:** \`${globalHelper.signature}\``);
    hoverContent.push(``);
  }

  // Add return type if available
  if (globalHelper.returnType) {
    hoverContent.push(`**Returns:** \`${globalHelper.returnType}\``);
    hoverContent.push(``);
  }

  // Add parameters if available
  if (globalHelper.parameters) {
    hoverContent.push(`**Parameters:** ${globalHelper.parameters}`);
    hoverContent.push(``);
  }

  hoverContent.push(`**Source:** ${path.basename(globalHelper.filePath)}`);
  hoverContent.push(``);

  const paramNames = (globalHelper.parameters ?? '')
    .split(',')
    .map(p => p.split(':')?.[0].trim())
    .filter(Boolean)
    .join(' ');

  hoverContent.push(`**Usage:** \`{{${word}${paramNames ? ` ${paramNames}` : ''}}}\``);

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: hoverContent.join('\n')
    },
    range: wordRange
  };
};

export default createGlobalTemplateHelperDocs;
