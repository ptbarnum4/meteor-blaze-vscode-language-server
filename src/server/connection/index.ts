/**
 * Language Server Connection Entrypoint

 * Wires up VS Code LSP server connection and document manager, and registers
 * all request/notification handlers. Exports a small object with the active
 * connection and documents manager for use by the extension bootstrap.
 */

// External LSP types
import { TextDocument } from 'vscode-languageserver-textdocument';
import { createConnection, ProposedFeatures, TextDocuments } from 'vscode-languageserver/node';

// Shared types/state used across handlers
import { CurrentConnectionConfig } from '/types';

// Request/notification handlers
import { validateWorkspace } from '../helpers/validateWorkspace';
import onCompletion from './onCompletion';
import onCompletionResolve from './onCompletionResolve';
import onDefinition from './onDefinition';
import onDidChangeConfiguration from './onDidChangeConfiguration';
import onDidChangeContent from './onDidChangeContent';
import onDidClose from './onDidClose';
import onHover from './onHover';
import onInitialize from './onInitialize';
import onInitialized from './onInitialized';
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
  globalSettings: { maxNumberOfProblems: 1000 },
  documentSettings: new Map(),
  fileAnalysis: {
    jsHelpers: new Map(),
    helperDetails: new Map(),
    cssClasses: new Map(),
    templates: new Map()
  },
  documents,
  connection,
  hasConfigurationCapability: false,
  hasWorkspaceFolderCapability: false,
  hasDiagnosticRelatedInformationCapability: false
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

// Register document event handlers
documents.onDidClose(onDidClose(config));
documents.onDidChangeContent(onDidChangeContent(config));

// Register custom request handlers
connection.onRequest('workspace/validateAll', async () => {
  await validateWorkspace(config);
  return { success: true };
});

// --- Export -----------------------------------------------------------------
/**
 * Small export for server bootstrap to start listening.
 * Consumers should call:
 *   documents.listen(connection);
 *   connection.listen();
 */
const connectionConfig = {
  documents,
  connection
};

export default connectionConfig;
