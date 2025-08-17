import { Location } from 'vscode-languageserver/node';

// Helper function to find parameter usage in template HTML file
const findParameterInTemplateHtml = (
  parameterName: string,
  templateName: string,
  currentDir: string,
  fs: any,
  path: any
): Location[] | null => {
  try {
    // Look for template HTML file in common locations
    const possiblePaths = [
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

        // Look for the parameter usage in handlebars expressions: {{parameterName}}
        const parameterRegex = new RegExp(`\\{\\{\\s*${parameterName}\\s*\\}\\}`, 'g');
        let match;

        while ((match = parameterRegex.exec(content)) !== null) {
          // Calculate line and character position
          const beforeMatch = content.substring(0, match.index);
          const lines = beforeMatch.split('\n');
          const line = lines.length - 1;
          const character = match.index - beforeMatch.lastIndexOf('\n') - 1;

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
  } catch (error) {
    console.error(`Error finding parameter in template HTML for ${parameterName}:`, error);
  }

  return null;
};

export default findParameterInTemplateHtml;
