import fs from 'fs';
import path from 'path';

import { TextDocument } from 'vscode-languageserver-textdocument';

import { analyzeNeighboringFiles } from './analyzeNeighboringFiles';
import { validateTextDocument } from './validateTextDocument';
import { CurrentConnectionConfig } from '/types';

/**
 * Recursively finds all HTML/Meteor template files in a directory
 */
function findTemplateFiles(dir: string, fileList: string[] = []): string[] {
  try {
    const files = fs.readdirSync(dir);

    files.forEach((file) => {
      const filePath = path.join(dir, file);

      try {
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
          // Skip common directories that shouldn't be validated
          const dirName = path.basename(filePath);
          if (
            ![
              'node_modules',
              '.git',
              '.meteor',
              'dist',
              'out',
              'build',
            ].includes(dirName) &&
            !dirName.startsWith('.')
          ) {
            findTemplateFiles(filePath, fileList);
          }
        } else if (stat.isFile()) {
          // Check if file is a template file
          const ext = path.extname(file).toLowerCase();
          if (['.html', '.htm', '.meteor', '.hbs'].includes(ext)) {
            fileList.push(filePath);
          }
        }
      } catch (err) {
        // Skip files/directories we can't access
        console.error(`Error accessing ${filePath}:`, err);
      }
    });
  } catch (err) {
    console.error(`Error reading directory ${dir}:`, err);
  }

  return fileList;
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

    config.connection.console.info('Starting workspace-wide validation...');

    const STATUS = {
      VALIDATING: '🔍 VALIDATING',
      READING_FILE: '📄 READING FILE',
      READING_DIR: '📁 READING DIR',
      SUCCESS: '✅ SUCCESS',
      FAILED: '❌ FAILED',
    };

    let totalFiles = 0;
    let validatedFiles = 0;
    let status = STATUS.VALIDATING;

    const lbCh = '🟩';
    const loadingBarLength = 20;
    const startTime = Date.now();

    const logDetails = (
      message: string,
      currentDir?: string,
      currentFile?: string
    ) => {
      const now = Date.now();
      const elapsed = ((now - startTime) / 1000).toFixed(4);

      const filledLength = Math.floor(
        (validatedFiles / totalFiles) * loadingBarLength
      );
      const emptyLength = loadingBarLength - filledLength;
      const loadingBar = lbCh.repeat(filledLength) + ' '.repeat(emptyLength);
      const progressPercent = totalFiles
        ? ((validatedFiles / totalFiles) * 100).toFixed(1)
        : '0.0';

      const line = '⎯'.repeat(80);
      const currentFileMsg = currentFile
        ? [`📄 Current File: ${currentFile}`]
        : [];
      const currentDirMsg = currentDir ? [`📂 Current Dir: ${currentDir}`] : [];

      const clearTop = '\n'.repeat(20);
      const logs = [
        clearTop,
        `\n${line}`,
        `🛠️ [Workspace Validation] ${status} - ${message}`,
        `🟰 Total Files: ${totalFiles}`,
        `🫧 Validated Files: ${validatedFiles}`,
        `🟩 Progress: ${loadingBar} ${progressPercent}%`,
        ...currentDirMsg,
        ...currentFileMsg,
        `⏱️ Elapsed Time: ${elapsed}s`,
        `${line}\n`,
      ];

      config.connection.console.info(logs.join('\n'));
    };

    for (const folder of workspaceFolders) {
      // Convert URI to file path
      const folderPath = folder.uri.replace('file://', '');
      status = STATUS.READING_DIR;
      logDetails(`Scanning folder: ${folder.name}`, folderPath);

      // Find all template files
      const templateFiles = findTemplateFiles(folderPath);
      totalFiles += templateFiles.length;

      // Validate each file
      for (const filePath of templateFiles) {
        status = STATUS.READING_FILE;
        logDetails(
          `Validating file: ${path.basename(filePath)}`,
          folderPath,
          filePath
        );
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const uri = `file://${filePath}`;

          // Create a TextDocument from the file content
          const document = TextDocument.create(uri, 'html', 1, content);

          // Analyze neighboring files to populate dataProperties Map
          analyzeNeighboringFiles(config.fileAnalysis, document);

          // Validate the document
          await validateTextDocument(config, document);
          validatedFiles++;
        } catch (err) {
          logDetails(
            `Error reading/validating file: ${path.basename(filePath)}`,
            folderPath,
            filePath
          );
          config.connection.console.error(
            `Error reading/validating file ${filePath}: ${err}`
          );
        }
      }
    }

    status = STATUS.SUCCESS;
    logDetails('Workspace-wide validation completed.');
  } catch (err) {
    config.connection.console.error(
      `Error during workspace validation: ${err}`
    );
  }
}
