# Meteor Language Server

A comprehensive VS Code extension that provides language server capabilities for the Meteor JavaScript framework.

## Features

- **Syntax Highlighting**: Custom syntax highlighting for Meteor-specific APIs and patterns
- **Code Completion**: Intelligent autocompletion for Meteor APIs including:
  - `Meteor.startup`, `Meteor.isClient`, `Meteor.isServer`
  - `Meteor.publish`, `Meteor.subscribe`, `Meteor.methods`, `Meteor.call`
  - `Template` helpers and instance methods
  - `ReactiveVar` and other reactive data sources
- **Diagnostics**: Real-time error detection and warnings for:
  - Deprecated API usage (e.g., `Deps` → `Tracker`)
  - Best practice suggestions
  - Performance recommendations
- **Hover Information**: Detailed documentation on hover for Meteor APIs
- **Go to Definition**: Navigate to method and template definitions
- **Language Configuration**: Proper bracket matching, commenting, and indentation

## Supported File Types

- `.meteor` files
- `.blaze` template files
- JavaScript files in Meteor projects
- TypeScript files in Meteor projects

## Installation

1. Install from the VS Code marketplace
2. Open a Meteor project
3. The language server will automatically activate

## Configuration

Configure the extension through VS Code settings:

```json
{
  "meteorLanguageServer.maxNumberOfProblems": 100,
  "meteorLanguageServer.trace.server": "off"
}
```

## Commands

- **Restart Meteor Language Server**: Restart the language server if needed

## Development

### Prerequisites

- Node.js 16+
- npm or yarn
- VS Code

### Setup

```bash
git clone <repository-url>
cd meteor-blaze-vscode-language-server
npm install
```

### Building

```bash
npm run compile        # Build once
npm run watch          # Build and watch for changes
npm run package        # Build for production
```

### Testing

```bash
npm test               # Run tests
```

### Debugging

1. Open the project in VS Code
2. Press `F5` to launch the Extension Development Host
3. Open a Meteor project in the new window
4. Test the language server features

## Architecture

This extension follows the Language Server Protocol (LSP) pattern:

- **Client** (`src/extension.ts`): VS Code extension that manages the language client
- **Server** (`src/server.ts`): Language server that provides language features
- **Grammar** (`syntaxes/meteor.tmLanguage.json`): TextMate grammar for syntax highlighting
- **Configuration** (`language-configuration.json`): Language configuration for VS Code

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details.
