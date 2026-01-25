import vscode from 'vscode';

import { codeBlock, startCase } from '../../../server/helpers/strings';
import { ExtensionConfig } from '../../../types';
import { isWithinComment } from '../activate/isWithinComment';
import { findMatchingOpenTag } from './findMatchingOpenTag';
import { formatHintText, parseHtmlAttributes } from './parseHtmlAttributes';

/**
 * Check if a line already contains a comment (HTML or Handlebars comment).
 * This helps avoid adding HTML element hints when there's already a comment on the line.
 *
 * @param text The full document text
 * @param position The position to check from
 * @returns true if the line contains a comment after the position
 */
const lineHasExistingComment = (
  text: string,
  position: vscode.Position
): boolean => {
  const lines = text.split('\n');
  if (position.line >= lines.length) {
    return false;
  }

  const lineText = lines[position.line];
  const afterPosition = lineText.substring(position.character);

  // Check for HTML comments: <!-- anything -->
  const hasHtmlComment =
    /<!--.*?-->/.test(afterPosition) || /<!--/.test(afterPosition);

  // Check for Handlebars comments: {{!-- anything --}} or {{! anything }}
  const hasHandlebarsComment =
    /\{\{!--.*?--\}\}/.test(afterPosition) ||
    /\{\{!.*?\}\}/.test(afterPosition) ||
    /\{\{!--/.test(afterPosition) ||
    /\{\{!/.test(afterPosition);

  return hasHtmlComment || hasHandlebarsComment;
};

/**
 * Update HTML element decorations in the active editor for the given document.
 * This will add hints for HTML closing tags with their id/class info.
 *
 * @param extConfig The extension configuration containing the decoration type
 * @param document The document to update decorations for
 */
export const updateHtmlElementDecorations = (
  extConfig: ExtensionConfig,
  document: vscode.TextDocument
) => {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document !== document) {
    return;
  }

  // Only provide decorations for HTML template files
  const uri = document.uri.toString();
  const isHtmlFile = /\.(html|htm|meteor|hbs)$/i.test(uri);
  if (!isHtmlFile) {
    const decorationType = extConfig.htmlElementDecorationType;
    if (decorationType) {
      editor.setDecorations(decorationType, []);
    }
    return;
  }

  // Check if HTML element hints are enabled
  const htmlConfig = vscode.workspace.getConfiguration(
    'meteorLanguageServer.htmlElementHints'
  );
  const enabled = htmlConfig.get<boolean>('enabled', true);

  const decorationType = extConfig.htmlElementDecorationType;
  if (!enabled) {
    if (decorationType) {
      editor.setDecorations(decorationType, []);
    }
    return;
  }

  // Get configuration values
  const minimumLines = htmlConfig.get<number>('minimumLines', 15);
  const showIds = htmlConfig.get<boolean>('showIds', true);
  const showClasses = htmlConfig.get<boolean>('showClasses', true);
  const maxClassesToShow = htmlConfig.get<number>('maxClassesToShow', 3);

  const text = document.getText();
  const decorations: vscode.DecorationOptions[] = [];

  // Find all closing tags: </tagName>
  const closingTagRegex = /<\/(\w+)\s*>/g;
  let match;

  while ((match = closingTagRegex.exec(text)) !== null) {
    const tagName = match[1];
    const closingPosition = match.index;

    // Skip if within comment
    if (isWithinComment(text, closingPosition).isWithin) {
      continue;
    }

    // Find matching opening tag
    const openingTagInfo = findMatchingOpenTag(text, closingPosition, tagName);
    if (!openingTagInfo) {
      continue;
    }

    // Calculate line span
    const openingPos = document.positionAt(openingTagInfo.position);
    const closingPos = document.positionAt(closingPosition);
    const lineSpan = closingPos.line - openingPos.line;

    // Skip if below minimum line threshold
    if (lineSpan < minimumLines) {
      continue;
    }

    // Skip if opening and closing on same line
    if (openingPos.line === closingPos.line) {
      continue;
    }

    // Position after the closing tag
    const afterClosingTag = document.positionAt(
      closingPosition + match[0].length
    );

    // Skip if line already has comment
    if (lineHasExistingComment(text, afterClosingTag)) {
      continue;
    }

    // Parse opening tag attributes
    const attributes = parseHtmlAttributes(openingTagInfo.openingTag);

    // Only add decoration if there's meaningful info to display
    if (!attributes.id && attributes.classes.length === 0) {
      continue;
    }

    // Format hint text
    const hintText = formatHintText(
      attributes.tagName,
      attributes.id,
      attributes.classes,
      { showIds, showClasses, maxClassesToShow }
    );

    const className = attributes.classes.filter((v) => !!v.trim()).join(' ');

    const lineOfStartTag = openingPos.line + 1;
    const lineOfEndTag = closingPos.line + 1;
    const linesRange = [
      lineOfStartTag,
      lineOfStartTag !== lineOfEndTag ? lineOfEndTag : null,
    ]
      .filter(Boolean)
      .join('-');

    const formattedTagName =
      attributes.tagName.length < 3
        ? attributes.tagName.toUpperCase()
        : startCase(attributes.tagName);

    // Create decoration for HTML end tag
    decorations.push({
      range: new vscode.Range(afterClosingTag, afterClosingTag),
      renderOptions: {
        before: { contentText: '' },
        after: { contentText: `</end ${hintText}>` },
      },
      hoverMessage: [
        `End of HTML Element ${linesRange}`,
        codeBlock(
          'typescript',
          `(element) ${attributes.tagName}: HTML${formattedTagName}Element`
        ),
        codeBlock(
          'html',
          [
            `<${attributes.tagName} id="${attributes.id ?? ''}"`,
            `  class="${className}"`,
            `>`,
          ]
            .map((v, i) => `${lineOfStartTag + i} ${v}`)
            .join('\n')
        ),
      ],
    });
  }

  // Apply decorations
  if (extConfig.htmlElementDecorationType) {
    editor.setDecorations(extConfig.htmlElementDecorationType, decorations);
  }
};

/**
 * Create a decoration type for HTML element hints based on user settings.
 * This includes color, font style, and margin.
 *
 * @returns A TextEditorDecorationType for HTML element hints
 */
export const createHtmlElementDecorationType =
  (): vscode.TextEditorDecorationType => {
    const config = vscode.workspace.getConfiguration(
      'meteorLanguageServer.htmlElementHints'
    );

    // Get settings with fallbacks
    const colorSetting = config.get<string>('color', '#72727280');
    const fontStyle = config.get<string>('fontStyle', 'italic');
    const margin = config.get<string>('margin', '0 0 0 0.75em');

    // Handle color setting - can be theme color name or hex color
    const isHex = colorSetting?.startsWith('#');

    const color = isHex ? colorSetting : new vscode.ThemeColor(colorSetting);

    return vscode.window.createTextEditorDecorationType({
      after: { color, fontStyle, margin },
      before: { color, fontStyle, margin },
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedOpen,
    });
  };

/**
 * Update the decoration type for HTML element hints based on current configuration.
 * This is called when the extension is activated or configuration changes.
 *
 * @param extConfig The extension configuration object
 */
export const updateDecorationType = (extConfig: ExtensionConfig) => {
  // Dispose old decoration type if it exists
  extConfig.htmlElementDecorationType?.dispose();

  // Create new decoration type with current settings
  extConfig.htmlElementDecorationType = createHtmlElementDecorationType();

  // Update decorations for all visible editors
  vscode.window.visibleTextEditors.forEach((editor) => {
    if (
      ['html', 'handlebars', 'meteor-html', 'meteor-handlebars'].includes(
        editor.document.languageId
      )
    ) {
      updateHtmlElementDecorations(extConfig, editor.document);
    }
  });
};
