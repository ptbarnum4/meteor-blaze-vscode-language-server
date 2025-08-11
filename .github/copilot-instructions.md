<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

This is a VS Code extension project. Please use the get_vscode_api with a query as input to fetch the latest VS Code API references.

## Project Overview
This is a language server extension for the Meteor framework that provides:
- Syntax highlighting and validation
- Code completion
- Hover information
- Go-to-definition functionality
- Diagnostics and error detection

## Architecture
- **Client**: VS Code extension that communicates with the language server
- **Server**: Language server that provides language features
- **Communication**: Uses the Language Server Protocol (LSP)

## Key Files
- `src/extension.ts`: Extension entry point and client setup
- `src/server/index.ts`: Language server implementation
- `package.json`: Extension manifest and configuration
- `syntaxes/`: Language grammar definitions
- `language-configuration.json`: Language configuration

## Development Guidelines
- Follow the Language Server Protocol specification
- Use TypeScript for type safety
- Implement incremental parsing for performance
- Provide comprehensive error handling
- Include proper logging for debugging
