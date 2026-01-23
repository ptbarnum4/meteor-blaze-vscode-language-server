import { Location } from 'vscode-languageserver/node';

// Helper function to find parameter usage in template HTML file
const findParameterInTemplateHtml = (
  parameterName: string,
  templateName: string,
  currentDir: string,
  currentFileUri: string,
  fs: any,
  path: any
): Location[] | null => {
  try {
    // First check the current file (child template might be in the same file)
    const currentFilePath = currentFileUri.replace('file://', '');

    // Look for template HTML file in common locations
    const possiblePaths = [
      currentFilePath, // Check current file first
      path.join(currentDir, templateName, 'template.html'),
      path.join(currentDir, templateName, `${templateName}.html`),
      path.join(currentDir, `${templateName}.html`),
      // Also check parent directories
      path.join(path.dirname(currentDir), templateName, 'template.html'),
      path.join(path.dirname(currentDir), templateName, `${templateName}.html`)
    ];

    for (const templatePath of possiblePaths) {
      if (fs.existsSync(templatePath)) {
        const content = fs.readFileSync(templatePath, 'utf8');

        // Find the specific template block for the child template
        const templateBlockRegex = new RegExp(
          `<template\\s+name=["']${templateName}["'][^>]*>([\\s\\S]*?)<\\/template>`,
          'i'
        );
        const templateBlockMatch = content.match(templateBlockRegex);

        if (templateBlockMatch) {
          const templateBlockStart = templateBlockMatch.index!;
          const templateBlockContent = templateBlockMatch[1];

          // Look for the parameter usage in handlebars expressions within this template block
          // We need to escape special regex characters in the parameter name
          const escapedParamName = parameterName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

          // Pattern 1: {{parameterName}} or {{parameterName.property}}
          const directParamRegex = new RegExp(`\\{\\{\\s*${escapedParamName}(?:\\.[a-zA-Z0-9_]+)*\\s*`, 'g');
          // Pattern 2: {{this.parameterName}} or {{this.parameterName.property}}
          const thisParamRegex = new RegExp(`\\{\\{\\s*this\\.${escapedParamName}(?:\\.[a-zA-Z0-9_]+)*\\s*`, 'g');
          // Pattern 3: {{#if parameterName}}, {{#each parameterName}}, {{#with parameterName}}, etc.
          const blockHelperRegex = new RegExp(`\\{\\{#(?:if|unless|each|with)\\s+${escapedParamName}(?:\\.[a-zA-Z0-9_]+)*\\s*`, 'g');
          // Pattern 4: Function call with parameter: {{helper parameterName}} or {{helper parameterName.property}}
          const helperParamRegex = new RegExp(`\\{\\{[a-zA-Z0-9_]+\\s+${escapedParamName}(?:\\.[a-zA-Z0-9_]+)*\\s*`, 'g');
          // Pattern 5: Subexpressions: (helper parameterName) or (helper parameterName.property)
          const subexpressionRegex = new RegExp(`\\([a-zA-Z0-9_]+\\s+${escapedParamName}(?:\\.[a-zA-Z0-9_]+)*`, 'g');

          const patterns = [directParamRegex, thisParamRegex, blockHelperRegex, helperParamRegex, subexpressionRegex];
          let firstMatch: RegExpExecArray | null = null;
          let firstMatchPosition = -1;

          // Find the first occurrence across all patterns
          for (const pattern of patterns) {
            pattern.lastIndex = 0; // Reset regex state
            const match = pattern.exec(templateBlockContent);

            if (match && (firstMatchPosition === -1 || match.index < firstMatchPosition)) {
              firstMatch = match;
              firstMatchPosition = match.index;
            }
          }

          if (firstMatch) {
            // Calculate position relative to the file start (not just the template block)
            const absolutePosition = templateBlockStart + templateBlockMatch[0].indexOf(templateBlockContent) + firstMatch.index;
            const beforeMatch = content.substring(0, absolutePosition);
            const lines = beforeMatch.split('\n');
            const line = lines.length - 1;
            const character = absolutePosition - beforeMatch.lastIndexOf('\n') - 1;

            // Calculate the start position of the actual parameter name within the match
            const matchText = firstMatch[0];
            let paramStartOffset = matchText.indexOf(parameterName);

            return [
              {
                uri: `file://${templatePath}`,
                range: {
                  start: { line, character: character + paramStartOffset },
                  end: { line, character: character + paramStartOffset + parameterName.length }
                }
              }
            ];
          }
        }
      }
    }
  } catch (error) {
    console.error(`Error finding parameter in template HTML for ${parameterName}:`, error);
  }

  return null;
};

export default findParameterInTemplateHtml;
