import fs from 'fs';
import path from 'path';

import { TextDocument } from 'vscode-languageserver-textdocument';

import { CurrentConnectionConfig } from '../../types';
import { safeReadDir, safeReadStats } from '../../utils/fs';
import { analyzeNeighboringFiles } from './analyzeNeighboringFiles.js';
import { validateTextDocument } from './validateTextDocument.js';

/**
 * Recursively finds all HTML/Meteor template files in a directory
 */
async function findTemplateFiles(
  dir: string,
  fileList: string[] = []
): Promise<string[]> {
  const EXCLUDE_DIRS = [
    'node_modules',
    '.git',
    '.meteor',
    'dist',
    'out',
    'build',
    /^\./, // Hidden directories
    'test',
    'tests',
  ];
  const INCLUDE_EXTENSIONS = ['.html', '.htm', '.meteor', '.hbs'];

  const isExcluded = (dirName: string) => {
    return EXCLUDE_DIRS.some((exclude) => !!dirName.match(exclude));
  };
  const isIncluded = (fileName: string) => {
    return INCLUDE_EXTENSIONS.some((ext) =>
      fileName.toLowerCase().endsWith(ext.toLowerCase())
    );
  };

  const files = await safeReadDir(dir);

  const checkTemplateFile = async (file: string) => {
    const filePath = path.join(dir, file);
    const stat = await safeReadStats(filePath);
    if (!stat) {
      console.warn(`Could not read stats for path: ${filePath}`);
      return;
    }
    const isDir = stat.isDirectory() ?? false;
    const isFile = stat.isFile() ?? false;

    if (isFile && isIncluded(file)) {
      // Check if file is a template file
      fileList.push(filePath);
      return;
    }

    // Skip excluded directories
    if (!isDir || (isDir && isExcluded(file))) {
      return;
    }

    // Recurse into directories
    // Skip common directories that shouldn't be validated
    const dirName = path.basename(filePath);
    if (!EXCLUDE_DIRS.includes(dirName)) {
      await findTemplateFiles(filePath, fileList);
    }
  };

  await Promise.all(files.map(checkTemplateFile));

  return fileList;
}

type AnalyzeWorkspaceOptions = {
  config: CurrentConnectionConfig;
  workspaceFolders: { uri: string; name: string }[];
  details: WorkspaceValidationDetails;
};

type AnalyzeWorkspaceFileOptions = {
  filePath: string;
} & Pick<AnalyzeWorkspaceOptions, 'config' | 'details'>;

async function analyzeWorkspaceFile(options: AnalyzeWorkspaceFileOptions) {
  const { config, details, filePath } = options;
  details
    .setStatus('READING_FILE')
    .setFile(filePath)
    .log(`Validating file: ${path.basename(filePath)}`);

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const uri = `file://${filePath}`;

    // Create a TextDocument from the file content
    const document = TextDocument.create(uri, 'html', 1, content);

    // Analyze neighboring files to populate dataProperties Map
    analyzeNeighboringFiles(config.fileAnalysis, document);

    // Validate the document
    await validateTextDocument(config, document);

    // Increment validated files count
    details.increment();
  } catch (err) {
    config.connection.console.error(
      `Error reading/validating file ${filePath}: ${err}`
    );

    details
      .setStatus('FAILED')
      .log(`Failed to validate file: ${path.basename(filePath)}`);
  }
}

async function analyzeWorkspaceFiles({
  config,
  workspaceFolders,
  details,
}: AnalyzeWorkspaceOptions) {
  for (const folder of workspaceFolders) {
    const folderPath = folder.uri.replace('file://', '');
    details
      .setStatus('READING_DIR')
      .setDir(folderPath)
      .log(`Scanning folder: ${folder.name}`);

    // Find all template files
    const templateFiles = await findTemplateFiles(folderPath);

    details
      .setTotalFiles(templateFiles.length, true)
      .log(
        `Found ${templateFiles.length} template files in folder: ${folder.name}`
      );

    // Validate each file
    for (const filePath of templateFiles) {
      details
        .setStatus('READING_FILE')
        .setFile(filePath)
        .log(`Validating file: ${path.basename(filePath)}`);

      await analyzeWorkspaceFile({ config, details, filePath });
    }
  }
}

/**
 * Validates all template files in the workspace
 */
export async function validateWorkspace(
  config: CurrentConnectionConfig
): Promise<void> {
  try {
    const workspaceFolders =
      await config.connection.workspace.getWorkspaceFolders();

    if (!workspaceFolders || workspaceFolders.length === 0) {
      config.connection.console.info(
        '❌ NO WORKSPACE FOLDERS FOUND FOR VALIDATION.'
      );
      return;
    }

    const details = new WorkspaceValidationDetails(config).disable();

    details.log('Starting workspace-wide validation...');

    await analyzeWorkspaceFiles({
      config,
      workspaceFolders,
      details,
    });

    details.setStatus('SUCCESS').log('Workspace-wide validation completed.');
  } catch (err) {
    config.connection.console.error(
      `Error during workspace validation: ${err}`
    );
  }
}

/** Helper class to track and log workspace validation details */
class WorkspaceValidationDetails {
  _disabled: boolean = false;
  private _config: CurrentConnectionConfig;
  private _LOG_KEY = '[WORKSPACE VALIDATION]' as const;
  private _STATUS = {
    VALIDATING: '🔍 VALIDATING',
    READING_FILE: '📄 READING FILE',
    READING_DIR: '📁 READING DIR',
    SUCCESS: '✅ SUCCESS',
    FAILED: '❌ FAILED',
  } as const;

  private _LOADING_BAR_LENGTH = 32;
  private _LOADING_BAR_CHAR = '🟩';

  private _HORIZONTAL_LINE_CHAR = '⎻';
  private _HORIZONTAL_LINE_WIDTH = 40;

  private _startTime: number;
  private _totalFiles: number = 0;
  private _validatedFiles: number = 0;
  private _currentDir: string = '';
  private _currentFile: string = '';
  private _status: keyof typeof this._STATUS = 'VALIDATING';

  constructor(config: CurrentConnectionConfig, totalFiles: number = 0) {
    this._totalFiles = totalFiles;
    this._startTime = Date.now();
    this._config = config;
  }

  /**
   * Gets the number of total files
   */
  private get totalFiles() {
    return this._totalFiles;
  }
  /**
   * Sets the number of total files
   */
  private set totalFiles(value: number) {
    this._totalFiles = value;
  }

  /**
   * Gets the number of validated files
   */
  private get validatedFiles() {
    return this._validatedFiles;
  }

  /**
   * Sets the number of validated files
   */
  private set validatedFiles(value: number) {
    this._validatedFiles = value;
  }

  /**
   * Gets or sets the current status key
   */
  private set status(value: keyof typeof this._STATUS) {
    const validKeys = Object.keys(this._STATUS) as Array<
      keyof typeof this._STATUS
    >;
    if (!validKeys.includes(value)) {
      throw new Error(`Invalid status value: ${value}`);
    }
    this._status = value;
  }

  /**
   * Gets the timestamp when validation started
   */
  private get startTime() {
    return this._startTime;
  }

  /**
   * Gets the elapsed time since validation started in seconds
   */
  private get elapsed() {
    const now = Date.now();
    return ((now - this.startTime) / 1000).toFixed(4);
  }

  /**
   * Gets the current status message based on the status key
   */
  private get statusMessage() {
    return this._STATUS[this._status];
  }

  /**
   * Calculates the current progress percentage as a number between 0 and 1
   */
  private get percent() {
    if (!this._totalFiles) {
      return 0;
    }

    return this._validatedFiles / this._totalFiles;
  }

  private get formattedPercent() {
    return (this.percent * 100).toFixed(1);
  }

  // PRIVATE MESSAGE LOGGING METHODS

  /**
   * Generates the loading bar string based on current progress
   */
  private get loadingBar() {
    const emptyLoadingBar = ' '.repeat(this._LOADING_BAR_LENGTH);
    const percent = this.percent;
    if (!percent) {
      return emptyLoadingBar;
    }
    const char = this._LOADING_BAR_CHAR;
    const length = this._LOADING_BAR_LENGTH;

    const filledLength = Math.floor(percent * length);
    const emptyLength = length - filledLength;
    const loadingChars = char.repeat(filledLength);
    const emptyChars = ' '.repeat(emptyLength);
    return `${loadingChars}${emptyChars}`;
  }

  /**
   * Generates a horizontal line for log formatting
   */
  private horizontalLine(text?: string) {
    const w = Math.ceil(this._HORIZONTAL_LINE_WIDTH / 2);
    const line = this._HORIZONTAL_LINE_CHAR.repeat(w);

    if (text) {
      const paddedText = ` ${text} `;
      const sliceOffset = Math.floor((w - paddedText.length) / 2);
      const slice = line.slice(0, Math.max(0, sliceOffset));
      return `\n${line}${slice}${paddedText}${slice}${line}\n`;
    }

    return `\n${line.repeat(3)}\n`;
  }

  private headerLine(text: string) {
    const chars = {
      topLeft: '┌',
      topRight: '┐',
      bottomLeft: '└',
      bottomRight: '┘',
      horizontal: '─',
      vertical: '│',
    };
    // Match the width of horizontalLine (which is _HORIZONTAL_LINE_WIDTH * 3/2)
    const totalWidth = Math.ceil(this._HORIZONTAL_LINE_WIDTH / 2) * 3;
    const lineLength = totalWidth - 2; // Subtract 2 for left and right borders
    const textPadding = Math.max(lineLength - text.length + 2, 0);
    // const isOdd = textPadding % 2 !== 0;

    const pad = ' '.repeat(Math.ceil(textPadding / 2) + 2);

    const topLine = `${chars.topLeft}${chars.horizontal.repeat(lineLength)}${chars.topRight}`;
    const bottomLine = `${chars.bottomLeft}${chars.horizontal.repeat(lineLength)}${chars.bottomRight}`;
    const middleLine = `${chars.vertical}${pad}${text}${pad}${chars.vertical}`;

    return [topLine, middleLine, bottomLine].join('\n');
  }

  private formatLog = (message: string) => {
    return `${this._LOG_KEY} ${message}`;
  };

  private formattedLogBody(message: string): string {
    console.clear();
    return [
      `🛠️ ${this.statusMessage} - ${message}`,
      `🟰 Total Files: ${this.totalFiles}`,
      `🫧 Validated Files: ${this.validatedFiles}`,
      `🟩 Progress: ${this.loadingBar} ${this.formattedPercent}%`,
      `📂 Current Dir: ${this._currentDir || 'N/A'}`,
      `📄 Current File: ${this._currentFile || 'N/A'}`,
      `⏱️ Elapsed Time: ${this.elapsed}s`,
    ]
      .map((line) => this.formatLog(line))
      .join('\n');
  }

  /**
   * Generates clear lines to push previous logs out of view
   */
  private get clearTop() {
    return '\n'.repeat(12); // Clear previous logs (kinda)
  }

  private _log(...messages: string[]) {
    if (this._disabled) {
      return;
    }
    this._config.connection.console.info(messages.join('\n'));
  }

  // PUBLIC METHODS

  /**
   * Logs the current validation status to the connection console
   */
  public log(message: string) {
    const logs = [
      this.clearTop,
      this.headerLine(this._LOG_KEY),
      this.formattedLogBody(message),
      this.horizontalLine(),
    ];

    this._log(...logs);
    return this;
  }

  /**
   * Increments the count of validated files
   */
  public increment() {
    this._validatedFiles++;
    return this;
  }

  /**
   * Sets the current directory being processed
   */
  public setDir(dir: string) {
    this._currentDir = dir;
    return this;
  }

  /**
   * Sets the total number of files to be processed
   */

  public setTotalFiles(total: number, add: boolean = false) {
    const newTotal = add ? this._totalFiles + total : total;
    this._totalFiles = newTotal;
    return this;
  }

  /**
   * Sets the current file being processed
   */
  public setFile(file: string) {
    this._currentFile = file;
    return this;
  }

  public setStatus(status: keyof typeof this._STATUS) {
    this.status = status;
    return this;
  }
  /** Disables logging */
  public disable() {
    this._disabled = true;
    return this;
  }
  /** Enables logging */
  public enable() {
    this._disabled = false;
    return this;
  }
}
