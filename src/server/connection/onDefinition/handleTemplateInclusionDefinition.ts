import { Location } from 'vscode-languageserver/node';
import findParameterDefinition from './findParameterDefinition';
import findTemplateDefinition from './findTemplateDefinition';

// Helper function to handle template inclusion navigation
const handleTemplateInclusionDefinition = async (
  text: string,
  offset: number,
  word: string,
  currentDir: string,
  connection: any
): Promise<Location[] | null> => {
  // Get text around the cursor to determine context
  const beforeCursor = text.substring(Math.max(0, offset - 200), offset);
  const afterCursor = text.substring(offset, Math.min(text.length, offset + 200));
  const context = beforeCursor + afterCursor;

  // Check if we're in a template inclusion: {{> templateName}}
  const templateInclusionMatch = context.match(/\{\{\s*>\s*([a-zA-Z0-9_]+)/);

  if (templateInclusionMatch && templateInclusionMatch[1] === word) {
    // Navigate to the template definition
    return findTemplateDefinition(word, currentDir, connection);
  }

  // Check if we're in template parameters: {{> templateName param=value}}
  // Use a more flexible pattern that handles multiline parameters
  const parameterMatch = beforeCursor.match(/\{\{\s*>\s*([a-zA-Z0-9_]+)[\s\S]*$/);

  if (!parameterMatch) {
    return null;
  }
  const templateName = parameterMatch[1];

  // If the word is the template name, navigate to template
  if (word === templateName) {
    return findTemplateDefinition(templateName, currentDir, connection);
  }

  // Also check if we're still within the template inclusion by looking for the closing }}
  const fullContext = beforeCursor + afterCursor;
  const templateInclusionPattern = new RegExp(
    `\\{\\{\\s*>\\s*${templateName}[\\s\\S]*?\\}\\}`,
    'g'
  );
  const matches = [...fullContext.matchAll(templateInclusionPattern)];

  if (!checkIfInTemplateInclusion(matches, beforeCursor)) {
    return null;
  }
  // If the word is a parameter name, navigate to the parameter definition
  return await findParameterDefinition(word, templateName, currentDir, connection);
};

/**
 * Check if the current position is within a template inclusion
 * by comparing the position with the start and end of each match.
 * This is used to determine if we are still within the context of a template inclusion.
 *
 * @param matches - Array of matches from the template inclusion regex
 * @param beforeCursor - The text before the cursor position
 * @returns - True if the current position is within a template inclusion, false otherwise.
 */
function checkIfInTemplateInclusion(matches: RegExpMatchArray[], beforeCursor: string): boolean {
  for (const match of matches) {
    if (match.index === undefined) {
      continue; // Skip if match index is undefined
    }
    const matchStart = match.index;
    const matchEnd = match.index + match[0].length;
    const currentPos = beforeCursor.length; // Our position in the full context

    if (currentPos >= matchStart && currentPos <= matchEnd) {
      return true;
    }
  }

  return false;
}

export default handleTemplateInclusionDefinition;
