import { ExtensionConfig } from '../types';
import { createActivate } from './activate';
import { createDeactivate } from './deactivate';

/**
 * extConfig holds the configuration for the extension, including the language client and decoration type.
 * This is used to manage the state of the extension and provide functionality like decoration updates.
 */
const extConfig: ExtensionConfig = {
  client: null,
  blockConditionDecorationType: null,
  htmlElementDecorationType: null,
};

/**
 * Export the activate function
 * This will be called when the extension is activated by a user or when the server starts
 * Note: This function is called automatically by VS Code
 */
export const activate = createActivate(extConfig);

/**
 * Export the deactivate function
 * This will be called when the extension is deactivated by a user or when the server stops
 *
 * Note: This function is called automatically by VS Code
 */
export const deactivate = createDeactivate(extConfig);
