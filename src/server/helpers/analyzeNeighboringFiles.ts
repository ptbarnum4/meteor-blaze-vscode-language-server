import fs from 'fs';
import path from 'path';

import { TextDocument } from 'vscode-languageserver-textdocument';

import { FileAnalysis } from '../../types';

import { initializeMapOnObjectKeys } from '../../utils/map.js';
import { analyzeCSSFile } from './analyzeCSSFile.js';
import { analyzeJavaScriptFile } from './analyzeJavaScriptFile.js';
import { analyzeTemplateData } from './analyzeTemplateData.js';
import { containsMeteorTemplates } from './containsMeteorTemplates.js';

// Analyze neighboring JS/TS/CSS/LESS files
export const analyzeNeighboringFiles = (
  fileAnalysis: FileAnalysis,
  document: TextDocument
) => {
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
  const templateMatches = text.matchAll(
    /<template\s+name=["']([^"']+)["'][^>]*>/g
  );
  for (const match of templateMatches) {
    templateNames.push(match[1]);
  }

  try {
    // Look for neighboring files
    const files = fs.readdirSync(dir);

    files.forEach((file) => {
      const fileBaseName = path.basename(file, path.extname(file));
      const ext = path.extname(file);
      const fullPath = path.join(dir, file);

      // Analyze files with same base name OR files that match template names
      const shouldAnalyze =
        fileBaseName === baseName ||
        templateNames.includes(fileBaseName) ||
        file.startsWith(baseName);
      const isJsTsFile = ['.js', '.ts'].includes(ext);
      const isCssLessFile = ['.css', '.less'].includes(ext);

      const isValidExt = isJsTsFile || isCssLessFile;

      if (!shouldAnalyze || !isValidExt) {
        return;
      }

      if (isCssLessFile) {
        const classes = analyzeCSSFile(fullPath);

        // Store CSS classes with directory-specific keys for same-directory matching
        const dirKey = `${dir}/${baseName}`;
        const dirFileKey = `${dir}/${fileBaseName}`;

        fileAnalysis.cssClasses.set(dirKey, classes);
        fileAnalysis.cssClasses.set(dirFileKey, classes);
        templateNames.forEach((templateName) => {
          const dirTemplateKey = `${dir}/${templateName}`;
          fileAnalysis.cssClasses.set(dirTemplateKey, classes);
        });
        return;
      }

      // Analyze JS/TS files
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
        initializeMapOnObjectKeys(
          fileAnalysis,
          'dataProperties',
          'dataPropertyTypesByKey',
          'dataPropertyJsDocsByKey'
        );

        fileAnalysis.dataProperties.set(dirKey, allTypeProps);
        fileAnalysis.dataProperties.set(dirFileKey, allTypeProps);

        // If only one type was present, attempt to store its prop types
        const [firstTypeName] = Object.keys(dataAnalysis.typePropertyTypes);
        if (firstTypeName) {
          const firstTypeKey =
            dataAnalysis.typePropertyTypes[firstTypeName] || {};
          const firstDocKey =
            dataAnalysis.typePropertyJsDocs[firstTypeName] || {};

          fileAnalysis.dataPropertyTypesByKey.set(dirKey, firstTypeKey);
          fileAnalysis.dataPropertyTypesByKey.set(dirFileKey, firstTypeKey);
          fileAnalysis.dataPropertyJsDocsByKey.set(dirKey, firstDocKey);
          fileAnalysis.dataPropertyJsDocsByKey.set(dirFileKey, firstDocKey);
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
        }
        // Only add data properties if we found the specific type for this template
        // Don't fall back to allTypeProps as that would include properties from all types in the file
        if (propsForTemplate.length) {
          initializeMapOnObjectKeys(
            fileAnalysis,
            'dataProperties',
            'dataPropertyTypesByKey',
            'dataPropertyJsDocsByKey'
          );

          fileAnalysis.dataProperties.set(dirTemplateKey, propsForTemplate);
          if (mappedType && dataAnalysis.typePropertyTypes[mappedType]) {
            fileAnalysis.dataPropertyTypesByKey.set(
              dirTemplateKey,
              dataAnalysis.typePropertyTypes[mappedType]
            );
            fileAnalysis.dataPropertyJsDocsByKey.set(
              dirTemplateKey,
              dataAnalysis.typePropertyJsDocs[mappedType] || {}
            );
          }
        }
      }

      // Also store under template names found in HTML (with directory)
      templateNames.forEach((templateName) => {
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
        }
        // Only add data properties if we found a specific type for this template
        // Don't fall back to allTypeProps as that would include properties from other templates
        if (propsForTemplate.length) {
          initializeMapOnObjectKeys(
            fileAnalysis,
            'dataProperties',
            'dataPropertyTypesByKey',
            'dataPropertyJsDocsByKey'
          );

          fileAnalysis.dataProperties.set(dirTemplateKey, propsForTemplate);

          if (mappedType && dataAnalysis.typePropertyTypes[mappedType]) {
            fileAnalysis.dataPropertyTypesByKey.set(
              dirTemplateKey,
              dataAnalysis.typePropertyTypes[mappedType]
            );
            fileAnalysis.dataPropertyJsDocsByKey.set(
              dirTemplateKey,
              dataAnalysis.typePropertyJsDocs[mappedType] || {}
            );
          }
        }
      });
    });
  } catch (error) {
    // Ignore file system errors
    console.error('Error analyzing neighboring files:', error);
  }
};
