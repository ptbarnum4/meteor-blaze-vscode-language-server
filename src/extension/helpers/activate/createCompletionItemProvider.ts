import vscode from 'vscode';

/**
 * Defines the files to include for block condition completion.
 */
const INCLUDE_FILES = [
  { language: 'html', scheme: 'file' },
  { language: 'handlebars', scheme: 'file' }
];

/**
 * Trigger characters for block condition completion.
 */
const TRIGGER_CHARS = [' ', '.', ':', ','];

/**
 * Extended block type with properties for custom blocks.
 */
type ExtendedBlock = { type: string; label: string; propNames?: string[] };

/**
 * Creates a completion item provider for Meteor block conditions.
 * It provides properties for custom blocks defined in the configuration.
 *
 * @returns The completion item provider.
 */
const createCompletionItemProvider = (): vscode.Disposable => {
  return vscode.languages.registerCompletionItemProvider(
    INCLUDE_FILES,
    { provideCompletionItems },
    ...TRIGGER_CHARS
  );
};


/**
 * Provides completion items for Meteor block conditions.
 * It checks the current block type and provides properties defined in the configuration.
 *
 * @param document The text document.
 * @param position The position in the document.
 * @param _token The cancellation token.
 * @param _context The completion context.
 * @returns An array of completion items or undefined if no block is found.
 */
function provideCompletionItems(
  document: vscode.TextDocument,
  position: vscode.Position,
  _token: vscode.CancellationToken,
  _context: vscode.CompletionContext
) {
  const blockConfig = vscode.workspace.getConfiguration('meteorLanguageServer.blockConditions');
  type ExtendedBlock = { type: string; label: string; propNames?: string[] };
  const extendBlocks = blockConfig.get<ExtendedBlock[]>('extend', []);
  const defaultBlockTypes = [
    { type: 'if', label: 'if' },
    { type: 'each', label: 'each' },
    { type: 'unless', label: 'unless' },
    { type: 'with', label: 'with' }
  ];
  const blockTypesMap = new Map<string, { type: string; label: string; propNames?: string[] }>();
  defaultBlockTypes.forEach(b => blockTypesMap.set(b.type, b));
  extendBlocks.forEach(b => blockTypesMap.set(b.type, b));
  const blockTypes: ExtendedBlock[] = Array.from(blockTypesMap.values());

  const text = document.getText();
  const offset = document.offsetAt(position);

  // Find the nearest opening block before the cursor
  const foundBlock = findBlock(blockTypes, text, offset);

  if (!foundBlock || !foundBlock.propNames?.length) {
    return undefined;
  }

  return foundBlock.propNames.map(p => {
    const item = new vscode.CompletionItem(p, vscode.CompletionItemKind.Property);
    item.detail = `Custom property for block #${foundBlock!.type}`;
    return item;
  });
}


/**
 * Finds the block type at the given offset in the document.
 * It checks for opening blocks and returns the first matching block type.
 *
 * @param blockTypes The list of extended block types.
 * @param text The text content of the document.
 * @param offset The offset position in the text.
 * @returns The found block type or undefined if no block is found.
 */
function findBlock(
  blockTypes: ExtendedBlock[],
  text: string,
  offset: number
): ExtendedBlock | undefined {
  for (const { type, propNames } of blockTypes) {
    const regex = new RegExp(`\{\{\s*#${type}(?:\s+[^}]*)?\}\}`, 'g');
    let match;
    while ((match = regex.exec(text)) !== null) {
      const start = match.index;
      const endRegex = new RegExp(`\{\{\s*\/${type}\s*\}\}`, 'g');
      endRegex.lastIndex = regex.lastIndex;
      const endMatch = endRegex.exec(text);
      const end = endMatch ? endMatch.index + endMatch[0].length : text.length;
      if (offset >= start && offset <= end) {
        return { type, label: type, propNames };
      }
    }
  }
  return undefined;
}

export default createCompletionItemProvider;
