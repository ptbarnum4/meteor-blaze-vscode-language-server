import { Location } from 'vscode-languageserver/node';
import { CurrentConnectionConfig } from '../../../types';
import findParameterDefinition from './findParameterDefinition';
import findTemplateDefinition from './findTemplateDefinition';

// Helper function to handle template inclusion navigation
const handleTemplateInclusionDefinition = async (
  text: string,
  offset: number,
  word: string,
  currentDir: string,
  currentFileUri: string,
  connection: any,
  config: CurrentConnectionConfig
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

  // Determine if we're on the left or right side of an equals sign
  // Left side (parameter name) = navigates to child template usage
  // Right side (value) = navigates to parent template helper/data
  const isLeftSideOfEquals = isOnLeftSideOfEquals(beforeCursor, afterCursor, word);

  if (isLeftSideOfEquals) {
    // If the word is on the left side of =, navigate to the parameter usage in child template
    return await findParameterDefinition(word, templateName, currentDir, currentFileUri, connection, config);
  }

  // If on the right side of =, return null to let parent template helper lookup continue
  return null;
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

/**
 * Determines if the cursor position is on the left side of an equals sign in a parameter assignment.
 * In template parameters like "paramName=value", the left side is the parameter name that
 * references the child template's data, while the right side is the value from the parent template.
 *
 * @param beforeCursor - Text before the cursor position
 * @param afterCursor - Text after the cursor position
 * @param word - The word at the cursor position
 * @returns True if on the left side of =, false otherwise
 */
function isOnLeftSideOfEquals(beforeCursor: string, afterCursor: string, word: string): boolean {
  // Check if the word ends right before the cursor and is followed by =
  // This handles: "title|=" where | is cursor position
  const endsWithWord = beforeCursor.endsWith(word);
  const startsWithEquals = afterCursor.trimStart().startsWith('=');

  if (endsWithWord && startsWithEquals) {
    return true;
  }

  // Check if we're in the middle of the word that's before =
  // This handles: "ti|tle=" where | is cursor position
  const afterCursorMatch = afterCursor.match(/^[a-zA-Z0-9_]*\s*=/);
  if (afterCursorMatch) {
    return true;
  }

  // Check if there's an equals sign immediately before the word
  // This handles: "=title|" where | is cursor position
  const beforeWordMatch = beforeCursor.match(/=\s*[a-zA-Z0-9_]*$/);
  if (beforeWordMatch) {
    return false; // Right side of equals
  }

  // Check if we're after the equals sign
  // This handles: "=|title" where | is cursor position
  if (afterCursor.trimStart().startsWith(word) && beforeCursor.trimEnd().endsWith('=')) {
    return false; // Right side of equals
  }

  // Default to false (not in a clear parameter assignment context)
  return false;
}

export default handleTemplateInclusionDefinition;
