import vscode from 'vscode';

/**
 * Checks if any relevant configurations are set in the VS Code settings.
 * This includes semantic token color customizations and Meteor-specific settings.
 * @returns True if any configurations are set, false otherwise.
 */
export const checkHasAnyConfigsSet = (): boolean => {
  try {
    const editorConfig = vscode.workspace.getConfiguration('editor');
    const meteorConfig = vscode.workspace.getConfiguration('meteorLanguageServer');

    // Check for semantic token color customizations
    const semanticTokenRules = editorConfig.get('semanticTokenColorCustomizations.rules');
    const hasSemanticTokenRules =
      semanticTokenRules &&
      typeof semanticTokenRules === 'object' &&
      ('blazeBlockHash' in semanticTokenRules ||
        'blazeBlockName' in semanticTokenRules ||
        'blazeBlockArgs' in semanticTokenRules ||
        'blazeBlockFirstArg' in semanticTokenRules ||
        'blazeBlockSingleArg' in semanticTokenRules ||
        'blazeExpression' in semanticTokenRules ||
        'blazeBlockIn' in semanticTokenRules);

    // Check for meteor-specific configurations
    const blockConditionsConfig = meteorConfig.get('blockConditions') ?? {};
    const blazeHelpersConfig = meteorConfig.has('blazeHelpers') ?? {};

    const hasBlockConditionsConfig = !!Object.keys(blockConditionsConfig).length;

    const hasBlazeHelpersConfig = !!Object.keys(blazeHelpersConfig).length;

    // Return true if any of the configurations are set
    return !!hasSemanticTokenRules || hasBlockConditionsConfig || hasBlazeHelpersConfig;
  } catch (error) {
    console.error('Error checking configurations:', error);
    return false; // If we can't read configs, assume no configs are set
  }
};

const LINKS = {
  CONFIGURATION: {
    text: 'Open Configuration Guide',
    url: 'https://github.com/ptbarnum4/meteor-blaze-vscode-language-server/blob/main/docs/SETUP.md'
  }
};

const getLinkByName = (name: keyof typeof LINKS): { text: string; url: string } | undefined => {
  return LINKS[name] || undefined;
};
const getLinkByText = (text: string): { text: string; url: string } | undefined => {
  return Object.values(LINKS).find(link => link.text === text);
};

const openExternalLink = (urlNameOrText: string) => {
  const linkInfo =
    getLinkByName(urlNameOrText as keyof typeof LINKS) || getLinkByText(urlNameOrText);
  if (!linkInfo || !linkInfo.url) {
    console.error(`No URL found for ${urlNameOrText}`);
    return;
  }

  vscode.env.openExternal(vscode.Uri.parse(linkInfo.url));
};

/**
 * Prompts the user to set editor.tokenColorCustomizations for Blaze token colors
 * if they haven't already configured it.
 */
const promptIfNoConfigsSet = async (): Promise<void> => {
  // Only show popup if none of the Blaze-specific configurations are set
  if (checkHasAnyConfigsSet()) {
    // Configurations are already set, no need to prompt
    return;
  }

  try {
    const selection = await vscode.window.showInformationMessage(
      'For full Blaze token coloring, add editor.tokenColorCustomizations to your settings. See docs/SETUP.md for details.',
      'Open Configuration Guide'
    );

    if (!selection) {
      // User dismissed the prompt
      return;
    }

    openExternalLink(selection);
  } catch (error) {
    console.error('Error prompting for configurations:', error);
  }
};

export default promptIfNoConfigsSet;
