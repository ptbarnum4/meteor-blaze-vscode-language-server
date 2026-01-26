/**
 * Language Server Connection Entrypoint

 * Wires up VS Code LSP server connection and document manager, and registers
 * all request/notification handlers. Exports a small object with the active
 * connection and documents manager for use by the extension bootstrap.
 */

import path from 'path';

// External LSP types
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  createConnection,
  ProposedFeatures,
  TextDocuments,
} from 'vscode-languageserver/node.js';

// Shared types/state used across handlers
import { CurrentConnectionConfig } from '../../types';

// Request/notification handlers
import Logger from '../../utils/logger.js';
import { analyzeGlobalHelpers } from '../helpers/analyzeGlobalHelpers.js';
import {
  analyzeTemplateData,
  analyzeTemplateDocumentation,
} from '../helpers/analyzeTemplateData.js';
import { extractParametersFromTemplate } from '../helpers/extractTemplateParameters.js';
import getDocumentSettings from '../helpers/getDocumentSettings.js';
import {
  mergedParametersToEnhanced,
  mergeTemplateParameters,
} from '../helpers/mergeTemplateParameters.js';
import { validateWorkspace } from '../helpers/validateWorkspace.js';
import onCompletion from './onCompletion.js';
import onCompletionResolve from './onCompletionResolve.js';
import onDefinition from './onDefinition/index.js';
import onDidChangeConfiguration from './onDidChangeConfiguration.js';
import onDidChangeContent from './onDidChangeContent.js';
import onDidClose from './onDidClose.js';
import onFoldingRanges from './onFoldingRanges.js';
import {
  onDocumentFormatting,
  onDocumentOnTypeFormatting,
  onDocumentRangeFormatting,
} from './onFormatting.js';
import onHover from './onHover.js';
import onInitialize from './onInitialize.js';
import onInitialized from './onInitialized.js';
// --- Connection & Documents -------------------------------------------------
/**
 * Creates the LSP connection used to communicate with the client (VS Code).
 * Uses ProposedFeatures to enable a richer capability set where available.
 */
const connection = createConnection(ProposedFeatures.all);

/**
 * Text document manager providing convenient APIs and change events.
 * Shared across handlers via the config below.
 */
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// --- Shared Config ----------------------------------------------------------
/**
 * Central configuration object shared across all handler factories. Handlers
 * can read and update these fields to maintain server state.
 */
const config: CurrentConnectionConfig = {
  logger: new Logger(connection), //.disable(),
  globalSettings: { maxNumberOfProblems: 1000 },
  documentSettings: new Map(),
  fileAnalysis: {
    jsHelpers: new Map(),
    helperDetails: new Map(),
    cssClasses: new Map(),
    templates: new Map(),
  },
  documents,
  connection,
  hasConfigurationCapability: false,
  hasWorkspaceFolderCapability: false,
  hasDiagnosticRelatedInformationCapability: false,
};

// --- Handler Registration ---------------------------------------------------
// Register lifecycle/configuration handlers
connection.onInitialize(onInitialize(config));
connection.onInitialized(onInitialized(config));
connection.onDidChangeConfiguration(onDidChangeConfiguration(config));

// Register language feature handlers
connection.onCompletion(onCompletion(config));
connection.onCompletionResolve(onCompletionResolve(config));
connection.onHover(onHover(config));
connection.onDefinition(onDefinition(config));
connection.onFoldingRanges(onFoldingRanges(config));

// Register formatting handlers
connection.onDocumentFormatting(onDocumentFormatting(config));
connection.onDocumentRangeFormatting(onDocumentRangeFormatting(config));
connection.onDocumentOnTypeFormatting(onDocumentOnTypeFormatting(config));

// Register document event handlers
documents.onDidClose(onDidClose(config));
documents.onDidChangeContent(onDidChangeContent(config));

// Register custom request handlers
connection.onRequest('workspace/validateAll', async () => {
  await validateWorkspace(config);
  return { success: true };
});

// Register sidebar analysis request handler
connection.onRequest(
  'meteor/analyzeWorkspace',
  async (
    params: { scanWorkspace?: boolean; visibleFileUris?: string[] } = {}
  ) => {
    const logger = config.logger.ctx('SIDEBAR');

    try {
      const scanWorkspace = params.scanWorkspace ?? false;
      const visibleFileUris = params.visibleFileUris ?? [];
      logger.log(`========================================`);
      logger.log(`ANALYZE WORKSPACE REQUEST RECEIVED`);
      logger.log(`scanWorkspace: ${scanWorkspace}`);
      logger.log(`visibleFiles: ${visibleFileUris.length}`);
      logger.log(`========================================`);

      const templates: Array<{
        name: string;
        helpers: string[];
        events: string[];
        file: string;
        dataProperties?: string[];
        props?: string[];
        lifecycle?: string[];
        instanceProperties?: string[];
      }> = [];
      const templatesMap = new Map<
        string,
        {
          name: string;
          helpers: string[];
          events: string[];
          file: string;
          dataProperties?: string[];
          props?: string[];
          lifecycle?: string[];
          instanceProperties?: string[];
          dataPropertiesEnhanced?: Array<{
            name: string;
            type: string;
            description?: string;
            optional: boolean;
            sources: Array<'controller' | 'tsdoc' | 'inferred'>;
          }>;
          templateDescription?: string;
        }
      >();

      // NEW: Initialize TSDoc storage
      const templateTsDocParams: Record<
        string,
        {
          [paramName: string]: {
            type: string;
            description?: string;
            optional: boolean;
          };
        }
      > = {};
      const templateDescriptions: Record<string, string> = {};

      // Collect global helpers once before processing templates
      let allGlobalHelpers = new Set<string>();
      try {
        // Always analyze global helpers (whether scanning workspace or viewing single file)
        // Get workspace root from the first visible file or use process.cwd()
        let workspaceRoot = process.cwd();
        if (visibleFileUris.length > 0) {
          const firstUri = visibleFileUris[0];
          // Convert file:// URI to path
          const uriPath = firstUri.replace(/^file:\/\//, '');
          // Get directory path and navigate up to likely workspace root
          const dirPath = path.dirname(uriPath);
          // Try to find workspace root by looking for common markers
          // For now, just use the directory several levels up
          const parts = dirPath.split(path.sep);
          // Navigate up to find a reasonable workspace root (look for common project indicators)
          workspaceRoot = dirPath;
          for (let i = parts.length - 1; i >= 0; i--) {
            const testPath = parts.slice(0, i + 1).join(path.sep);
            const fs = require('fs');
            if (
              fs.existsSync(path.join(testPath, 'package.json')) ||
              fs.existsSync(path.join(testPath, '.meteor'))
            ) {
              workspaceRoot = testPath;
              break;
            }
          }
        }

        logger.log(`Analyzing global helpers in: ${workspaceRoot}`);

        // Get settings for global helpers from configuration
        const settings = await getDocumentSettings(
          config,
          visibleFileUris[0] || 'file:///'
        );

        // Analyze project for global helpers
        const globalHelpersResult = await analyzeGlobalHelpers(workspaceRoot);
        allGlobalHelpers = new Set(globalHelpersResult.helpers);

        logger.log(`Found ${allGlobalHelpers.size} detected global helpers`);

        // Add configured global helpers from settings
        if (settings.globalHelpers?.extend) {
          for (const helper of settings.globalHelpers.extend) {
            allGlobalHelpers.add(helper.name);
          }
        }
        // Also check legacy blazeHelpers.extend
        if (settings.blazeHelpers?.extend) {
          for (const helper of settings.blazeHelpers.extend) {
            allGlobalHelpers.add(helper.name);
          }
        }

        logger.log(
          `Total global helpers (including configured): ${allGlobalHelpers.size}`
        );
      } catch (err) {
        logger.error(`Error loading global helpers: ${err}`);
      }

      const processFile = async (filePath: string, content: string) => {
        const templateMatches = content.matchAll(
          /<template\s+name=["']([^"']+)["'][^>]*>/g
        );

        for (const match of templateMatches) {
          const templateName = match[1];

          // Only use explicitly typed data from TypeScript controller files
          // Do NOT extract data from template HTML content
          const helpers: string[] = [];
          const events: string[] = [];
          const dataProperties: string[] = [];
          const lifecycle: string[] = [];
          const instanceProperties: string[] = [];
          const basePath = filePath.replace(/\.(html|hbs)$/, '');

          config.logger.log(
            `[Sidebar] Looking for JS/TS files for template ${templateName} at basePath: ${basePath}`
          );

          // Look for corresponding JS/TS file and extract helpers, events, and data types
          // Try both the filename-based path (e.g., template.ts) and template-name-based path (e.g., alumniList.ts)

          const dirPath = path.dirname(basePath);
          const candidatePaths: string[] = [];

          // Add filename-based paths (e.g., template.ts)
          for (const ext of ['.js', '.ts', '.jsx', '.tsx']) {
            candidatePaths.push(basePath + ext);
          }

          // Add template-name-based paths (e.g., alumniList.ts)
          for (const ext of ['.js', '.ts', '.jsx', '.tsx']) {
            candidatePaths.push(path.join(dirPath, templateName + ext));
          }

          for (const jsPath of candidatePaths) {
            config.logger.log(`[Sidebar] Checking for file: ${jsPath}`);
            try {
              const fs = require('fs');
              if (fs.existsSync(jsPath)) {
                config.logger.log(`[Sidebar] Found companion file: ${jsPath}`);
                const jsContent = fs.readFileSync(jsPath, 'utf8');

                // Extract TypeScript type definition for template data
                // Match patterns like:
                // - type templateNameData = {...}
                // - type TemplateNameData = {...}
                // - type templateNameTemplateData = {...}
                // Convert templateName to PascalCase for matching
                const pascalTemplateName =
                  templateName.charAt(0).toUpperCase() + templateName.slice(1);
                const typePatterns = [
                  new RegExp(
                    `type\\s+${pascalTemplateName}(?:Template)?Data\\s*=\\s*\\{`,
                    'i'
                  ),
                  new RegExp(
                    `type\\s+${templateName}(?:Template)?Data\\s*=\\s*\\{`,
                    'i'
                  ),
                ];

                let typeDefMatch = null;
                for (const pattern of typePatterns) {
                  typeDefMatch = pattern.exec(jsContent);
                  if (typeDefMatch) {
                    break;
                  }
                }

                if (typeDefMatch) {
                  logger.log(`Found type definition for ${templateName}`);
                  // Use brace matching to extract the complete type body
                  const startIndex =
                    typeDefMatch.index + typeDefMatch[0].length - 1;
                  let braceCount = 1;
                  let endIndex = startIndex + 1;

                  while (endIndex < jsContent.length && braceCount > 0) {
                    const char = jsContent[endIndex];
                    if (char === '{') {
                      braceCount++;
                    } else if (char === '}') {
                      braceCount--;
                    }
                    endIndex++;
                  }

                  const typeBody = jsContent.substring(
                    startIndex + 1,
                    endIndex - 1
                  );
                  logger.log(`Type body length: ${typeBody.length}`);

                  // Extract property names from type definition
                  const propMatches = typeBody.matchAll(
                    /^\s*(?:\/\*\*[\s\S]*?\*\/\s*)?([a-zA-Z_$][\w$]*)\s*[?:]\s*/gm
                  );
                  // Filter out TypeScript type keywords
                  const typeKeywords = [
                    'true',
                    'false',
                    'null',
                    'undefined',
                    'boolean',
                    'string',
                    'number',
                    'any',
                    'unknown',
                    'void',
                    'never',
                    'object',
                    'symbol',
                    'bigint',
                    'True',
                    'False',
                    'Null',
                    'Undefined',
                  ];
                  for (const propMatch of propMatches) {
                    const propName = propMatch[1];
                    if (
                      propName &&
                      !typeKeywords.includes(propName) &&
                      !dataProperties.includes(propName)
                    ) {
                      dataProperties.push(propName);
                      logger.log(`Found data property from type: ${propName}`);
                    }
                  }
                } else {
                  logger.log(`No type definition found for ${templateName}`);
                }

                // Extract helpers from Template.templateName.helpers({ ... })
                const helpersPattern = new RegExp(
                  `Template\\.${templateName}\\.helpers\\s*\\(\\s*\\{`,
                  's'
                );
                const helpersMatch = helpersPattern.exec(jsContent);
                if (helpersMatch) {
                  // Use brace matching to find the complete helpers block
                  const startIndex =
                    helpersMatch.index + helpersMatch[0].length - 1;
                  let braceCount = 1;
                  let endIndex = startIndex + 1;

                  while (endIndex < jsContent.length && braceCount > 0) {
                    const char = jsContent[endIndex];
                    if (char === '{') {
                      braceCount++;
                    } else if (char === '}') {
                      braceCount--;
                    }
                    endIndex++;
                  }

                  const helpersBlock = jsContent.substring(
                    startIndex + 1,
                    endIndex - 1
                  );
                  // Extract helper names at the top level only by tracking brace depth
                  // We need to match helper names BEFORE their function bodies increase the depth
                  const lines = helpersBlock.split('\n');
                  const topLevelHelpers = new Set<string>();
                  let depth = 0;

                  for (const line of lines) {
                    // Check if this line starts a helper definition at depth 0
                    if (depth === 0) {
                      const match = line.match(
                        /^\s*(?:\/\*\*[\s\S]*?\*\/\s*)?(\w+)\s*[:(/]/
                      );
                      if (match) {
                        const helperName = match[1];
                        if (
                          helperName &&
                          ![
                            'if',
                            'for',
                            'while',
                            'return',
                            'const',
                            'let',
                            'var',
                            'function',
                            'async',
                          ].includes(helperName)
                        ) {
                          topLevelHelpers.add(helperName);
                        }
                      }
                    }

                    // Update depth for this line
                    for (const char of line) {
                      if (char === '{' || char === '[' || char === '(') {
                        depth++;
                      } else if (char === '}' || char === ']' || char === ')') {
                        depth--;
                      }
                    }
                  }

                  helpers.push(...topLevelHelpers);
                }

                // Extract events from Template.templateName.events({ ... })
                const eventsPattern = new RegExp(
                  `Template\\.${templateName}\\.events\\s*\\(\\s*\\{`,
                  's'
                );
                const eventsMatch = eventsPattern.exec(jsContent);
                if (eventsMatch) {
                  // Use brace matching for events block too
                  const startIndex =
                    eventsMatch.index + eventsMatch[0].length - 1;
                  let braceCount = 1;
                  let endIndex = startIndex + 1;

                  while (endIndex < jsContent.length && braceCount > 0) {
                    const char = jsContent[endIndex];
                    if (char === '{') {
                      braceCount++;
                    } else if (char === '}') {
                      braceCount--;
                    }
                    endIndex++;
                  }

                  const eventsBlock = jsContent.substring(
                    startIndex + 1,
                    endIndex - 1
                  );
                  const eventMatches = eventsBlock.matchAll(
                    /['"]([^'"]+)['"]\s*[:(/]/g
                  );
                  for (const eventMatch of eventMatches) {
                    events.push(eventMatch[1]);
                  }
                }
                // Extract template data from onCreated/onRendered (this.data.xxx)
                const lifecycleRegex = new RegExp(
                  `Template\\.${templateName}\\.(onCreated|onRendered|onDestroyed)`,
                  'g'
                );
                let lifecycleMatch;
                while (
                  (lifecycleMatch = lifecycleRegex.exec(jsContent)) !== null
                ) {
                  const method = lifecycleMatch[1];
                  if (!lifecycle.includes(method)) {
                    lifecycle.push(method);
                  }
                }

                logger.log(
                  `After lifecycle extraction for ${templateName}: ${lifecycle.join(', ')}`
                );

                logger.log(
                  `${templateName} lifecycle count: ${lifecycle.length}`
                );

                // Extract data properties (this.data.xxx or Template.currentData().xxx)
                const dataRegex =
                  /(?:this\.data|Template\.currentData\(\))\.([a-zA-Z_$][\w$]*)/g;
                let dataMatch;
                while ((dataMatch = dataRegex.exec(jsContent)) !== null) {
                  const propName = dataMatch[1];
                  if (!dataProperties.includes(propName)) {
                    dataProperties.push(propName);
                  }
                }

                logger.log(
                  `After runtime data extraction for ${templateName}: ${dataProperties.join(', ')}`
                );

                // Extract instance properties from TemplateStaticTyped<N, D, T>
                try {
                  const dataAnalysis = analyzeTemplateData(jsPath);

                  // Check if this template has an instance type defined
                  const instanceTypeName =
                    dataAnalysis.templateInstanceTypeMap[templateName];
                  if (
                    instanceTypeName &&
                    dataAnalysis.types[instanceTypeName]
                  ) {
                    const instanceProps = dataAnalysis.types[instanceTypeName];
                    instanceProperties.push(...instanceProps);
                    logger.log(
                      `Found instance type ${instanceTypeName} for ${templateName} with ${instanceProps.length} properties`
                    );
                  }
                } catch (err) {
                  logger.error(
                    `Error analyzing template data for ${templateName}: ${err}`
                  );
                }

                logger.log(
                  `Instance properties for ${templateName}: ${instanceProperties.join(', ')}`
                );

                break;
              }
            } catch (err) {
              config.logger.error(`Error reading JS file ${jsPath}: ${err}`);
            }
          }

          // Data properties come only from TypeScript type definitions
          // No filtering needed since they're explicitly typed
          logger.log(
            `Data properties for ${templateName}: ${dataProperties.join(', ')}`
          );
          logger.log(`Template helpers: ${helpers.join(', ')}`);

          // NEW: Get TSDoc documentation for this template

          const settings = await getDocumentSettings(
            config,
            `file://${filePath}`
          );
          const supportedTags = [
            'param',
            'template',
            'description',
            ...(settings?.templateComments?.customTags || []),
          ];

          // Extract TSDoc from the current HTML content (not file on disk)
          const tsDocMap = analyzeTemplateDocumentation(
            content,
            supportedTags,
            true
          );
          const tsDocInfo = tsDocMap.get(templateName);

          // NEW: Store TSDoc data in global storage
          if (tsDocInfo) {
            if (tsDocInfo.description) {
              templateDescriptions[templateName] = tsDocInfo.description;
            }
            if (tsDocInfo.parameters.size > 0) {
              templateTsDocParams[templateName] = {};
              for (const [
                paramName,
                paramInfo,
              ] of tsDocInfo.parameters.entries()) {
                templateTsDocParams[templateName][paramName] = {
                  type: paramInfo.type,
                  description: paramInfo.description,
                  optional: paramInfo.optional,
                };
              }
            }
          }

          // NEW: Merge parameter data from all sources
          let dataPropertiesEnhanced:
            | Array<{
                name: string;
                type: string;
                description?: string;
                optional: boolean;
                sources: Array<'controller' | 'tsdoc' | 'inferred'>;
              }>
            | undefined;
          let templateDescription: string | undefined;

          logger.log(
            `[TSDoc] Template ${templateName}: tsDocInfo=${!!tsDocInfo}, dataProperties=${dataProperties.length}`
          );

          if (tsDocInfo || dataProperties.length > 0) {
            // Build controller params map
            const controllerParams = new Map<
              string,
              { type: string; doc?: string }
            >();
            // Note: We don't have detailed type info here, so we'll use 'any' for now
            // The full type resolution happens in analyzeTemplateData
            for (const prop of dataProperties) {
              controllerParams.set(prop, { type: 'any' });
            }

            // Build TSDoc params map
            const tsDocParams = new Map<
              string,
              { type: string; description?: string; optional: boolean }
            >();
            if (tsDocInfo) {
              logger.log(
                `[TSDoc] Found TSDoc for ${templateName} with ${tsDocInfo.parameters.size} params`
              );
              for (const [
                paramName,
                paramInfo,
              ] of tsDocInfo.parameters.entries()) {
                logger.log(
                  `[TSDoc] - ${paramName}: ${paramInfo.type} (${paramInfo.description?.substring(0, 50)}...)`
                );
                tsDocParams.set(paramName, paramInfo);
              }
              templateDescription = tsDocInfo.description;
            }

            // Extract inferred params from template
            try {
              const globalHelpers = config.globalHelpers || [];
              const inferredParams = extractParametersFromTemplate(
                templateName,
                `file://${filePath}`,
                path.dirname(filePath),
                globalHelpers
              );

              logger.log(
                `[TSDoc] Extracted ${inferredParams.length} inferred params for ${templateName}`
              );

              // Merge all sources
              const mergedParams = mergeTemplateParameters(
                templateName,
                controllerParams,
                tsDocParams,
                inferredParams
              );

              logger.log(
                `[TSDoc] Merged ${mergedParams.size} total params for ${templateName}`
              );

              dataPropertiesEnhanced = mergedParametersToEnhanced(mergedParams);

              logger.log(
                `[TSDoc] Enhanced properties for ${templateName}: ${dataPropertiesEnhanced.length} items`
              );
              dataPropertiesEnhanced.forEach((prop) => {
                logger.log(
                  `[TSDoc]   - ${prop.name}: ${prop.type} [${prop.sources.join(',')}]`
                );
              });
            } catch (err) {
              logger.error(
                `Error merging template parameters for ${templateName}: ${err}`
              );
            }
          }

          templatesMap.set(templateName, {
            name: templateName,
            helpers,
            events,
            file: filePath,
            dataProperties:
              dataProperties.length > 0 ? dataProperties : undefined,
            props: undefined,
            lifecycle: lifecycle.length > 0 ? lifecycle : undefined,
            instanceProperties:
              instanceProperties.length > 0 ? instanceProperties : undefined,
            dataPropertiesEnhanced:
              dataPropertiesEnhanced && dataPropertiesEnhanced.length > 0
                ? dataPropertiesEnhanced
                : undefined,
            templateDescription: templateDescription,
          });

          logger.log(`===== FINAL TEMPLATE ${templateName} =====`);
          logger.log(
            `Template ${templateName}: ` +
              `helpers=${helpers.length}, events=${events.length}, ` +
              `data=${dataProperties.length}, ` +
              `enhancedData=${dataPropertiesEnhanced?.length || 0}, ` +
              `lifecycle=${lifecycle.length}, instance=${instanceProperties.length}`
          );
          logger.log(`- Helpers: ${helpers.join(', ') || 'none'}`);
          logger.log(`- Events: ${events.join(', ') || 'none'}`);
          logger.log(`- Data: ${dataProperties.join(', ') || 'none'}`);
          logger.log(
            `- Enhanced Data: ${dataPropertiesEnhanced?.map((p) => p.name).join(', ') || 'none'}`
          );
          logger.log(`- Lifecycle: ${lifecycle.join(', ') || 'none'}`);
          logger.log(`- Instance: ${instanceProperties.join(', ') || 'none'}`);
          logger.log(`================================`);
        }
      };

      if (scanWorkspace) {
        logger.log(`Starting workspace scan...`);
        const glob = require('glob');
        const workspaceFolders =
          await connection.workspace.getWorkspaceFolders();

        logger.log(`Found ${workspaceFolders?.length || 0} workspace folders`);

        if (workspaceFolders && workspaceFolders.length > 0) {
          for (const folder of workspaceFolders) {
            const folderPath = folder.uri.replace('file://', '');
            logger.log(`Scanning folder: ${folderPath}`);
            const pattern = `${folderPath}/**/*.{html,hbs}`;
            logger.log(`Using glob pattern: ${pattern}`);

            try {
              const files: string[] = await new Promise((resolve, reject) => {
                glob.glob(
                  pattern,
                  { ignore: ['**/node_modules/**', '**/dist/**', '**/out/**'] },
                  (err: Error | null, matches: string[]) => {
                    if (err) {
                      reject(err);
                    } else {
                      resolve(matches);
                    }
                  }
                );
              });

              const totalFiles = files.length;
              logger.log(`Scanning ${totalFiles} files...`);

              for (let i = 0; i < files.length; i++) {
                const file = files[i];
                try {
                  const fs = require('fs');
                  const content = fs.readFileSync(file, 'utf8');
                  await processFile(file, content);

                  // Log progress every 10 files or on last file
                  if ((i + 1) % 10 === 0 || i === files.length - 1) {
                    const percent = Math.round(((i + 1) / totalFiles) * 100);
                    logger.log(
                      `Progress: ${percent}% (${i + 1}/${totalFiles})`
                    );
                  }
                } catch (err) {
                  config.logger.error(`Failed to read file ${file}: ${err}`);
                }
              }
            } catch (err) {
              config.logger.error(`Failed to glob workspace: ${err}`);
            }
          }
        }
      } else {
        // Process documents from two sources:
        // 1. Documents tracked by language server (have been opened/edited)
        // 2. Additional visible files from client (visible in tabs but not necessarily tracked)
        const processedFiles = new Set<string>();

        // First, process all tracked documents
        const documents = config.documents.all();
        logger.log(`Processing ${documents.length} tracked document(s)`);

        for (const document of documents) {
          const text = document.getText();
          const filePath = document.uri.replace('file://', '');
          processedFiles.add(filePath);
          logger.log(`Processing tracked file: ${filePath}`);
          await processFile(filePath, text);
        }

        // Then, process any visible files that weren't already tracked
        if (visibleFileUris.length > 0) {
          logger.log(
            `Processing ${visibleFileUris.length} visible file URI(s)`
          );

          for (const uri of visibleFileUris) {
            const filePath = uri.replace('file://', '');

            // Skip if already processed
            if (processedFiles.has(filePath)) {
              continue;
            }

            // Only process HTML/HBS files
            if (!/\.(html|hbs)$/i.test(filePath)) {
              continue;
            }

            try {
              const fs = require('fs');
              if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                logger.log(`Processing visible file: ${filePath}`);
                await processFile(filePath, content);
                processedFiles.add(filePath);
              }
            } catch (err) {
              config.logger.error(
                `[Sidebar] Failed to read visible file ${filePath}: ${err}`
              );
            }
          }
        }
      }

      templates.push(...templatesMap.values());

      // NEW: Store TSDoc data in config.fileAnalysis
      config.fileAnalysis.templateTsDocParams = templateTsDocParams;
      config.fileAnalysis.templateDescriptions = templateDescriptions;

      logger.log(`Found ${templates.length} templates`);
      logger.log(
        `Found TSDoc documentation for ${Object.keys(templateTsDocParams).length} templates`
      );

      return {
        templates,
        globalHelpers: [],
        templateHelpers: {},
      };
    } catch (error) {
      config.logger.error(`[Sidebar] Failed to analyze workspace: ${error}`);
      return {
        templates: [],
        globalHelpers: [],
        templateHelpers: {},
      };
    }
  }
);

// --- Export -----------------------------------------------------------------
/**
 * Small export for server bootstrap to start listening.
 * Consumers should call:
 *   documents.listen(connection);
 *   connection.listen();
 */
const connectionConfig = {
  documents,
  connection,
};

export default connectionConfig;
