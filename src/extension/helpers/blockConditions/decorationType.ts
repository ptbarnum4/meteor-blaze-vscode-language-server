import vscode from 'vscode';

import { ExtensionConfig } from '/types';

import { containsMeteorTemplates } from '../meteor';
import { findEnclosingBlockForElseWithIndex } from './findEnclosingBlockForElse';
import { findMatchingBlockConditionWithIndex } from './findMatchingBlockCondition';
import { isWithinComment } from '../activate/isWithinComment';

/**
 * Update block condition decorations in the active editor for the given document.
 * This will add hints for block conditions like {{#if}}, {{#each}}, etc.
 *
 * @param extConfig The extension configuration containing the decoration type
 * @param document The document to update decorations for
 */
export const updateBlockConditionDecorations = (
  extConfig: ExtensionConfig,
  document: vscode.TextDocument
) => {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document !== document) {
    return;
  }

  // Check if block condition hints are enabled
  const blockConfig = vscode.workspace.getConfiguration('meteorLanguageServer.blockConditions');
  const enabled = blockConfig.get<boolean>('enabled', true);

  const decorationType = extConfig.blockConditionDecorationType;
  if (!enabled) {
    decorationType && editor.setDecorations(decorationType, []);
    return;
  }

  // Only process documents with Meteor templates
  if (!containsMeteorTemplates(document)) {
    decorationType && editor.setDecorations(decorationType, []);
    return;
  }

  // Get blazeHelpers config for colors
  const blazeConfig = vscode.workspace.getConfiguration('meteorLanguageServer.blazeHelpers');
  // Use theme token colors if not provided
  let hashColor = blazeConfig.get<string>('hashColor', '');
  let nameColor = blazeConfig.get<string>('nameColor', '');
  // Fallback to Blaze theme default if not provided
  if (!nameColor) {
    nameColor = '#f07dff'; // Blaze default for blazeBlockName
  }
  let bracketColor = blazeConfig.get<string>('bracketColor', '');

  // Try to use theme color, but fallback to config color if theme color is not defined
  function getThemeOrConfigColor(scope: string, configColor: string) {
    // Try to use theme color, but fallback to config color if theme color is not defined
    // VS Code does not provide a direct API to check if a theme color is defined, so we use configColor if present
    if (configColor) {
      return configColor;
    }
    return new vscode.ThemeColor(scope) as any;
  }

  hashColor = getThemeOrConfigColor('constant.character.hash.meteor', hashColor);
  nameColor = getThemeOrConfigColor('entity.name.tag.meteor keyword.control.meteor', nameColor);
  bracketColor = getThemeOrConfigColor('punctuation.definition.bracket.meteor', bracketColor);

  const text = document.getText();
  const decorations: vscode.DecorationOptions[] = [];

  // Get custom block types from config
  // Support custom propNames in extended blockConditions
  type ExtendedBlock = { type: string; label: string; propNames?: string[] };
  const extendBlocks = blockConfig.get<ExtendedBlock[]>('extend', []);
  // Define the default block types
  const defaultBlockTypes = [
    { type: 'if', label: 'if' },
    { type: 'each', label: 'each' },
    { type: 'unless', label: 'unless' },
    { type: 'with', label: 'with' }
  ];
  // Merge and deduplicate by type
  const blockTypesMap = new Map<string, { type: string; label: string }>();
  defaultBlockTypes.forEach(b => blockTypesMap.set(b.type, b));
  extendBlocks.forEach(b => blockTypesMap.set(b.type, b));
  const blockTypes: ExtendedBlock[] = Array.from(blockTypesMap.values());

  // Process each block type
  blockTypes.forEach(({ type, label, propNames }) => {
    // Find all {{/blockType}} patterns and add decorations showing the condition
    const endBlockRegex = new RegExp(`\{\{\s*\/${type}\s*\}\}`, 'g');
    let match;

    while ((match = endBlockRegex.exec(text)) !== null) {
      // Skip if the match is within a comment
      if (isWithinComment(text, match.index)) {
        continue;
      }

      // Look backwards to find the matching {{#blockType}} condition
      const beforeEndBlock = text.substring(0, match.index);
      const matchResult = findMatchingBlockConditionWithIndex(beforeEndBlock, type);

      let propText = '';
      if (propNames && propNames.length > 0) {
        propText = ` [props: ${propNames.join(', ')}]`;
      }

      if (matchResult) {
        const endPos = document.positionAt(match.index + match[0].length);
        const startPos = document.positionAt(matchResult.index);

        // Skip decoration if start and end are on the same line
        if (startPos.line === endPos.line) {
          continue;
        }

        decorations.push({
          range: new vscode.Range(endPos, endPos),
          renderOptions: {
            after: {
              contentText: `// END ${label}${propText} ${matchResult.condition}`
            }
          }
        });
      }
    }

    // Find all {{else}} patterns within if/unless blocks and add condition hints
    if (type === 'if' || type === 'unless') {
      const elseRegex = /\{\{\s*else\s*\}\}/g;
      let elseMatch;

      while ((elseMatch = elseRegex.exec(text)) !== null) {
        // Skip if the match is within a comment
        if (isWithinComment(text, elseMatch.index)) {
          continue;
        }

        // Use the new function to find the enclosing block with index
        const enclosingBlock = findEnclosingBlockForElseWithIndex(text, elseMatch.index);

        if (enclosingBlock && enclosingBlock.type === type) {
          const elsePos = document.positionAt(elseMatch.index + elseMatch[0].length);
          const startPos = document.positionAt(enclosingBlock.index);

          // Skip decoration if start and else are on the same line
          if (startPos.line === elsePos.line) {
            continue;
          }

          // Determine the prefix based on block type
          const prefix = type === 'unless' ? 'IS' : 'NOT';

          decorations.push({
            range: new vscode.Range(elsePos, elsePos),
            renderOptions: {
              after: {
                contentText: `// ${prefix} ${enclosingBlock.condition}`
              }
            }
          });
        }
      }
    }
  });
  if (extConfig.blockConditionDecorationType) {
    editor.setDecorations(extConfig.blockConditionDecorationType, decorations);
  }
};

/**
 * Create a decoration type for block conditions based on user settings.
 * This includes color, font style, and margin.
 *
 * @returns A TextEditorDecorationType for block conditions
 */
export const createBlockConditionDecorationType = (): vscode.TextEditorDecorationType => {
  const config = vscode.workspace.getConfiguration('meteorLanguageServer.blockConditions');

  // Get settings with fallbacks
  const colorSetting = config.get<string>('color', 'editorCodeLens.foreground');
  const fontStyle = config.get<string>('fontStyle', 'italic');
  const margin = config.get<string>('margin', '0 0 0 1em');

  // Handle color setting - can be theme color name or hex color
  let color: string | vscode.ThemeColor;
  if (colorSetting.startsWith('#')) {
    color = colorSetting;
  } else {
    color = new vscode.ThemeColor(colorSetting);
  }

  return vscode.window.createTextEditorDecorationType({
    after: {
      color: color,
      fontStyle: fontStyle as any,
      margin: margin
    }
  });
};

/**
 * Update the decoration type for block conditions based on current configuration.
 * This is called when the extension is activated or configuration changes.
 *
 * @param extConfig The extension configuration object
 */
export const updateDecorationType = (extConfig: ExtensionConfig) => {
  // Dispose old decoration type if it exists

  extConfig.blockConditionDecorationType?.dispose();

  // Create new decoration type with current settings
  extConfig.blockConditionDecorationType = createBlockConditionDecorationType();

  // Update decorations for all visible editors
  vscode.window.visibleTextEditors.forEach(editor => {
    if (
      ['html', 'handlebars', 'meteor-html', 'meteor-handlebars'].includes(
        editor.document.languageId
      )
    ) {
      updateBlockConditionDecorations(extConfig, editor.document);
    }
  });
};
