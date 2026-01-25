import * as vscode from 'vscode';
import { GlobalHelperConfig, HelperInfo, TemplateInfo } from '../../types';

/**
 * Represents the workspace analysis data used by the sidebar.
 */
export interface WorkspaceAnalysis {
  /** All templates found in the workspace */
  templates: TemplateInfo[];
  /** All global helpers (built-in + custom) */
  globalHelpers: HelperInfo[];
  /** Template-specific helper details */
  templateHelpers: Map<string, HelperInfo[]>;
  /** Custom global helper configurations */
  customHelpers: GlobalHelperConfig[];
}

/**
 * Tree item for a Meteor template in the sidebar.
 */
export class TemplateTreeItem extends vscode.TreeItem {
  constructor(
    public readonly template: TemplateInfo,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(template.name, collapsibleState);

    this.tooltip = this.createTooltip();
    this.description = this.createDescription();
    this.iconPath = this.getIcon();
    this.contextValue = 'template';

    // Set command to show quick pick when clicked
    this.command = {
      command: 'meteorBlaze.showTemplateQuickPick',
      title: 'Show Template Options',
      arguments: [template],
    };
  }

  private createTooltip(): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`### ${this.template.name}\n\n`);
    md.appendMarkdown(`**File:** ${this.template.file}\n\n`);
    md.appendMarkdown(`**Helpers:** ${this.template.helpers.length}\n\n`);
    md.appendMarkdown(`**Events:** ${this.template.events.length}\n\n`);
    if (
      this.template.dataProperties &&
      this.template.dataProperties.length > 0
    ) {
      md.appendMarkdown(
        `**Data Properties:** ${this.template.dataProperties.length}\n\n`
      );
    }
    if (
      this.template.instanceProperties &&
      this.template.instanceProperties.length > 0
    ) {
      md.appendMarkdown(
        `**Instance Properties:** ${this.template.instanceProperties.length}\n\n`
      );
    }
    if (
      this.template.instanceProperties &&
      this.template.instanceProperties.length > 0
    ) {
      md.appendMarkdown(
        `**State:** ${this.template.instanceProperties.length}\n\n`
      );
    }
    if (this.template.lifecycle && this.template.lifecycle.length > 0) {
      md.appendMarkdown(
        `**Lifecycle:** ${this.template.lifecycle.join(', ')}\n\n`
      );
    }

    if (this.template.helpers.length > 0) {
      md.appendMarkdown(`**Helper List:**\n`);
      this.template.helpers.forEach((helper) => {
        md.appendMarkdown(`- ${helper}\n`);
      });
    }

    md.isTrusted = true;
    md.supportHtml = true;
    return md;
  }

  private createDescription(): string {
    const parts: string[] = [];

    if (this.template.helpers.length > 0) {
      parts.push(`${this.template.helpers.length}h`);
    }

    if (this.template.events.length > 0) {
      parts.push(`${this.template.events.length}e`);
    }

    if (
      this.template.dataProperties &&
      this.template.dataProperties.length > 0
    ) {
      parts.push(`${this.template.dataProperties.length}d`);
    }

    if (
      this.template.instanceProperties &&
      this.template.instanceProperties.length > 0
    ) {
      parts.push(`${this.template.instanceProperties.length}s`);
    }

    if (this.template.lifecycle && this.template.lifecycle.length > 0) {
      parts.push(`${this.template.lifecycle.length}l`);
    }

    return parts.join(' | ');
  }

  private getIcon(): vscode.ThemeIcon {
    // Determine icon based on template completeness
    const hasHelpers = this.template.helpers.length > 0;
    const hasEvents = this.template.events.length > 0;

    if (hasHelpers && hasEvents) {
      return new vscode.ThemeIcon(
        'file-code',
        new vscode.ThemeColor('charts.green')
      );
    } else if (hasHelpers || hasEvents) {
      return new vscode.ThemeIcon(
        'file-code',
        new vscode.ThemeColor('charts.yellow')
      );
    }

    return new vscode.ThemeIcon('file-code');
  }
}

/**
 * Tree item for helper or event details
 */
export class TemplateDetailTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly template: TemplateInfo,
    public readonly type:
      | 'helper'
      | 'event'
      | 'data'
      | 'lifecycle'
      | 'instanceProp',
    public readonly value: string
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);

    this.contextValue = type;
    this.iconPath = this.getIcon();

    // Set command to navigate to definition for all types
    const commandMap: Record<string, string> = {
      helper: 'meteorBlaze.navigateToHelper',
      event: 'meteorBlaze.navigateToEvent',
      data: 'meteorBlaze.navigateToDataProperty',
      lifecycle: 'meteorBlaze.navigateToLifecycle',
      instanceProp: 'meteorBlaze.navigateToInstanceProperty',
    };

    if (commandMap[type]) {
      this.command = {
        command: commandMap[type],
        title: `Go to ${type}`,
        arguments: [template, value],
      };
    }
  }

  private getIcon(): vscode.ThemeIcon {
    switch (this.type) {
      case 'helper':
        return new vscode.ThemeIcon('symbol-method');
      case 'event':
        return new vscode.ThemeIcon('debug-stackframe');
      case 'data':
        return new vscode.ThemeIcon('symbol-property');
      case 'lifecycle':
        return new vscode.ThemeIcon('symbol-event');
      case 'instanceProp':
        return new vscode.ThemeIcon('symbol-field');
      default:
        return new vscode.ThemeIcon('symbol-misc');
    }
  }
}

/**
 * Container tree item for grouping helpers/events
 */
export class TemplateContainerTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly template: TemplateInfo,
    public readonly type:
      | 'helpers'
      | 'events'
      | 'data'
      | 'lifecycle'
      | 'instanceProps',
    public readonly count: number
  ) {
    super(
      `${label} (${count})`,
      count > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );

    this.contextValue = type;
    this.iconPath = this.getIcon();
  }

  private getIcon(): vscode.ThemeIcon {
    switch (this.type) {
      case 'helpers':
        return new vscode.ThemeIcon('symbol-method');
      case 'events':
        return new vscode.ThemeIcon('debug-stackframe');

      case 'lifecycle':
        return new vscode.ThemeIcon('symbol-event');
      case 'instanceProps':
        return new vscode.ThemeIcon('symbol-field');
      default:
        return new vscode.ThemeIcon('symbol-misc');
    }
  }
}
