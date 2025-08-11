import fs from 'fs';
import path from 'path';

import { TextDocument } from 'vscode-languageserver-textdocument';

import { FileAnalysis } from '/types';

import { analyzeCSSFile } from './analyzeCSSFile';
import { analyzeJavaScriptFile } from './analyzeJavaScriptFile';
import { analyzeTemplateData } from './analyzeTemplateData';
import { containsMeteorTemplates } from './containsMeteorTemplates';

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

          // Extract TS type-based template data properties
          const dataAnalysis = analyzeTemplateData(fullPath);
          const allTypeProps = Object.values(dataAnalysis.types).flat();

          // Store helpers with directory-specific keys to ensure same-directory matching
          const dirKey = `${dir}/${baseName}`;
          const dirFileKey = `${dir}/${fileBaseName}`;

          fileAnalysis.jsHelpers.set(dirKey, helpers);
          fileAnalysis.jsHelpers.set(dirFileKey, helpers);
          fileAnalysis.helperDetails.set(dirKey, helperDetails);
          fileAnalysis.helperDetails.set(dirFileKey, helperDetails);
          if (allTypeProps.length) {
            if (!fileAnalysis.dataProperties) {
              fileAnalysis.dataProperties = new Map();
            }
            fileAnalysis.dataProperties.set(dirKey, allTypeProps);
            fileAnalysis.dataProperties.set(dirFileKey, allTypeProps);
            if (!fileAnalysis.dataPropertyTypesByKey) {
              fileAnalysis.dataPropertyTypesByKey = new Map();
            }
            // If only one type was present, attempt to store its prop types
            const firstTypeName = Object.keys(dataAnalysis.typePropertyTypes)[0];
            if (firstTypeName) {
              fileAnalysis.dataPropertyTypesByKey.set(dirKey, dataAnalysis.typePropertyTypes[firstTypeName] || {});
              fileAnalysis.dataPropertyTypesByKey.set(dirFileKey, dataAnalysis.typePropertyTypes[firstTypeName] || {});
            }
          }

          // If we extracted a template name from the code, use that as a key too (with directory)
          if (extractedTemplateName) {
            const dirTemplateKey = `${dir}/${extractedTemplateName}`;
            fileAnalysis.jsHelpers.set(dirTemplateKey, helpers);
            fileAnalysis.helperDetails.set(dirTemplateKey, helperDetails);
            // Try to map data properties by template name via TemplateStaticTyped
            let propsForTemplate: string[] = [];
            const mappedType = dataAnalysis.templateTypeMap[extractedTemplateName];
            if (mappedType && dataAnalysis.types[mappedType]) {
              propsForTemplate = dataAnalysis.types[mappedType];
              if (!fileAnalysis.dataTypeByKey) {
                fileAnalysis.dataTypeByKey = new Map();
              }
              fileAnalysis.dataTypeByKey.set(dirTemplateKey, mappedType);
            } else if (allTypeProps.length) {
              propsForTemplate = allTypeProps;
            }
            if (propsForTemplate.length) {
              if (!fileAnalysis.dataProperties) {
                fileAnalysis.dataProperties = new Map();
              }
              fileAnalysis.dataProperties.set(dirTemplateKey, propsForTemplate);
              if (!fileAnalysis.dataPropertyTypesByKey) {
                fileAnalysis.dataPropertyTypesByKey = new Map();
              }
              if (mappedType && dataAnalysis.typePropertyTypes[mappedType]) {
                fileAnalysis.dataPropertyTypesByKey.set(dirTemplateKey, dataAnalysis.typePropertyTypes[mappedType]);
              }
            }
          }

          // Also store under template names found in HTML (with directory)
          templateNames.forEach(templateName => {
            const dirTemplateKey = `${dir}/${templateName}`;
            fileAnalysis.jsHelpers.set(dirTemplateKey, helpers);
            fileAnalysis.helperDetails.set(dirTemplateKey, helperDetails);
            let propsForTemplate: string[] = [];
            const mappedType = dataAnalysis.templateTypeMap[templateName];
            if (mappedType && dataAnalysis.types[mappedType]) {
              propsForTemplate = dataAnalysis.types[mappedType];
              if (!fileAnalysis.dataTypeByKey) {
                fileAnalysis.dataTypeByKey = new Map();
              }
              fileAnalysis.dataTypeByKey.set(dirTemplateKey, mappedType);
            } else if (allTypeProps.length) {
              propsForTemplate = allTypeProps;
            }
            if (propsForTemplate.length) {
              if (!fileAnalysis.dataProperties) {
                fileAnalysis.dataProperties = new Map();
              }
              fileAnalysis.dataProperties.set(dirTemplateKey, propsForTemplate);
              if (!fileAnalysis.dataPropertyTypesByKey) {
                fileAnalysis.dataPropertyTypesByKey = new Map();
              }
              if (mappedType && dataAnalysis.typePropertyTypes[mappedType]) {
                fileAnalysis.dataPropertyTypesByKey.set(dirTemplateKey, dataAnalysis.typePropertyTypes[mappedType]);
              }
            }
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
