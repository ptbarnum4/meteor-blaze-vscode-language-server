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
        async (template: TemplateInfo, propName: string) => {
          await this.navigateToDataProperty(template, propName);
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
    propName: string
  ): Promise<void> {
    await this.navigateToTemplateCode(template, 'data', propName);
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
      const possiblePaths = [
        `${basePath}.js`,
        `${basePath}.ts`,
        `${basePath}.jsx`,
        `${basePath}.tsx`,
      ];

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
            const pattern = new RegExp(
              `Template\\.${template.name}\\.${specificItem}`,
              'i'
            );
            match = pattern.exec(text);
          } else if (type === 'data' && specificItem) {
            // Search for type definitions or this.data.propName
            const escapedItem = specificItem.replace(
              /[.*+?^${}()|[\]\\]/g,
              '\\$&'
            );
            const patterns = [
              // Type definition: propName: type or propName?: type
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
              // In template data type definition (broader search)
              new RegExp(`\\b${escapedItem}\\s*[?:]\\s*`, 'g'),
            ];
            for (const pattern of patterns) {
              match = pattern.exec(text);
              if (match) {
                break;
              }
            }
          } else if (type === 'instanceProps' && specificItem) {
            // Search in TemplateStaticTyped type parameter or type definition
            const escapedItem = specificItem.replace(
              /[.*+?^${}()|[\]\\]/g,
              '\\$&'
            );
            const patterns = [
              // Type definition: propName: type or propName?: type
              new RegExp(
                `^\\s*(?:\\/\\*\\*[\\s\\S]*?\\*\\/\\s*)?${escapedItem}\\s*[?:]`,
                'gm'
              ),
              // Broader search
              new RegExp(`\\b${escapedItem}\\s*[?:]\\s*`, 'g'),
            ];
            for (const pattern of patterns) {
              match = pattern.exec(text);
              if (match) {
                break;
              }
            }
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
        } catch {
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
