import * as vscode from 'vscode';
import { TemplateInfo } from '../../types';
import { TemplateTreeDataProvider } from './templateTreeProvider';
import { WorkspaceAnalysis } from './types';

/**
 * Manages sidebar commands for the Meteor/Blaze extension.
 */
export class SidebarCommands {
  private scanWorkspace = false; // Default to open files only

  constructor(
    private context: vscode.ExtensionContext,
    private templateProvider: TemplateTreeDataProvider,
    private analysisProvider: (
      scanWorkspace: boolean
    ) => Promise<WorkspaceAnalysis>
  ) {
    // Restore scan preference from workspace state
    this.scanWorkspace = this.context.workspaceState.get(
      'meteorBlaze.scanWorkspace',
      false
    );
  }

  /**
   * Register all sidebar commands.
   */
  register(): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    // Set initial context for button visibility
    this.updateContext();

    // Refresh templates
    disposables.push(
      vscode.commands.registerCommand(
        'meteorBlaze.refreshTemplates',
        async () => {
          await this.refreshTemplates();
        }
      )
    );

    // Toggle workspace scanning (both commands do the same thing)
    disposables.push(
      vscode.commands.registerCommand(
        'meteorBlaze.toggleWorkspaceScan',
        async () => {
          await this.toggleWorkspaceScan();
        }
      )
    );

    disposables.push(
      vscode.commands.registerCommand(
        'meteorBlaze.toggleWorkspaceScan.workspace',
        async () => {
          await this.toggleWorkspaceScan();
        }
      )
    );

    // Show template quick pick menu
    disposables.push(
      vscode.commands.registerCommand(
        'meteorBlaze.showTemplateQuickPick',
        async (template: TemplateInfo) => {
          await this.showTemplateQuickPick(template);
        }
      )
    );

    // Navigate to helper
    disposables.push(
      vscode.commands.registerCommand(
        'meteorBlaze.navigateToHelper',
        async (template: TemplateInfo, helperName: string) => {
          await this.navigateToHelper(template, helperName);
        }
      )
    );

    // Navigate to event
    disposables.push(
      vscode.commands.registerCommand(
        'meteorBlaze.navigateToEvent',
        async (template: TemplateInfo, eventName: string) => {
          await this.navigateToEvent(template, eventName);
        }
      )
    );

    // Navigate to data property
    disposables.push(
      vscode.commands.registerCommand(
        'meteorBlaze.navigateToDataProperty',
        async (
          template: TemplateInfo,
          propName: string,
          metadata?: {
            type?: string;
            description?: string;
            sources?: Array<'controller' | 'tsdoc' | 'inferred'>;
          }
        ) => {
          await this.navigateToDataProperty(template, propName, metadata);
        }
      )
    );

    // Navigate to lifecycle method
    disposables.push(
      vscode.commands.registerCommand(
        'meteorBlaze.navigateToLifecycle',
        async (template: TemplateInfo, methodName: string) => {
          await this.navigateToLifecycle(template, methodName);
        }
      )
    );

    // Navigate to instance property
    disposables.push(
      vscode.commands.registerCommand(
        'meteorBlaze.navigateToInstanceProperty',
        async (template: TemplateInfo, propName: string) => {
          await this.navigateToInstanceProperty(template, propName);
        }
      )
    );

    // Navigate to template HTML
    disposables.push(
      vscode.commands.registerCommand(
        'meteorBlaze.navigateToTemplate',
        async (template: TemplateInfo) => {
          await this.navigateToTemplateHtml(template);
        }
      )
    );

    return disposables;
  }

  /**
   * Refresh templates from the language server.
   */
  private async refreshTemplates(): Promise<void> {
    try {
      this.templateProvider.setLoading(true);
      const analysis = await this.analysisProvider(this.scanWorkspace);
      this.templateProvider.refresh(analysis);
      const scope = this.scanWorkspace ? 'workspace' : 'open files';
      vscode.window.showInformationMessage(
        `Refreshed: ${analysis.templates.length} template(s) found in ${scope}`
      );
    } catch (error) {
      this.templateProvider.setLoading(false);
      vscode.window.showErrorMessage(`Failed to refresh templates: ${error}`);
    }
  }

  /**
   * Update context to control which button is visible.
   */
  private updateContext(): void {
    vscode.commands.executeCommand(
      'setContext',
      'meteorBlaze.scanWorkspace',
      this.scanWorkspace
    );
  }

  /**
   * Toggle workspace scanning mode.
   */
  private async toggleWorkspaceScan(): Promise<void> {
    this.scanWorkspace = !this.scanWorkspace;
    await this.context.workspaceState.update(
      'meteorBlaze.scanWorkspace',
      this.scanWorkspace
    );

    // Update context for button visibility
    this.updateContext();

    const mode = this.scanWorkspace ? 'entire workspace' : 'open files only';
    vscode.window.showInformationMessage(`Template scanning: ${mode}`);

    // Automatically refresh with new mode
    await this.refreshTemplates();
  }

  /**
   * Get current scan mode.
   */
  getScanWorkspace(): boolean {
    return this.scanWorkspace;
  }

  /**
   * Show quick pick menu for template actions.
   */
  private async showTemplateQuickPick(template: TemplateInfo): Promise<void> {
    const items: {
      id: string;
      handler: () => Promise<void>;
      item: vscode.QuickPickItem;
    }[] = [];

    items.push({
      id: 'Go to HTML Template',
      handler: () => this.navigateToTemplateHtml(template),
      item: {
        label: '$(file-code) Go to HTML Template',
        description: template.file,
        detail: 'Navigate to template definition in HTML file',
      },
    });

    if (template.helpers.length > 0) {
      items.push({
        id: 'Go to Helpers',
        handler: () => this.navigateToHelpers(template),
        item: {
          label: '$(symbol-method) Go to Helpers',
          description: `${template.helpers.length} helper(s)`,
          detail: 'Navigate to Template.helpers() definition',
        },
      });
    }

    if (template.events.length > 0) {
      items.push({
        id: 'Go to Events',
        handler: () => this.navigateToEvents(template),
        item: {
          label: '$(debug-stackframe) Go to Events',
          description: `${template.events.length} event(s)`,
          detail: 'Navigate to Template.events() definition',
        },
      });
    }

    items.push({
      id: 'Show All References',
      handler: () => this.showAllReferences(template),
      item: {
        label: '$(references) Show All References',
        description: '',
        detail: 'Find all places where this template is used',
      },
    });

    const selected = await vscode.window.showQuickPick(
      items.map(({ item }) => item),
      { placeHolder: `Actions for template: ${template.name}` }
    );

    if (!selected) {
      return;
    }

    const matched = items.find(({ id }) => selected.label.includes(id));
    if (!matched) {
      return;
    }

    await matched.handler();
  }

  private async navigateToTemplateHtml(template: TemplateInfo): Promise<void> {
    try {
      const uri = vscode.Uri.file(template.file);
      const document = await vscode.workspace.openTextDocument(uri);

      const text = document.getText();
      const templatePattern = new RegExp(
        `<template\\s+name=["']${template.name}["']`,
        'i'
      );
      const match = templatePattern.exec(text);

      if (match) {
        const position = document.positionAt(match.index);
        await vscode.window.showTextDocument(document, {
          selection: new vscode.Range(position, position),
        });
      } else {
        await vscode.window.showTextDocument(document);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open template: ${error}`);
    }
  }

  private async navigateToHelpers(template: TemplateInfo): Promise<void> {
    await this.navigateToTemplateCode(template, 'helpers');
  }

  private async navigateToEvents(template: TemplateInfo): Promise<void> {
    await this.navigateToTemplateCode(template, 'events');
  }

  private async navigateToHelper(
    template: TemplateInfo,
    helperName: string
  ): Promise<void> {
    await this.navigateToTemplateCode(template, 'helpers', helperName);
  }

  private async navigateToEvent(
    template: TemplateInfo,
    eventName: string
  ): Promise<void> {
    await this.navigateToTemplateCode(template, 'events', eventName);
  }

  private async navigateToDataProperty(
    template: TemplateInfo,
    propName: string,
    metadata?: {
      type?: string;
      description?: string;
      sources?: Array<'controller' | 'tsdoc' | 'inferred'>;
    }
  ): Promise<void> {
    // Priority 1: Navigate to controller/TypeScript file if it exists
    if (metadata?.sources?.includes('controller')) {
      await this.navigateToTemplateCode(template, 'data', propName);
    }
    // Priority 2: Navigate to TSDoc @param in HTML file
    else if (metadata?.sources?.includes('tsdoc')) {
      await this.navigateToTsDocParam(template, propName);
    }
    // Fallback: Try TypeScript file for inferred properties
    else {
      await this.navigateToTemplateCode(template, 'data', propName);
    }
  }

  /**
   * Navigate to a TSDoc @param line in the template HTML file
   */
  private async navigateToTsDocParam(
    template: TemplateInfo,
    propName: string
  ): Promise<void> {
    try {
      const htmlPath = template.file;
      const uri = vscode.Uri.file(htmlPath);
      const document = await vscode.workspace.openTextDocument(uri);
      const text = document.getText();

      // Find the template definition
      const templatePattern = new RegExp(
        `<template\\s+name=["']${template.name}["']`,
        'i'
      );
      const templateMatch = templatePattern.exec(text);

      if (!templateMatch) {
        console.error(
          `[navigateToTsDocParam] Could not find template ${template.name}`
        );
        await vscode.window.showTextDocument(document);
        return;
      }

      // Find the first comment block after the template tag
      const commentStart = text.indexOf('{{!--', templateMatch.index);
      if (commentStart === -1) {
        console.error(
          `[navigateToTsDocParam] No TSDoc comment found for template ${template.name}`
        );
        await vscode.window.showTextDocument(document);
        return;
      }

      const commentEnd = text.indexOf('--}}', commentStart);
      if (commentEnd === -1) {
        console.error(
          `[navigateToTsDocParam] Malformed TSDoc comment for template ${template.name}`
        );
        await vscode.window.showTextDocument(document);
        return;
      }

      const commentText = text.substring(commentStart, commentEnd + 4);

      // Find the @param line for this property
      const paramPattern = new RegExp(
        `@param\\s+\\{[^}]+\\}\\s+${propName}\\b`,
        'i'
      );
      const paramMatch = paramPattern.exec(commentText);

      if (!paramMatch) {
        console.error(
          `[navigateToTsDocParam] Could not find @param ${propName} in TSDoc comment`
        );
        // Fall back to opening the comment start
        const position = document.positionAt(commentStart);
        await vscode.window.showTextDocument(document, {
          selection: new vscode.Range(position, position),
        });
        return;
      }

      // Navigate to the @param line
      const absoluteParamPosition = commentStart + paramMatch.index;
      const position = document.positionAt(absoluteParamPosition);

      await vscode.window.showTextDocument(document, {
        selection: new vscode.Range(position, position),
      });
    } catch (error) {
      console.error('[navigateToTsDocParam] Error:', error);
      vscode.window.showErrorMessage(
        `Could not navigate to parameter ${propName}: ${error}`
      );
    }
  }

  private async navigateToLifecycle(
    template: TemplateInfo,
    methodName: string
  ): Promise<void> {
    await this.navigateToTemplateCode(template, 'lifecycle', methodName);
  }

  private async navigateToInstanceProperty(
    template: TemplateInfo,
    propName: string
  ): Promise<void> {
    await this.navigateToTemplateCode(template, 'instanceProps', propName);
  }

  private async navigateToTemplateCode(
    template: TemplateInfo,
    type:
      | 'helpers'
      | 'events'
      | 'data'
      | 'props'
      | 'lifecycle'
      | 'instanceProps',
    specificItem?: string
  ): Promise<void> {
    try {
      const htmlPath = template.file;
      const basePath = htmlPath.replace(/\.html?$/i, '');
      const path = require('path');
      const dirPath = path.dirname(basePath);
      const possiblePaths: string[] = [];

      // Add filename-based paths (e.g., template.ts)
      for (const ext of ['.js', '.ts', '.jsx', '.tsx']) {
        possiblePaths.push(basePath + ext);
      }

      // Add template-name-based paths (e.g., test.ts for template named 'test')
      for (const ext of ['.js', '.ts', '.jsx', '.tsx']) {
        possiblePaths.push(path.join(dirPath, template.name + ext));
      }

      for (const jsPath of possiblePaths) {
        try {
          const uri = vscode.Uri.file(jsPath);
          const document = await vscode.workspace.openTextDocument(uri);
          const text = document.getText();

          let match: RegExpExecArray | null = null;
          let position: vscode.Position | null = null;

          // Different search patterns based on type
          if (type === 'helpers' || type === 'events') {
            // Find Template.name.helpers(...) or Template.name.events(...)
            const pattern = new RegExp(
              `Template\\.${template.name}\\.${type}\\s*\\(`,
              'i'
            );
            match = pattern.exec(text);
          } else if (type === 'lifecycle' && specificItem) {
            // Find Template.name.onCreated, onRendered, or onDestroyed
            // Handle both: Template.name.onCreated = function() {...} and Template.name.onCreated(function() {...})
            const pattern = new RegExp(
              `Template\\.${template.name}\\.${specificItem}\\s*[=(]`,
              'i'
            );
            match = pattern.exec(text);
          } else if (type === 'data' && specificItem) {
            // Search for type definitions or this.data.propName
            const escapedItem = specificItem.replace(
              /[.*+?^${}()|[\]\\]/g,
              '\\$&'
            );

            // First, try to find the type definition that matches this template's data
            const templateNamePascal =
              template.name.charAt(0).toUpperCase() + template.name.slice(1);
            const typeNamePatterns = [
              `type\\s+${templateNamePascal}(?:Template)?Data`,
              `type\\s+${template.name}(?:Template)?Data`,
              `interface\\s+${templateNamePascal}(?:Template)?Data`,
              `interface\\s+${template.name}(?:Template)?Data`,
            ];

            // Try to find the type/interface definition first
            for (const typeNamePattern of typeNamePatterns) {
              const typeNameRegex = new RegExp(
                typeNamePattern + '\\s*=?\\s*\\{',
                'i'
              );
              const typeMatch = typeNameRegex.exec(text);
              if (typeMatch) {
                // Find the end of this type definition using brace matching
                const startBrace = text.indexOf('{', typeMatch.index);
                let braceCount = 1;
                let endBrace = startBrace + 1;
                while (endBrace < text.length && braceCount > 0) {
                  if (text[endBrace] === '{') {
                    braceCount++;
                  } else if (text[endBrace] === '}') {
                    braceCount--;
                  }
                  endBrace++;
                }

                // Now search for the property within this type definition
                const typeBody = text.substring(startBrace, endBrace);
                const propPattern = new RegExp(
                  `^\\s*(?:\\/\\*\\*[\\s\\S]*?\\*\\/\\s*)?${escapedItem}\\s*[?:]`,
                  'gm'
                );
                const propMatch = propPattern.exec(typeBody);
                if (propMatch) {
                  match = {
                    index: startBrace + propMatch.index,
                  } as RegExpExecArray;
                  break;
                }
              }
            }

            // If not found in type definition, try other patterns
            if (!match) {
              const patterns = [
                // Type definition: propName: type or propName?: type (anywhere)
                new RegExp(
                  `^\\s*(?:\\/\\*\\*[\\s\\S]*?\\*\\/\\s*)?${escapedItem}\\s*[?:]`,
                  'gm'
                ),
                // Runtime usage: this.data.propName
                new RegExp(`this\\.data\\.${escapedItem}\\b`, 'i'),
                // Template.currentData().propName
                new RegExp(
                  `Template\\.currentData\\(\\)\\.${escapedItem}\\b`,
                  'i'
                ),
              ];
              for (const pattern of patterns) {
                match = pattern.exec(text);
                if (match) {
                  break;
                }
              }
            }
          } else if (type === 'instanceProps' && specificItem) {
            // Search in TemplateStaticTyped type parameter or type definition
            const escapedItem = specificItem.replace(
              /[.*+?^${}()|[\]\\]/g,
              '\\$&'
            );

            // Try to find the TemplateStaticTyped declaration for this template
            // This handles patterns like:
            // TemplateStaticTyped<'test', TestData, { props: TestProps }>
            // TemplateStaticTyped<'test', TestData, TestInstanceType>
            const templateStaticPattern = new RegExp(
              `TemplateStaticTyped\\s*<\\s*['"]${template.name}['"]\\s*,\\s*[^,>]+\\s*,\\s*`,
              'gi'
            );

            let templateStaticMatch;
            while (
              (templateStaticMatch = templateStaticPattern.exec(text)) !== null
            ) {
              // Find the complete third parameter by matching angle brackets
              const startPos =
                templateStaticMatch.index + templateStaticMatch[0].length;
              let angleCount = 1; // We're already inside the first <
              let endPos = startPos;
              let inString = false;
              let stringChar = '';

              // Find the end of the TemplateStaticTyped<...> by matching < and >
              while (endPos < text.length && angleCount > 0) {
                const char = text[endPos];

                // Handle strings
                if (
                  (char === '"' || char === "'" || char === '`') &&
                  text[endPos - 1] !== '\\'
                ) {
                  if (!inString) {
                    inString = true;
                    stringChar = char;
                  } else if (char === stringChar) {
                    inString = false;
                  }
                }

                if (!inString) {
                  if (char === '<') {
                    angleCount++;
                  } else if (char === '>') {
                    angleCount--;
                  }
                }
                endPos++;
              }

              const thirdParam = text.substring(startPos, endPos - 1).trim();

              // Check if third parameter is an inline object type
              if (thirdParam.startsWith('{')) {
                // For inline object types like { props: TestProps }
                // Check if it references another type via props property
                const propsRefMatch = /props\s*:\s*([A-Za-z_][\w]*)/i.exec(
                  thirdParam
                );
                if (propsRefMatch) {
                  const propsTypeName = propsRefMatch[1];

                  // Search for the props type definition
                  const propsTypePattern = new RegExp(
                    `(?:type|interface)\\s+${propsTypeName}\\s*=?\\s*\\{`,
                    'i'
                  );
                  const propsTypeDefMatch = propsTypePattern.exec(text);
                  if (propsTypeDefMatch) {
                    const startBrace = text.indexOf(
                      '{',
                      propsTypeDefMatch.index
                    );
                    let braceCount = 1;
                    let endBrace = startBrace + 1;
                    while (endBrace < text.length && braceCount > 0) {
                      if (text[endBrace] === '{') {
                        braceCount++;
                      } else if (text[endBrace] === '}') {
                        braceCount--;
                      }
                      endBrace++;
                    }

                    const typeBody = text.substring(startBrace, endBrace);
                    const propPattern = new RegExp(
                      `^\\s*(?:\\/\\*\\*[\\s\\S]*?\\*\\/\\s*)?${escapedItem}\\s*[?:]`,
                      'gm'
                    );
                    const propMatch = propPattern.exec(typeBody);
                    if (propMatch) {
                      match = {
                        index: startBrace + propMatch.index,
                      } as RegExpExecArray;

                      break;
                    }
                  }
                } else {
                  // Direct inline object without props indirection
                  const propPattern = new RegExp(`${escapedItem}\\s*[?:]`, 'i');
                  const propMatch = propPattern.exec(thirdParam);
                  if (propMatch) {
                    match = {
                      index: startPos + propMatch.index,
                    } as RegExpExecArray;

                    break;
                  }
                }
              } else {
                // Third parameter is a named type, search for that type definition
                const typeDefPattern = new RegExp(
                  `(?:type|interface)\\s+${thirdParam}\\s*=?\\s*\\{`,
                  'i'
                );
                const typeDefMatch = typeDefPattern.exec(text);
                if (typeDefMatch) {
                  // Find the property within this type definition
                  const startBrace = text.indexOf('{', typeDefMatch.index);
                  let braceCount = 1;
                  let endBrace = startBrace + 1;
                  while (endBrace < text.length && braceCount > 0) {
                    if (text[endBrace] === '{') {
                      braceCount++;
                    } else if (text[endBrace] === '}') {
                      braceCount--;
                    }
                    endBrace++;
                  }

                  const typeBody = text.substring(startBrace, endBrace);
                  const propPattern = new RegExp(
                    `^\\s*(?:\\/\\*\\*[\\s\\S]*?\\*\\/\\s*)?${escapedItem}\\s*[?:]`,
                    'gm'
                  );
                  const propMatch = propPattern.exec(typeBody);
                  if (propMatch) {
                    match = {
                      index: startBrace + propMatch.index,
                    } as RegExpExecArray;
                    break;
                  }
                }
              }
            }

            // Don't use fallback patterns - if we didn't find it in the correct type, show an error
          }

          if (match) {
            position = document.positionAt(match.index);

            if (specificItem && (type === 'helpers' || type === 'events')) {
              // Search for the specific helper/event within the block
              // Handle various formats:
              // - methodName: function() { }
              // - methodName() { }
              // - methodName: () => { }
              // - 'event selector': function() { }
              const escapedItem = specificItem.replace(
                /[.*+?^${}()|[\]\\]/g,
                '\\$&'
              );

              // Try multiple patterns for finding the helper/event
              const patterns = [
                // For helpers: methodName: or methodName(
                new RegExp(`\\b${escapedItem}\\s*[:(/]`, 'i'),
                // For events: 'event selector' or "event selector"
                new RegExp(`['"\`]${escapedItem}['"\`]\\s*:`, 'i'),
              ];

              for (const itemPattern of patterns) {
                const itemMatch = itemPattern.exec(text.substring(match.index));
                if (itemMatch) {
                  position = document.positionAt(match.index + itemMatch.index);
                  break;
                }
              }
            }

            await vscode.window.showTextDocument(document, {
              selection: new vscode.Range(position, position),
            });
            return;
          }
        } catch (err) {
          console.error(
            `[navigateToTemplateCode] Failed to open ${jsPath}:`,
            err
          );
          continue;
        }
      }

      // If no JS/TS file found or property not found, try to show the HTML template file where it's used
      if (type === 'data' || type === 'props') {
        try {
          const htmlUri = vscode.Uri.file(template.file);
          const htmlDoc = await vscode.workspace.openTextDocument(htmlUri);
          const htmlText = htmlDoc.getText();

          // Search for the property usage in the HTML
          if (specificItem) {
            const htmlPattern = new RegExp(
              `\\{\\{[^}]*\\b${specificItem}\\b[^}]*\\}\\}`,
              'i'
            );
            const htmlMatch = htmlPattern.exec(htmlText);

            if (htmlMatch) {
              const position = htmlDoc.positionAt(htmlMatch.index);
              await vscode.window.showTextDocument(htmlDoc, {
                selection: new vscode.Range(position, position),
              });
              // vscode.window.showInformationMessage(
              //   `Showing usage of "${specificItem}" in template HTML (no type definition found)`
              // );
              return;
            }
          }
        } catch {
          // Fall through to warning message
        }
      }

      // Provide more helpful error messages based on type
      const typeMessages: Record<string, string> = {
        data: `Could not find data property definition for "${specificItem}" in template: ${template.name}`,
        lifecycle: `Could not find lifecycle method "${specificItem}" for template: ${template.name}`,
        instanceProps: `Could not find instance property definition for "${specificItem}" in template: ${template.name}`,
        helpers: `Could not find helpers definition for template: ${template.name}`,
        events: `Could not find events definition for template: ${template.name}`,
      };

      vscode.window.showWarningMessage(
        typeMessages[type] ||
          `Could not find ${type} definition for template: ${template.name}`
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to navigate: ${error}`);
    }
  }

  private async showAllReferences(template: TemplateInfo): Promise<void> {
    const searchPattern = `{{>\\s*${template.name}`;

    await vscode.commands.executeCommand('workbench.action.findInFiles', {
      query: searchPattern,
      isRegex: true,
      isCaseSensitive: true,
      matchWholeWord: false,
      triggerSearch: true,
    });
  }
}
