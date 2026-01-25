/**
 * Language Server Connection Entrypoint

 * Wires up VS Code LSP server connection and document manager, and registers
 * all request/notification handlers. Exports a small object with the active
 * connection and documents manager for use by the extension bootstrap.
 */

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
import { analyzeTemplateData } from '../helpers/analyzeTemplateData.js';
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
  logger: new Logger(connection).disable(),
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
    try {
      const scanWorkspace = params.scanWorkspace ?? false;
      const visibleFileUris = params.visibleFileUris ?? [];
      config.logger.log(
        `[Sidebar] Analyzing workspace (scanWorkspace: ${scanWorkspace}, visibleFiles: ${visibleFileUris.length})...`
      );

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
        }
      >();

      const processFile = (filePath: string, content: string) => {
        const templateMatches = content.matchAll(
          /<template\s+name=["']([^"']+)["'][^>]*>/g
        );

        for (const match of templateMatches) {
          const templateName = match[1];
          const templateStartIndex = match.index;

          // Find the end of this template (either next <template> or </template>)
          const nextTemplateMatch = /<template\s+name=["']/g;
          nextTemplateMatch.lastIndex = templateStartIndex + 1;
          const nextTemplate = nextTemplateMatch.exec(content);
          const closeTemplateIndex = content.indexOf(
            '</template>',
            templateStartIndex
          );

          // Template content is from start to either close tag or next template
          const templateEndIndex =
            closeTemplateIndex > 0
              ? closeTemplateIndex
              : nextTemplate
                ? nextTemplate.index
                : content.length;
          const templateContent = content.substring(
            templateStartIndex,
            templateEndIndex
          );

          // Extract data references from THIS template's HTML content only
          const dataFromTemplate: string[] = [];
          const dataPatterns = [
            // {{variable}} or {{variable.prop}}
            /\{\{(?:[#/])?(?:if|unless|each|with)?\s*([a-zA-Z_$][\w$]*)(?:\s|\.|\})/g,
            // {{#each item in variable}}
            /\{\{#each\s+\w+\s+in\s+([a-zA-Z_$][\w$]*)\}\}/g,
          ];

          for (const pattern of dataPatterns) {
            let dataMatch;
            while ((dataMatch = pattern.exec(templateContent)) !== null) {
              const varName = dataMatch[1];
              // Filter out Blaze block helpers, boolean literals, and common keywords
              const excludedNames = [
                'if',
                'unless',
                'each',
                'with',
                'let',
                'else',
                'this',
                'true',
                'false',
                'null',
                'undefined',
                'True',
                'False',
                'Null',
                'Undefined',
              ];
              if (
                varName &&
                !excludedNames.includes(varName) &&
                !dataFromTemplate.includes(varName)
              ) {
                dataFromTemplate.push(varName);
              }
            }
          }
          const helpers: string[] = [];
          const events: string[] = [];
          const dataProperties: string[] = [...dataFromTemplate];
          const lifecycle: string[] = [];
          const instanceProperties: string[] = [];
          const basePath = filePath.replace(/\.(html|hbs)$/, '');

          // Look for corresponding JS/TS file and extract helpers, events, and data types
          for (const ext of ['.js', '.ts', '.jsx', '.tsx']) {
            const jsPath = basePath + ext;
            try {
              const fs = require('fs');
              if (fs.existsSync(jsPath)) {
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
                  config.logger.log(
                    `[Sidebar] Found type definition for ${templateName}`
                  );
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
                  config.logger.log(
                    `[Sidebar] Type body length: ${typeBody.length}`
                  );

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
                      config.logger.log(
                        `[Sidebar] Found data property from type: ${propName}`
                      );
                    }
                  }
                } else {
                  config.logger.log(
                    `[Sidebar] No type definition found for ${templateName}`
                  );
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
                  // Extract helper names (method names or properties)
                  const helperMatches = helpersBlock.matchAll(
                    /(?:^|,)\s*(?:\/\*\*[\s\S]*?\*\/\s*)?(\w+)\s*[:(/]/gm
                  );
                  for (const helperMatch of helperMatches) {
                    const helperName = helperMatch[1];
                    // Filter out common JS keywords that aren't helpers
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
                      ].includes(helperName)
                    ) {
                      helpers.push(helperName);
                    }
                  }
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

                config.logger.log(
                  `[Sidebar] After lifecycle extraction for ${templateName}: ${lifecycle.join(', ')}`
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

                config.logger.log(
                  `[Sidebar] After runtime data extraction for ${templateName}: ${dataProperties.join(', ')}`
                );

                // Extract instance properties from TemplateStaticTyped<N, D, T>
                const instanceProperties: string[] = [];
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
                    config.logger.log(
                      `[Sidebar] Found instance type ${instanceTypeName} for ${templateName} with ${instanceProps.length} properties`
                    );
                  }
                } catch (err) {
                  config.logger.error(
                    `[Sidebar] Error analyzing template data for ${templateName}: ${err}`
                  );
                }

                config.logger.log(
                  `[Sidebar] Instance properties for ${templateName}: ${instanceProperties.join(', ')}`
                );

                break;
              }
            } catch (err) {
              config.logger.error(`Error reading JS file ${jsPath}: ${err}`);
            }
          }

          templatesMap.set(templateName, {
            name: templateName,
            helpers,
            events,
            file: filePath,
            dataProperties:
              dataProperties.length > 0 ? dataProperties : undefined,
            lifecycle: lifecycle.length > 0 ? lifecycle : undefined,
            instanceProperties:
              instanceProperties.length > 0 ? instanceProperties : undefined,
          });

          config.logger.log(
            `[Sidebar] Template ${templateName}: ` +
              `helpers=${helpers.length}, events=${events.length}, ` +
              `data=${dataProperties.length}, ` +
              `lifecycle=${lifecycle.length}, instance=${instanceProperties.length}`
          );
        }
      };

      if (scanWorkspace) {
        const glob = require('glob');
        const workspaceFolders =
          await connection.workspace.getWorkspaceFolders();

        if (workspaceFolders && workspaceFolders.length > 0) {
          for (const folder of workspaceFolders) {
            const folderPath = folder.uri.replace('file://', '');
            const pattern = `${folderPath}/**/*.{html,hbs}`;

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
              config.logger.log(`[Sidebar] Scanning ${totalFiles} files...`);

              for (let i = 0; i < files.length; i++) {
                const file = files[i];
                try {
                  const fs = require('fs');
                  const content = fs.readFileSync(file, 'utf8');
                  processFile(file, content);

                  // Log progress every 10 files or on last file
                  if ((i + 1) % 10 === 0 || i === files.length - 1) {
                    const percent = Math.round(((i + 1) / totalFiles) * 100);
                    config.logger.log(
                      `[Sidebar] Progress: ${percent}% (${i + 1}/${totalFiles})`
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
        config.logger.log(
          `[Sidebar] Processing ${documents.length} tracked document(s)`
        );

        for (const document of documents) {
          const text = document.getText();
          const filePath = document.uri.replace('file://', '');
          processedFiles.add(filePath);
          config.logger.log(`[Sidebar] Processing tracked file: ${filePath}`);
          processFile(filePath, text);
        }

        // Then, process any visible files that weren't already tracked
        if (visibleFileUris.length > 0) {
          config.logger.log(
            `[Sidebar] Processing ${visibleFileUris.length} visible file URI(s)`
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
                config.logger.log(
                  `[Sidebar] Processing visible file: ${filePath}`
                );
                processFile(filePath, content);
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

      config.logger.log(`[Sidebar] Found ${templates.length} templates`);

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
