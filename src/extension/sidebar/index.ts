import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';

import { HelperInfo, TemplateInfo } from '../../types';
import { SidebarCommands } from './commands';
import { TemplateTreeDataProvider } from './templateTreeProvider';
import { WorkspaceAnalysis } from './types';

/**
 * Main coordinator for the Meteor/Blaze sidebar.
 */
export class SidebarManager {
  private templateTreeView?: vscode.TreeView<vscode.TreeItem>;
  private templateProvider: TemplateTreeDataProvider;
  private sidebarCommands?: SidebarCommands;
  private client?: LanguageClient;

  constructor(private context: vscode.ExtensionContext) {
    this.templateProvider = new TemplateTreeDataProvider();
  }

  /**
   * Initialize the sidebar with the language client.
   */
  async initialize(client: LanguageClient): Promise<void> {
    this.client = client;

    // Create template tree view
    this.templateTreeView = vscode.window.createTreeView('meteorTemplates', {
      treeDataProvider: this.templateProvider,
      showCollapseAll: true,
    });

    // Register commands
    this.sidebarCommands = new SidebarCommands(
      this.context,
      this.templateProvider,
      (scanWorkspace: boolean) => this.getWorkspaceAnalysis(scanWorkspace)
    );

    const commandDisposables = this.sidebarCommands.register();
    commandDisposables.forEach((d) => this.context.subscriptions.push(d));

    // Subscribe to tree view
    this.context.subscriptions.push(this.templateTreeView);

    // Set up file watchers for auto-refresh
    this.setupFileWatchers();

    // Initial load
    await this.refreshAnalysis();
  }

  /**
   * Set up file system watchers to auto-refresh on changes.
   */
  private setupFileWatchers(): void {
    // Watch for HTML file changes
    const htmlWatcher =
      vscode.workspace.createFileSystemWatcher('**/*.{html,hbs}');
    htmlWatcher.onDidChange(() => this.debouncedRefresh());
    htmlWatcher.onDidCreate(() => this.debouncedRefresh());
    htmlWatcher.onDidDelete(() => this.debouncedRefresh());
    this.context.subscriptions.push(htmlWatcher);

    // Watch for JS/TS file changes
    const jsWatcher = vscode.workspace.createFileSystemWatcher(
      '**/*.{js,ts,jsx,tsx}'
    );
    jsWatcher.onDidChange(() => this.debouncedRefresh());
    jsWatcher.onDidCreate(() => this.debouncedRefresh());
    jsWatcher.onDidDelete(() => this.debouncedRefresh());
    this.context.subscriptions.push(jsWatcher);
  }

  private refreshTimeout?: NodeJS.Timeout;

  /**
   * Debounced refresh to avoid excessive updates.
   */
  private debouncedRefresh(): void {
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
    }
    this.refreshTimeout = setTimeout(() => {
      this.refreshAnalysis();
    }, 500);
  }

  /**
   * Refresh analysis from language server.
   */
  async refreshAnalysis(): Promise<void> {
    if (!this.client) {
      console.warn('Language client not initialized yet');
      return;
    }

    const scanWorkspace = this.sidebarCommands?.getScanWorkspace() ?? true;

    if (scanWorkspace) {
      // Use progress indicator for workspace scan with view-specific location
      await vscode.window.withProgress(
        {
          location: { viewId: 'meteorTemplates' },
          title: 'Scanning',
          cancellable: false,
        },
        async (progress) => {
          progress.report({ message: 'Finding template files...' });

          try {
            const analysis = await this.getWorkspaceAnalysis(scanWorkspace);
            progress.report({
              message: `Found ${analysis.templates.length} template(s)`,
              increment: 100,
            });
            this.templateProvider.refresh(analysis);
          } catch (error) {
            this.templateProvider.setLoading(false);
            console.error('Failed to refresh sidebar analysis:', error);
            vscode.window.showErrorMessage(
              `Failed to load templates: ${error}`
            );
          }
        }
      );
    } else {
      // Simple loading for open files
      try {
        this.templateProvider.setLoading(true, 'Scanning open files...');
        const analysis = await this.getWorkspaceAnalysis(scanWorkspace);
        this.templateProvider.refresh(analysis);
      } catch (error) {
        this.templateProvider.setLoading(false);
        console.error('Failed to refresh sidebar analysis:', error);
        vscode.window.showErrorMessage(`Failed to load templates: ${error}`);
      }
    }
  }

  /**
   * Get workspace analysis from the language server.
   */
  private async getWorkspaceAnalysis(
    scanWorkspace: boolean
  ): Promise<WorkspaceAnalysis> {
    if (!this.client) {
      return {
        templates: [],
        globalHelpers: [],
        templateHelpers: new Map(),
        customHelpers: [],
      };
    }

    try {
      // If not scanning workspace, collect all visible text editor URIs
      let visibleFileUris: string[] = [];
      if (!scanWorkspace) {
        visibleFileUris = vscode.window.visibleTextEditors
          .filter((editor) => editor.document.uri.scheme === 'file')
          .map((editor) => editor.document.uri.toString());
      }

      // Request analysis from language server with timeout
      const result = await Promise.race([
        this.client.sendRequest<{
          templates: Array<{
            name: string;
            helpers: string[];
            events: string[];
            file: string;
            dataProperties?: string[];
            dataPropertiesEnhanced?: Array<{
              name: string;
              type: string;
              description?: string;
              optional: boolean;
              sources: string[];
            }>;
            props?: string[];
            lifecycle?: string[];
            instanceProperties?: string[];
          }>;
          globalHelpers: Array<{
            name: string;
            jsdoc?: string;
            returnType?: string;
            parameters?: string;
          }>;
          templateHelpers: Record<
            string,
            Array<{ name: string; jsdoc?: string; returnType?: string }>
          >;
        }>('meteor/analyzeWorkspace', { scanWorkspace, visibleFileUris }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('Request timed out after 30 seconds')),
            30000
          )
        ),
      ]);

      // Convert to our format
      const templates: TemplateInfo[] = result.templates.map<TemplateInfo>(
        (t) => {
          return {
            name: t.name,
            helpers: t.helpers,
            events: t.events,
            file: t.file,
            dataProperties: t.dataProperties,
            dataPropertiesEnhanced: t.dataPropertiesEnhanced,
            props: t.props,
            lifecycle: t.lifecycle,
            instanceProperties: t.instanceProperties,
          } as TemplateInfo;
        }
      );

      const globalHelpers: HelperInfo[] = result.globalHelpers.map((h) => ({
        name: h.name,
        jsdoc: h.jsdoc,
        returnType: h.returnType,
        parameters: h.parameters,
      }));

      const templateHelpers = new Map<string, HelperInfo[]>();
      for (const [key, helpers] of Object.entries(result.templateHelpers)) {
        templateHelpers.set(key, helpers as HelperInfo[]);
      }

      return {
        templates,
        globalHelpers,
        templateHelpers,
        customHelpers: [],
      };
    } catch (error) {
      console.error('Failed to get workspace analysis:', error);
      return {
        templates: [],
        globalHelpers: [],
        templateHelpers: new Map(),
        customHelpers: [],
      };
    }
  }

  /**
   * Dispose of sidebar resources.
   */
  dispose(): void {
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
    }
  }
}
