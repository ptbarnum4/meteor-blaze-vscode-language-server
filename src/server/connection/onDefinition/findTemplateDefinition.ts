import fs from 'fs';
import path from 'path';
import { Location } from 'vscode-languageserver/node';
import { VSCodeServerConnection } from '/types';

// Helper function to find template definition (template.html file)

const findTemplateDefinition = (
  templateName: string,
  currentDir: string,
  connection: VSCodeServerConnection
): Location[] | null => {
  try {
    // Look for template in common locations
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

        // Find the template tag in the HTML file
        const templateRegex = new RegExp(`<template\\s+name=["']${templateName}["'][^>]*>`);
        const match = templateRegex.exec(content);

        if (match) {
          const lines = content.substring(0, match.index).split('\n');
          const line = lines.length - 1;
          const character = match.index - content.lastIndexOf('\n', match.index) - 1;

          return [
            {
              uri: `file://${templatePath}`,
              range: {
                start: { line, character },
                end: { line, character: character + templateName.length }
              }
            }
          ];
        }
      }
    }
  } catch (error) {
    console.error(`Error finding template definition for ${templateName}:`, error);
  }

  return null;
};

export default findTemplateDefinition;
