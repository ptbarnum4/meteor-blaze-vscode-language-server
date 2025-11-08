import * as fs from 'fs';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { CurrentConnectionConfig } from '../../types';
import { validateTextDocument } from './validateTextDocument';

/**
 * Recursively finds all HTML/Meteor template files in a directory
 */
function findTemplateFiles(dir: string, fileList: string[] = []): string[] {
  try {
    const files = fs.readdirSync(dir);

    files.forEach(file => {
      const filePath = path.join(dir, file);

      try {
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
          // Skip common directories that shouldn't be validated
          const dirName = path.basename(filePath);
          if (
            !['node_modules', '.git', '.meteor', 'dist', 'out', 'build'].includes(dirName) &&
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
export async function validateWorkspace(config: CurrentConnectionConfig): Promise<void> {
  try {
    const workspaceFolders = await config.connection.workspace.getWorkspaceFolders();

    if (!workspaceFolders || workspaceFolders.length === 0) {
      config.connection.console.info('No workspace folders found for validation');
      return;
    }

    config.connection.console.info('Starting workspace-wide validation...');

    let totalFiles = 0;
    let validatedFiles = 0;

    for (const folder of workspaceFolders) {
      // Convert URI to file path
      const folderPath = folder.uri.replace('file://', '');

      config.connection.console.info(`Scanning folder: ${folderPath}`);

      // Find all template files
      const templateFiles = findTemplateFiles(folderPath);
      totalFiles += templateFiles.length;

      config.connection.console.info(`Found ${templateFiles.length} template files in ${folder.name}`);

      // Validate each file
      for (const filePath of templateFiles) {
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const uri = `file://${filePath}`;

          // Create a TextDocument from the file content
          const document = TextDocument.create(
            uri,
            'html',
            1,
            content
          );

          // Validate the document
          await validateTextDocument(config, document);
          validatedFiles++;
        } catch (err) {
          config.connection.console.error(`Error validating ${filePath}: ${err}`);
        }
      }
    }

    config.connection.console.info(
      `Workspace validation complete: ${validatedFiles}/${totalFiles} files validated`
    );
  } catch (err) {
    config.connection.console.error(`Error during workspace validation: ${err}`);
  }
}
