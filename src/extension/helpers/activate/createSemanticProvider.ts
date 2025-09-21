import vscode from 'vscode';
import { isWithinComment } from './isWithinComment';
import parseBlockConditions from './parseBlockConditions';
import parseBlockExpressions from './parseBlockExpressions';

const createSemanticProvider = (
  legend: vscode.SemanticTokensLegend
): vscode.DocumentSemanticTokensProvider => {
  return {
    provideDocumentSemanticTokens(document) {
      // Only provide semantic tokens for HTML template files
      const uri = document.uri.toString();
      const isHtmlFile = /\.(html|htm|meteor|hbs)$/i.test(uri);
      if (!isHtmlFile) {
        return null;
      }

      const tokensBuilder = new vscode.SemanticTokensBuilder(legend);
      const text = document.getText();


      // Only highlight Blaze expressions and block helper syntax
      const blazeRegex = /\{\{[#/]?\w+.*?\}\}/g;
      let match;

      while ((match = blazeRegex.exec(text)) !== null) {
        const start = match.index;
        const end = start + match[0].length;

        // Check if this match is within a comment
        const commentInfo = isWithinComment(text, start);
        if (commentInfo.isWithin) {
          continue; // Skip semantic tokens for content inside comments
        }


        // Only highlight Blaze expressions and block helper syntax
        const startPos = document.positionAt(start);
        const length = end - start;
        tokensBuilder.push(startPos.line, startPos.character, 2, 0); // delimiter

        if (match[0].startsWith('{{#') || match[0].startsWith('{{/')) {
          parseBlockConditions(tokensBuilder, startPos, match);
        } else {
          parseBlockExpressions(tokensBuilder, startPos, match);
        }
        // If inside a block, we don't need to highlight the delimiter again
        tokensBuilder.push(startPos.line, startPos.character + length - 2, 2, 0); // delimiter
      }
      // No tokens for any text outside of {{...}} blocks, including inside nested block helpers
      return tokensBuilder.build();
    }
  };
};

export default createSemanticProvider;



