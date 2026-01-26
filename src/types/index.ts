import vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { _Connection, TextDocuments } from 'vscode-languageserver/node';
import Logger from '../utils/logger';
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
  /** Template data properties (from this.data in onCreated/onRendered). */
  dataProperties?: string[];
  /** Template properties passed as parameters. */
  props?: string[];
  /** Lifecycle methods defined for this template. */
  lifecycle?: string[];
  /** Template instance properties (from T parameter in TemplateStaticTyped<N, D, T>). */
  instanceProperties?: string[];

  /** NEW: Enhanced data properties with source information */
  dataPropertiesEnhanced?: Array<{
    name: string;
    type: string;
    description?: string;
    optional: boolean;
    sources: Array<'controller' | 'tsdoc' | 'inferred'>;
  }>;

  /** NEW: Template-level documentation from @description tag */
  templateDescription?: string;
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
  /** Map of data property JSDoc comments by key (property -> JSDoc string). */
  dataPropertyJsDocsByKey?: Map<string, Record<string, string>>;

  /** NEW: Map of TSDoc parameter information by template name */
  templateTsDocParams?: Record<
    string,
    {
      [paramName: string]: {
        type: string;
        description?: string;
        optional: boolean;
      };
    }
  >;

  /** NEW: Map of template descriptions from @description tags */
  templateDescriptions?: Record<string, string>;
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
  /** Automatically validate all template files in the workspace on startup. */
  validateWorkspaceOnStartup?: boolean;
  /** Trace communication between VS Code and the language server. */
  trace?: {
    server?: 'off' | 'messages' | 'verbose';
  };
  /** Settings for block condition hints and auto-insertion. */
  blockConditions?: {
    /** Enable inline condition hints for Blaze block helpers. */
    enabled?: boolean;
    /** Automatically insert closing tags when typing opening Blaze block tags. */
    autoInsertEndTags?: boolean;
    /** Color for inline condition hints (hex or theme color name). */
    color?: string;
    /** Font style for inline condition hints. */
    fontStyle?: 'normal' | 'italic' | 'bold';
    /** CSS margin for inline condition hints. */
    margin?: string;
    /** Extend block condition hints to custom block types. */
    extend?: Array<{
      /** Block type name. */
      type: string;
      /** Display label for the block. */
      label: string;
      /** Optional array of prop names for the block type. */
      propNames?: string[];
      /** Whether this block type requires an end tag for validation. */
      requiresEndTag?: boolean;
      /** Whether to automatically insert end tags for this custom block type. */
      autoInsertEndTag?: boolean;
    }>;
  };
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
    /** Custom color for the '#' in Blaze helpers (e.g., #if, #each). */
    hashColor?: string;
    /** Custom color for the helper name in Blaze helpers. */
    nameColor?: string;
    /** Custom color for the brackets '{{' and '}}' in Blaze helpers. */
    bracketColor?: string;
  };
  /** Settings for formatting. */
  formatting?: {
    /** Whether formatting is enabled. */
    enabled?: boolean;
    /** Base formatter to chain with (e.g., 'vscode.html-language-features'). */
    baseFormatter?: string | null;
    /** Indent size for formatting. */
    indentSize?: number;
  };
  /** Settings for template parameter completion. */
  completion?: {
    /** Suggest template parameter names when typing inside template invocations (left of =). */
    suggestTemplateParams?: boolean;
    /** Suggest template helpers and data properties as values when typing after = in template invocations. */
    suggestTemplateValues?: boolean;
    /** Minimum usage count to suggest parameters inferred from template usage patterns. */
    parameterInferenceMinUsage?: number;
  };
  /** Settings for TSDoc-style template comments. */
  templateComments?: {
    /** Enable autocomplete for TSDoc tags in template comments. */
    enableAutocomplete?: boolean;
    /** Validation level for TSDoc comments. */
    validationLevel?: 'off' | 'info' | 'warning' | 'error';
    /** Prefer TSDoc descriptions over controller descriptions in hover tooltips. */
    preferTsDocDescriptions?: boolean;
    /** Custom @ tags to allow in template comments (in addition to standard tags). */
    customTags?: string[];
  };
};

/**
 * Represents the connection to the VS Code server.
 */
// export type VSCodeServerConnection = ReturnType<typeof createConnection>;
export type VSCodeServerConnection = _Connection<
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown
>;
/**
 * Represents the configuration for the current connection.
 */
export type CurrentConnectionConfig = {
  logger: Logger;
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
  /** Global helpers registry. */
  globalHelpers?: string[];
};

export type ExtensionConfig = {
  /** The language client instance */
  client: LanguageClient | null;
  /** Decoration type for block-condition hints
   * - created dynamically based on settings */
  blockConditionDecorationType: vscode.TextEditorDecorationType | null;
  /** Decoration type for HTML element closing tag hints
   * - created dynamically based on settings */
  htmlElementDecorationType: vscode.TextEditorDecorationType | null;
};

export type GlobalHelperInfo = {
  name: string;
  /** JSDoc documentation from code analysis */
  jsdoc?: string;
  /** Rich markdown documentation from config settings */
  markdown?: string;
  signature?: string;
  returnType?: string;
  parameters?: string;
  filePath: string;
};

export type AnalyzeGlobalHelpersResult = {
  helpers: string[];
  helperDetails: GlobalHelperInfo[];
};

/**
 * Type-safe wrappers for Node.js fs module
 */
export type FileSystem = typeof import('fs');

/**
 * Type-safe wrappers for Node.js path module
 */
export type PathModule = typeof import('path');

/**
 * Represents a Blaze helper configuration that can be a string or object
 */
export type BlazeHelperConfig =
  | string
  | {
      name: string;
      doc?: string;
      usage?: string;
    };

/**
 * Represents parsed Blaze helper information
 */
export type BlazeHelperInfo = {
  name: string;
  doc: string;
  usage: string;
};

/**
 * TypeScript configuration object structure
 */
export type TsConfig = {
  compilerOptions?: {
    baseUrl?: string;
    paths?: Record<string, string[]>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};
