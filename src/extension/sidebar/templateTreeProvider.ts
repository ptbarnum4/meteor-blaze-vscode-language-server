import * as vscode from 'vscode';
import { TemplateInfo } from '../../types';
import {
  TemplateContainerTreeItem,
  TemplateDetailTreeItem,
  TemplateTreeItem,
  WorkspaceAnalysis,
} from './types';

/**
 * Provides tree data for the Meteor templates view in the sidebar.
 */
export class TemplateTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    vscode.TreeItem | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private templates: TemplateInfo[] = [];
  private expandedTemplates = new Set<string>();
  private isLoading = false;
  private loadingMessage = 'Loading templates...';

  constructor() {}

  /**
   * Refresh the tree view with new data.
   */
  refresh(analysis?: WorkspaceAnalysis): void {
    if (analysis) {
      this.templates = analysis.templates;
    }
    this.isLoading = false;
    this._onDidChangeTreeData.fire();
  }

  /**
   * Set loading state.
   */
  setLoading(loading: boolean, message?: string): void {
    this.isLoading = loading;
    if (message) {
      this.loadingMessage = message;
    } else {
      this.loadingMessage = 'Loading templates...';
    }
    this._onDidChangeTreeData.fire();
  }

  /**
   * Get tree item for a given element.
   */
  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get children for a given element (or root if element is undefined).
   */
  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (!element) {
      // Root level - show loading or templates
      if (this.isLoading) {
        const loadingItem = new vscode.TreeItem(
          this.loadingMessage,
          vscode.TreeItemCollapsibleState.None
        );
        loadingItem.iconPath = new vscode.ThemeIcon('sync~spin');
        return [loadingItem];
      }

      if (this.templates.length === 0) {
        const emptyItem = new vscode.TreeItem(
          'No templates found',
          vscode.TreeItemCollapsibleState.None
        );
        emptyItem.iconPath = new vscode.ThemeIcon('info');
        emptyItem.description = 'Click refresh to scan workspace';
        return [emptyItem];
      }

      console.log(
        `[TreeProvider] Returning ${this.templates.length} templates`
      );
      return this.templates
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((template) => {
          const hasContent =
            template.helpers.length > 0 ||
            template.events.length > 0 ||
            (template.dataProperties && template.dataProperties.length > 0) ||
            (template.lifecycle && template.lifecycle.length > 0) ||
            (template.instanceProperties &&
              template.instanceProperties.length > 0);
          const state = hasContent
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None;

          console.log(
            `[TreeProvider] Template ${template.name}: hasContent=${hasContent}, state=${state}, helpers=${template.helpers.length}, events=${template.events.length}, data=${template.dataProperties?.length || 0}, lifecycle=${template.lifecycle?.length || 0}, instance=${template.instanceProperties?.length || 0}`
          );

          return new TemplateTreeItem(template, state);
        });
    }

    // Handle template details (helpers, events, data, props, lifecycle)
    if (element instanceof TemplateTreeItem) {
      const children: vscode.TreeItem[] = [];
      const template = element.template;

      console.log(
        `[TreeProvider] Getting children for template: ${template.name}`
      );
      console.log(`[TreeProvider] Template data:`, {
        helpers: template.helpers.length,
        events: template.events.length,
        dataProperties: template.dataProperties?.length || 0,
        lifecycle: template.lifecycle?.length || 0,
        instanceProperties: template.instanceProperties?.length || 0,
      });

      // Add data properties container
      if (template.dataProperties && template.dataProperties.length > 0) {
        children.push(
          new TemplateContainerTreeItem(
            'Data Properties',
            template,
            'data',
            template.dataProperties.length
          )
        );
      }

      // Add state container (only if template has a controller with lifecycle methods)
      if (
        template.instanceProperties &&
        template.instanceProperties.length > 0 &&
        template.lifecycle &&
        template.lifecycle.length > 0
      ) {
        children.push(
          new TemplateContainerTreeItem(
            'State',
            template,
            'instanceProps',
            template.instanceProperties.length
          )
        );
      }

      // Add helpers container
      if (template.helpers.length > 0) {
        children.push(
          new TemplateContainerTreeItem(
            'Helpers',
            template,
            'helpers',
            template.helpers.length
          )
        );
      }

      // Add events container
      if (template.events.length > 0) {
        children.push(
          new TemplateContainerTreeItem(
            'Events',
            template,
            'events',
            template.events.length
          )
        );
      }

      // Add lifecycle methods container
      if (template.lifecycle && template.lifecycle.length > 0) {
        children.push(
          new TemplateContainerTreeItem(
            'Lifecycle',
            template,
            'lifecycle',
            template.lifecycle.length
          )
        );
      }

      console.log(
        `[TreeProvider] Returning ${children.length} children for ${template.name}`
      );
      return children;
    }

    // Handle helpers/events/data/props/lifecycle/instanceProps containers
    if (element instanceof TemplateContainerTreeItem) {
      const template = element.template;

      if (element.type === 'helpers') {
        return template.helpers.map(
          (helper) =>
            new TemplateDetailTreeItem(helper, template, 'helper', helper)
        );
      } else if (element.type === 'events') {
        return template.events.map(
          (event) => new TemplateDetailTreeItem(event, template, 'event', event)
        );
      } else if (element.type === 'data') {
        // Use enhanced data properties if available
        if (template.dataPropertiesEnhanced) {
          return template.dataPropertiesEnhanced.map(
            (prop) =>
              new TemplateDetailTreeItem(
                prop.name,
                template,
                'data',
                prop.name,
                {
                  // NEW: pass metadata
                  type: prop.type,
                  description: prop.description,
                  sources: prop.sources,
                }
              )
          );
        } else {
          // Fallback to old format
          return (template.dataProperties || []).map(
            (prop) => new TemplateDetailTreeItem(prop, template, 'data', prop)
          );
        }
      } else if (element.type === 'lifecycle') {
        return (template.lifecycle || []).map(
          (method) =>
            new TemplateDetailTreeItem(method, template, 'lifecycle', method)
        );
      } else if (element.type === 'instanceProps') {
        return (template.instanceProperties || []).map(
          (prop) =>
            new TemplateDetailTreeItem(prop, template, 'instanceProp', prop)
        );
      }
    }

    return [];
  }

  /**
   * Get parent of a tree item (for reveal functionality).
   */
  getParent(element: vscode.TreeItem): vscode.TreeItem | undefined {
    if (element instanceof TemplateDetailTreeItem) {
      // Parent is the container
      const template = element.template;
      if (element.type === 'helper') {
        return new TemplateContainerTreeItem(
          'Helpers',
          template,
          'helpers',
          template.helpers.length
        );
      } else if (element.type === 'event') {
        return new TemplateContainerTreeItem(
          'Events',
          template,
          'events',
          template.events.length
        );
      } else if (element.type === 'data') {
        return new TemplateContainerTreeItem(
          'Data Properties',
          template,
          'data',
          template.dataProperties?.length || 0
        );
      } else if (element.type === 'instanceProp') {
        return new TemplateContainerTreeItem(
          'State',
          template,
          'instanceProps',
          template.instanceProperties?.length || 0
        );
      } else if (element.type === 'lifecycle') {
        return new TemplateContainerTreeItem(
          'Lifecycle',
          template,
          'lifecycle',
          template.lifecycle?.length || 0
        );
      }
    }

    if (element instanceof TemplateContainerTreeItem) {
      // Parent is the template
      return new TemplateTreeItem(
        element.template,
        vscode.TreeItemCollapsibleState.Collapsed
      );
    }

    return undefined;
  }

  /**
   * Get all templates currently in the tree.
   */
  getTemplates(): TemplateInfo[] {
    return this.templates;
  }

  /**
   * Find a template by name.
   */
  findTemplate(name: string): TemplateInfo | undefined {
    return this.templates.find((t) => t.name === name);
  }
}
