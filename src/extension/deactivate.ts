import { ExtensionConfig } from '/types';

/**
 * Deactivates the extension by stopping the language client and disposing of resources.
 * @param extConfig The extension configuration containing the language client and other resources.
 * @returns A promise that resolves when the deactivation is complete.
 */
export const createDeactivate = (extConfig: ExtensionConfig) => {
  return (): Thenable<void> | undefined => {
    // Dispose decoration type

    extConfig.blockConditionDecorationType?.dispose();

    if (!extConfig.client) {
      return undefined;
    }

    return extConfig.client.stop();
  };
};
