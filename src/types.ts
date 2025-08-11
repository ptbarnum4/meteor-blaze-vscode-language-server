import { TextDocument } from 'vscode-languageserver-textdocument';
import { InlineCompletionFeatureShape } from 'vscode-languageserver/lib/common/inlineCompletion.proposed';
import { _, createConnection, TextDocuments } from 'vscode-languageserver/node';

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
};

/**
 * Represents the settings for the language server.
 */
export type LanguageServerSettings = {
  /** Maximum number of problems to report. */
  maxNumberOfProblems: number;
};

/**
 * Represents the connection to the VS Code server.
 */
export type VSCodeServerConnection = ReturnType<
  typeof createConnection<_, _, _, _, _, _, InlineCompletionFeatureShape, _>
>;

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
