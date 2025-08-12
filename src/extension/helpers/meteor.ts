import fs from 'fs';
import path from 'path';
import vscode from 'vscode';

/**
 * Checks if the current workspace is a Meteor project by looking for a .meteor directory.
 * @returns {boolean} True if it's a Meteor project, false otherwise.
 */
export const isMeteorProject = (): boolean => {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    return false;
  }

  // Check each workspace folder for a .meteor directory (recursively up 5 levels)
  for (const folder of workspaceFolders) {
    let currentPath = folder.uri.fsPath;

    // Check current directory and up to 5 parent directories
    for (let level = 0; level <= 5; level++) {
      const meteorPath = path.join(currentPath, '.meteor');
      try {
        if (fs.existsSync(meteorPath) && fs.statSync(meteorPath).isDirectory()) {
          return true;
        }
      } catch (error) {
        // Ignore errors and continue checking
        console.error(`Error checking for .meteor directory in ${currentPath}:`, error);
      }

      // Move up one directory level
      const parentPath = path.dirname(currentPath);

      // Stop if we've reached the root or can't go up further
      if (parentPath === currentPath) {
        break;
      }

      currentPath = parentPath;
    }
  }

  return false;
};


/**
 * Check if a file contains a `<template>` tag with a `name` attribute.
 * @param document The VS Code document to check.
 * @returns True if the document contains Meteor templates, false otherwise.
 */
export const containsMeteorTemplates = (document: vscode.TextDocument): boolean => {
  const text = document.getText();
  return /<template\s+name=["'][^"']+["'][^>]*>/.test(text);
};
