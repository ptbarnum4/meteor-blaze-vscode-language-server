import {
  DocumentFormattingParams,
  DocumentOnTypeFormattingParams,
  DocumentRangeFormattingParams,
  Range,
  TextEdit
} from 'vscode-languageserver/node';

import { CurrentConnectionConfig } from '../../types';
import { containsMeteorTemplates } from '../helpers/containsMeteorTemplates';

/**
 * Applies text edits to a document text and returns the modified text
 */
function applyTextEdits(text: string, edits: TextEdit[]): string {
  // Sort edits by position (from end to start to avoid offset issues)
  const sortedEdits = [...edits].sort((a, b) => {
    if (a.range.start.line !== b.range.start.line) {
      return b.range.start.line - a.range.start.line;
    }
    return b.range.start.character - a.range.start.character;
  });

  const lines = text.split('\n');

  for (const edit of sortedEdits) {
    const startLine = edit.range.start.line;
    const startChar = edit.range.start.character;
    const endLine = edit.range.end.line;
    const endChar = edit.range.end.character;

    if (startLine === endLine) {
      // Single line edit
      const line = lines[startLine];
      lines[startLine] = line.substring(0, startChar) + edit.newText + line.substring(endChar);
    } else {
      // Multi-line edit
      const firstLine = lines[startLine].substring(0, startChar);
      const lastLine = lines[endLine].substring(endChar);
      const newLines = edit.newText.split('\n');

      // Replace lines
      lines.splice(
        startLine,
        endLine - startLine + 1,
        firstLine + newLines[0],
        ...newLines.slice(1, -1),
        newLines[newLines.length - 1] + lastLine
      );
    }
  }

  return lines.join('\n');
}

/**
 * Represents a template invocation found in the document
 */
interface TemplateInvocation {
  /** The name of the template being invoked */
  templateName: string;
  /** The full range of the invocation */
  range: Range;
  /** The parameters in the invocation */
  parameters: Array<{ name: string; value: string }>;
  /** Whether the invocation spans multiple lines */
  isMultiLine: boolean;
  /** The original text of the invocation */
  originalText: string;
  /** The indentation of the opening {{ */
  baseIndentation: string;
}

/**
 * Finds all template invocations in the document
 */
function findTemplateInvocations(text: string): TemplateInvocation[] {
  const invocations: TemplateInvocation[] = [];
  const lines = text.split('\n');

  // Regex to match template invocations: {{> templateName ...}}
  // This needs to handle multi-line invocations
  const invocationPattern = /\{\{\s*>\s*([a-zA-Z0-9_]+)/g;
  let match: RegExpExecArray | null;

  while ((match = invocationPattern.exec(text)) !== null) {
    const startOffset = match.index;
    const templateName = match[1];

    // Find the closing }}
    let braceDepth = 2; // Start with 2 because we've seen {{
    let endOffset = startOffset + match[0].length;
    let foundEnd = false;

    while (endOffset < text.length && !foundEnd) {
      const char = text[endOffset];
      const nextChar = text[endOffset + 1];

      if (char === '{' && nextChar === '{') {
        braceDepth += 2;
        endOffset += 2;
        continue;
      } else if (char === '}' && nextChar === '}') {
        braceDepth -= 2;
        if (braceDepth === 0) {
          endOffset += 2;
          foundEnd = true;
          break;
        }
        endOffset += 2;
        continue;
      }

      endOffset++;
    }

    if (!foundEnd) {
      continue; // Skip incomplete invocations
    }

    const originalText = text.substring(startOffset, endOffset);
    const isMultiLine = originalText.includes('\n');

    // Calculate the start and end positions
    let currentOffset = 0;
    let startLine = 0;
    let startChar = 0;
    let endLine = 0;
    let endChar = 0;

    for (let i = 0; i < lines.length; i++) {
      const lineLength = lines[i].length + 1; // +1 for newline
      if (currentOffset + lineLength > startOffset && startLine === 0) {
        startLine = i;
        startChar = startOffset - currentOffset;
      }
      if (currentOffset + lineLength >= endOffset) {
        endLine = i;
        endChar = endOffset - currentOffset;
        break;
      }
      currentOffset += lineLength;
    }

    // Get base indentation (indentation of the line with {{)
    const baseIndentation = lines[startLine].substring(0, startChar).match(/^\s*/)?.[0] || '';

    // Parse parameters - handles quoted strings, unquoted values, and standalone params
    const parameters: Array<{ name: string; value: string }> = [];

    // Remove the template invocation syntax to focus on parameters
    const paramsText = originalText
      .replace(/\{\{\s*>\s*[a-zA-Z0-9_]+\s*/, '')
      .replace(/\}\}\s*$/, '');

    // Parse parameters manually to handle nested parentheses correctly
    let i = 0;
    while (i < paramsText.length) {
      // Skip whitespace
      while (i < paramsText.length && /\s/.test(paramsText[i])) {
        i++;
      }
      if (i >= paramsText.length) {break;}

      // Parse parameter name
      const nameStart = i;
      while (i < paramsText.length && /[a-zA-Z_$0-9]/.test(paramsText[i])) {
        i++;
      }
      if (i === nameStart) {break;} // No valid name found
      const name = paramsText.substring(nameStart, i);

      // Skip whitespace after name
      while (i < paramsText.length && /\s/.test(paramsText[i])) {
        i++;
      }

      // Check if there's a value (=)
      if (i < paramsText.length && paramsText[i] === '=') {
        i++; // Skip =

        // Skip whitespace after =
        while (i < paramsText.length && /\s/.test(paramsText[i])) {
          i++;
        }

        let value = '';

        // Parse the value
        if (i < paramsText.length) {
          const valueStart = i;

          if (paramsText[i] === '"') {
            // Double-quoted string
            i++; // Skip opening quote
            while (i < paramsText.length && paramsText[i] !== '"') {
              if (paramsText[i] === '\\' && i + 1 < paramsText.length) {
                i += 2; // Skip escaped character
              } else {
                i++;
              }
            }
            if (i < paramsText.length) {i++;} // Skip closing quote
            value = paramsText.substring(valueStart, i);
          } else if (paramsText[i] === "'") {
            // Single-quoted string
            i++; // Skip opening quote
            while (i < paramsText.length && paramsText[i] !== "'") {
              if (paramsText[i] === '\\' && i + 1 < paramsText.length) {
                i += 2; // Skip escaped character
              } else {
                i++;
              }
            }
            if (i < paramsText.length) {i++;} // Skip closing quote
            value = paramsText.substring(valueStart, i);
          } else if (paramsText[i] === '(') {
            // Helper expression with parentheses - need to track nesting
            let parenDepth = 0;
            while (i < paramsText.length) {
              if (paramsText[i] === '(') {
                parenDepth++;
                i++;
              } else if (paramsText[i] === ')') {
                parenDepth--;
                i++;
                if (parenDepth === 0) {break;}
              } else {
                i++;
              }
            }
            value = paramsText.substring(valueStart, i);
          } else {
            // Unquoted value without parentheses - read until whitespace or end
            while (i < paramsText.length && !/\s/.test(paramsText[i])) {
              i++;
            }
            value = paramsText.substring(valueStart, i);
          }
        }

        parameters.push({ name, value });
      } else {
        // Standalone parameter without value
        parameters.push({ name, value: '' });
      }
    }

    invocations.push({
      templateName,
      range: {
        start: { line: startLine, character: startChar },
        end: { line: endLine, character: endChar }
      },
      parameters,
      isMultiLine,
      originalText,
      baseIndentation
    });
  }

  return invocations;
}

/**
 * Formats a template invocation with proper indentation
 */
function formatTemplateInvocation(
  invocation: TemplateInvocation,
  indentSize: number,
  useTabs: boolean
): string {
  const indent = useTabs ? '\t' : ' '.repeat(indentSize);
  const baseIndent = invocation.baseIndentation;
  const paramCount = invocation.parameters.length;

  // Format inline for 0-1 parameters
  if (paramCount === 0) {
    return `{{> ${invocation.templateName} }}`;
  }

  if (paramCount === 1) {
    const param = invocation.parameters[0];
    const paramStr = param.value ? `${param.name}=${param.value}` : param.name;
    return `{{> ${invocation.templateName} ${paramStr} }}`;
  }

  // Format multi-line for 2+ parameters
  let formatted = `{{> ${invocation.templateName}`;

  // Add each parameter on its own line with proper indentation
  for (const param of invocation.parameters) {
    const paramStr = param.value ? `${param.name}=${param.value}` : param.name;
    formatted += `\n${baseIndent}${indent}${paramStr}`;
  }

  // Add closing braces on a new line, aligned with opening
  formatted += `\n${baseIndent}}}`;

  return formatted;
}

/**
 * Handler for document formatting
 */
export const onDocumentFormatting = (config: CurrentConnectionConfig) => {
  const { documents, connection } = config;

  return async (params: DocumentFormattingParams): Promise<TextEdit[]> => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return [];
    }

    // Only format Meteor template files
    const uri = document.uri;
    const isHtmlFile = /\.(html|htm|meteor)$/i.test(uri);
    if (!isHtmlFile || !containsMeteorTemplates(document)) {
      return [];
    }

    // Get formatting settings
    const settings = await config.connection.workspace.getConfiguration({
      scopeUri: params.textDocument.uri,
      section: 'meteorLanguageServer'
    });

    const formattingEnabled = settings?.formatting?.enabled !== false;
    const baseFormatter = settings?.formatting?.baseFormatter;

    if (!formattingEnabled) {
      return [];
    }

    let workingText = document.getText();
    let baseEdits: TextEdit[] = [];

    // If base formatter is specified, request the client to apply it first
    if (baseFormatter) {
      try {
        connection.console.log(`Requesting base formatter '${baseFormatter}' for ${params.textDocument.uri}`);

        const result = await connection.sendRequest<TextEdit[] | null>('meteor/applyBaseFormatter', {
          uri: params.textDocument.uri,
          formatterId: baseFormatter,
          options: params.options
        });

        if (result && Array.isArray(result)) {
          baseEdits = result;
          connection.console.log(`Base formatter returned ${baseEdits.length} edits`);
          // Apply base formatter edits to get updated text
          workingText = applyTextEdits(workingText, baseEdits);
        } else {
          connection.console.log(`Base formatter returned no edits`);
        }
      } catch (error) {
        // If base formatter fails, continue with just Meteor formatting
        connection.console.warn(`Failed to invoke base formatter '${baseFormatter}': ${error}`);
      }
    }

    const indentSize = params.options.tabSize || 2;
    const useTabs = params.options.insertSpaces === false;

    // Find all template invocations in the (potentially updated) text
    const invocations = findTemplateInvocations(workingText);
    const meteorEdits: TextEdit[] = [];

    for (const invocation of invocations) {
      const formattedText = formatTemplateInvocation(invocation, indentSize, useTabs);

      // Only add edit if the text actually changed
      if (formattedText !== invocation.originalText) {
        meteorEdits.push({
          range: invocation.range,
          newText: formattedText
        });
      }
    }

    // If we have base edits, we need to return edits that transform the original
    // document to the final state. We can do this by applying both sets of edits
    // to the original text and creating a single edit that replaces everything.
    if (baseEdits.length > 0 && meteorEdits.length > 0) {
      // Apply Meteor edits on top of the already-modified text
      const finalText = applyTextEdits(workingText, meteorEdits);

      // Return a single edit that replaces the entire document
      const originalLines = document.getText().split('\n');
      return [
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: originalLines.length - 1, character: originalLines[originalLines.length - 1].length }
          },
          newText: finalText
        }
      ];
    }

    // If we only have base edits, return those
    if (baseEdits.length > 0) {
      return baseEdits;
    }

    // If we only have Meteor edits, return those
    return meteorEdits;
  };
};

/**
 * Handler for range formatting
 */
export const onDocumentRangeFormatting = (config: CurrentConnectionConfig) => {
  const { documents } = config;

  return async (params: DocumentRangeFormattingParams): Promise<TextEdit[]> => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return [];
    }

    // Only format Meteor template files
    const uri = document.uri;
    const isHtmlFile = /\.(html|htm|meteor)$/i.test(uri);
    if (!isHtmlFile || !containsMeteorTemplates(document)) {
      return [];
    }

    // Get formatting settings
    const settings = await config.connection.workspace.getConfiguration({
      scopeUri: params.textDocument.uri,
      section: 'meteorLanguageServer'
    });

    const formattingEnabled = settings?.formatting?.enabled !== false;

    if (!formattingEnabled) {
      return [];
    }

    const indentSize = params.options.tabSize || 2;
    const useTabs = params.options.insertSpaces === false;

    const text = document.getText();
    const edits: TextEdit[] = [];

    // Find all template invocations
    const invocations = findTemplateInvocations(text);

    // Filter invocations that are within the specified range
    for (const invocation of invocations) {
      const isInRange =
        invocation.range.start.line >= params.range.start.line &&
        invocation.range.end.line <= params.range.end.line;

      if (isInRange) {
        const formattedText = formatTemplateInvocation(invocation, indentSize, useTabs);

        // Only add edit if the text actually changed
        if (formattedText !== invocation.originalText) {
          edits.push({
            range: invocation.range,
            newText: formattedText
          });
        }
      }
    }

    return edits;
  };
};

/**
 * Handler for on-type formatting (triggered when typing Enter or })
 */
export const onDocumentOnTypeFormatting = (config: CurrentConnectionConfig) => {
  const { documents } = config;

  return async (params: DocumentOnTypeFormattingParams): Promise<TextEdit[]> => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return [];
    }

    // Only format Meteor template files
    const uri = document.uri;
    const isHtmlFile = /\.(html|htm|meteor)$/i.test(uri);
    if (!isHtmlFile || !containsMeteorTemplates(document)) {
      return [];
    }

    // Get formatting settings
    const settings = await config.connection.workspace.getConfiguration({
      scopeUri: params.textDocument.uri,
      section: 'meteorLanguageServer'
    });

    const formattingEnabled = settings?.formatting?.enabled !== false;

    if (!formattingEnabled) {
      return [];
    }

    const indentSize = params.options.tabSize || 2;
    const useTabs = params.options.insertSpaces === false;

    const text = document.getText();
    const position = params.position;

    // Find if we're inside a template invocation
    const offset = document.offsetAt(position);
    const textBeforeCursor = text.substring(0, offset);

    // Check if we're inside a template invocation
    const templateMatch = textBeforeCursor.match(/\{\{\s*>\s*([a-zA-Z0-9_]+)(?:[^{}])*$/);
    if (!templateMatch) {
      return [];
    }

    // If user typed Enter, add proper indentation for the next line
    if (params.ch === '\n') {
      const indent = useTabs ? '\t' : ' '.repeat(indentSize);

      // Get the base indentation of the template invocation
      const lines = textBeforeCursor.split('\n');
      const currentLine = lines[lines.length - 2]; // Line before the newline
      const baseIndent = currentLine.match(/^\s*/)?.[0] || '';

      // Check if we're likely adding a parameter (not closing the invocation)
      const textAfterCursor = text.substring(offset);
      const hasClosing = textAfterCursor.match(/^\s*\}\}/);

      if (!hasClosing) {
        // Add indentation for parameter
        return [
          {
            range: {
              start: position,
              end: position
            },
            newText: `${baseIndent}${indent}`
          }
        ];
      }
    }

    // If user typed }}, check if we need to format the whole invocation
    if (params.ch === '}') {
      const textAfterCursor = text.substring(offset);
      if (textAfterCursor.startsWith('}')) {
        // User just completed }} - format the entire invocation
        const invocations = findTemplateInvocations(text);

        // Find the invocation that contains this position
        for (const invocation of invocations) {
          const containsPosition =
            (invocation.range.end.line === position.line &&
              invocation.range.end.character >= position.character - 1) ||
            (invocation.range.end.line === position.line + 1 &&
              invocation.range.end.character === 0);

          if (containsPosition) {
            const formattedText = formatTemplateInvocation(invocation, indentSize, useTabs);

            if (formattedText !== invocation.originalText) {
              return [
                {
                  range: invocation.range,
                  newText: formattedText
                }
              ];
            }
          }
        }
      }
    }

    return [];
  };
};
