import * as fs from 'fs';
import * as path from 'path';

import { TextDocument } from 'vscode-languageserver-textdocument';

import { containsMeteorTemplates } from './containsMeteorTemplates';
import { FileAnalysis } from '../../types';
import { analyzeJavaScriptFile } from './analyzeJavaScriptFile';
import { analyzeCSSFile } from './analyzeCSSFile';

// Analyze neighboring JS/TS/CSS/LESS files
export const analyzeNeighboringFiles = (fileAnalysis: FileAnalysis, document: TextDocument) => {
  const uri = document.uri;
  const filePath = uri.replace('file://', '');
  const dir = path.dirname(filePath);
  const baseName = path.basename(filePath, path.extname(filePath));

  // Only analyze if this HTML file contains Meteor templates
  if (!containsMeteorTemplates(document)) {
    return;
  }

  // Extract template names from the HTML document
  const text = document.getText();
  const templateNames: string[] = [];
  const templateMatches = text.matchAll(/<template\s+name=["']([^"']+)["'][^>]*>/g);
  for (const match of templateMatches) {
    templateNames.push(match[1]);
  }

  try {
    // Look for neighboring files
    const files = fs.readdirSync(dir);

    files.forEach(file => {
      const fileBaseName = path.basename(file, path.extname(file));
      const ext = path.extname(file);
      const fullPath = path.join(dir, file);

      // Analyze files with same base name OR files that match template names
      const shouldAnalyze =
        fileBaseName === baseName ||
        templateNames.includes(fileBaseName) ||
        file.startsWith(baseName);

      if (shouldAnalyze) {
        if (['.js', '.ts'].includes(ext)) {
          const result = analyzeJavaScriptFile(fullPath);
          const helpers = result.helpers;
          const helperDetails = result.helperDetails;
          const extractedTemplateName = result.templateName;

          // Store helpers with directory-specific keys to ensure same-directory matching
          const dirKey = `${dir}/${baseName}`;
          const dirFileKey = `${dir}/${fileBaseName}`;

          fileAnalysis.jsHelpers.set(dirKey, helpers);
          fileAnalysis.jsHelpers.set(dirFileKey, helpers);
          fileAnalysis.helperDetails.set(dirKey, helperDetails);
          fileAnalysis.helperDetails.set(dirFileKey, helperDetails);

          // If we extracted a template name from the code, use that as a key too (with directory)
          if (extractedTemplateName) {
            const dirTemplateKey = `${dir}/${extractedTemplateName}`;
            fileAnalysis.jsHelpers.set(dirTemplateKey, helpers);
            fileAnalysis.helperDetails.set(dirTemplateKey, helperDetails);
          }

          // Also store under template names found in HTML (with directory)
          templateNames.forEach(templateName => {
            const dirTemplateKey = `${dir}/${templateName}`;
            fileAnalysis.jsHelpers.set(dirTemplateKey, helpers);
            fileAnalysis.helperDetails.set(dirTemplateKey, helperDetails);
          });
        } else if (['.css', '.less'].includes(ext)) {
          const classes = analyzeCSSFile(fullPath);

          // Store CSS classes with directory-specific keys for same-directory matching
          const dirKey = `${dir}/${baseName}`;
          const dirFileKey = `${dir}/${fileBaseName}`;

          fileAnalysis.cssClasses.set(dirKey, classes);
          fileAnalysis.cssClasses.set(dirFileKey, classes);
          templateNames.forEach(templateName => {
            const dirTemplateKey = `${dir}/${templateName}`;
            fileAnalysis.cssClasses.set(dirTemplateKey, classes);
          });
        }
      }
    });
  } catch (error) {
    // Ignore file system errors
    console.error('Error analyzing neighboring files:', error);
  }
};
