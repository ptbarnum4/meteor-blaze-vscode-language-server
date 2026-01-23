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
          const parameterRegex = new RegExp(`\\{\\{\\s*${parameterName}\\s*\\}\\}`, 'g');
          let match;

          while ((match = parameterRegex.exec(templateBlockContent)) !== null) {
            // Calculate position relative to the file start (not just the template block)
            const absolutePosition = templateBlockStart + templateBlockMatch[0].indexOf(templateBlockContent) + match.index;
            const beforeMatch = content.substring(0, absolutePosition);
            const lines = beforeMatch.split('\n');
            const line = lines.length - 1;
            const character = absolutePosition - beforeMatch.lastIndexOf('\n') - 1;

            return [
              {
                uri: `file://${templatePath}`,
                range: {
                  start: { line, character: character + 2 }, // Skip {{ to point to parameter name
                  end: { line, character: character + 2 + parameterName.length }
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
