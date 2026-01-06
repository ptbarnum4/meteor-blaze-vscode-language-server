import vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { createConnection, TextDocuments } from 'vscode-languageserver/node';
/**
 * Represents information about a Meteor template.
 */
export type TemplateInfo = {
  /** The name of the template. */
  name: string;
  /** List of helper functions associated with the template. */
  helpers: string[];
  /** List of events associated with the template. */
  events: string[];
  /** The file path where the template is defined. */
  file: string;
};

/**
 * Represents detailed information about a helper function.
 */
export type HelperInfo = {
  /** The name of the helper function. */
  name: string;
  /** Optional JSDoc description of the helper function. */
  jsdoc?: string;
  /** Optional return type of the helper function. */
  returnType?: string;
  /** Optional parameters of the helper function. */
  parameters?: string;
  /** Optional signature of the helper function. */
  signature?: string;
};

/**
 * Represents the analysis of files, including helpers, CSS classes, and templates.
 */
export type FileAnalysis = {
  /** Map of JavaScript helpers by file path. */
  jsHelpers: Map<string, string[]>;
  /** Map of detailed helper information by file path. */
  helperDetails: Map<string, HelperInfo[]>;
  /** Map of CSS classes by file path. */
  cssClasses: Map<string, string[]>;
  /** Map of templates by file path. */
  templates: Map<string, TemplateInfo>;
  /** Map of template data properties by key (dir/base, dir/template). */
  dataProperties?: Map<string, string[]>;
  /** Map of template data type name by key (dir/template). */
  dataTypeByKey?: Map<string, string>;
  /** Map of data property types by key (property -> type string). */
  dataPropertyTypesByKey?: Map<string, Record<string, string>>;
};

/**
 * Represents a parameter in a global helper configuration.
 */
export type GlobalHelperParam = {
  /** The name of the parameter. */
  name: string;
  /** Optional type(s) for the parameter. Can be a single type or array of types. */
  type?: string | string[];
  /** Optional documentation for the parameter. */
  doc?: string;
  /** Whether the parameter is optional. */
  optional?: boolean;
  /** Default value for the parameter. */
  default?: string;
};

/**
 * Represents return type information for a global helper.
 */
export type GlobalHelperReturn = {
  /** Optional return type. */
  type?: string;
  /** Optional documentation for the return value. */
  doc?: string;
};

/**
 * Represents an example usage of a global helper.
 */
export type GlobalHelperExample = {
  /** Example HTML/template usage. */
  html?: string;
};

/**
 * Configuration for a custom global helper.
 */
export type GlobalHelperConfig = {
  /** The name of the helper (required). */
  name: string;
  /** Optional documentation for the helper. */
  doc?: string;
  /** Optional array of parameters. */
  params?: GlobalHelperParam[];
  /** Optional return type information. */
  return?: GlobalHelperReturn;
  /** Optional array of usage examples. */
  examples?: GlobalHelperExample[];
};

/**
 * Represents the settings for the language server.
 */
export type LanguageServerSettings = {
  /** Maximum number of problems to report. */
  maxNumberOfProblems: number;
  /** Settings for global helpers. */
  globalHelpers?: {
    /** Array of custom global helper configurations. */
    extend?: GlobalHelperConfig[];
  };
  /** Legacy settings for Blaze helpers (kept for backward compatibility). */
  blazeHelpers?: {
    /** Array of simple helper configurations with name and doc. */
    extend?: Array<{
      name: string;
      doc: string;
    }>;
  };
};

/**
 * Represents the connection to the VS Code server.
 */
export type VSCodeServerConnection = ReturnType<typeof createConnection>;

/**
 * Represents the configuration for the current connection.
 */
export type CurrentConnectionConfig = {
  /** Global settings for the language server. */
  globalSettings: LanguageServerSettings;
  /** Map of document-specific settings. */
  documentSettings: Map<string, Thenable<LanguageServerSettings>>;
  /** Analysis of files, including helpers, CSS classes, and templates. */
  fileAnalysis: FileAnalysis;
  /** Manager for text documents. */
  documents: TextDocuments<TextDocument>;
  /** Connection to the VS Code server. */
  connection: VSCodeServerConnection;
  /** Whether the server supports configuration capabilities. */
  hasConfigurationCapability: boolean;
  /** Whether the server supports workspace folder capabilities. */
  hasWorkspaceFolderCapability: boolean;
  /** Whether the server supports diagnostic-related information capabilities. */
  hasDiagnosticRelatedInformationCapability: boolean;
};

export type ExtensionConfig = {
  /** The language client instance */
  client: LanguageClient | null;
  /** Decoration type for block-condition hints
   * - created dynamically based on settings */
  blockConditionDecorationType: vscode.TextEditorDecorationType | null;
};

export type GlobalHelperInfo = {
  name: string;
  jsdoc?: string;
  signature?: string;
  returnType?: string;
  parameters?: string;
  filePath: string;
};

export type AnalyzeGlobalHelpersResult = {
  helpers: string[];
  helperDetails: GlobalHelperInfo[];
};
