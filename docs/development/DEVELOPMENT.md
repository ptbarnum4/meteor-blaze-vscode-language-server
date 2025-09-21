# Development Guide

This guide covers development setup, architecture, and contribution guidelines for the Meteor/Blaze HTML Language Server extension.

## 🔧 Development Setup

### Quick Start
```bash
# Clone the repository
git clone https://github.com/ptbarnum4/meteor-blaze-vscode-language-server.git
cd meteor-blaze-vscode-language-server

# Install dependencies
npm install

# Start development mode (watch for changes)
npm run dev

# In VS Code: Press F5 to launch Extension Development Host
```

### Available Commands
```bash
npm run dev          # Start development mode (watch + compile)
npm run compile      # Build once
npm run watch        # Watch for changes and rebuild
npm run package      # Build for production
npm run lint         # Run ESLint
npm run check-types  # Check TypeScript types
npm test             # Run tests
npm run package:local # Build and install locally for testing
```

### Development Workflow
1. **Setup**: Run `npm install` and `npm run dev`
2. **Code**: Make changes to `src/` files
3. **Test**: Press F5 in VS Code to launch Extension Development Host
4. **Debug**: Open test files in `test-project/` to test features
5. **Package**: Run `npm run package` to create production build

## 🏗️ Architecture

The extension follows the Language Server Protocol (LSP) architecture:

- **Client** (`src/extension/index.ts`): VS Code extension that manages the language server
- **Server** (`src/server/index.ts`): Language server providing completion, validation, hover, and definition features
- **Grammar** (`syntaxes/meteor-html.tmLanguage.json`): TextMate grammar for Blaze syntax highlighting
- **Protocol**: Uses Language Server Protocol (LSP) for communication

### Project Structure
```
meteor-blaze-vscode-language-server/
├── src/
│   ├── extension/
│   │   └── index.ts          # VS Code extension client
│   ├── server/
│   │   ├── index.ts          # Main language server
│   │   ├── connection/       # LSP connection handlers
│   │   └── helpers/          # Analysis and utility functions
│   └── types.ts              # TypeScript type definitions
├── test-project/              # Test Meteor project (excluded from build)
│   ├── simple.html            # Basic template test
│   ├── simple.ts              # TypeScript helpers
│   └── test/                  # Nested template tests
├── src/test/                  # Unit tests
│   └── server/               # Server-side tests
├── syntaxes/
│   └── meteor-html.tmLanguage.json  # TextMate grammar
├── .github/
│   └── workflows/            # CI/CD workflows
├── package.json               # Extension manifest
└── tsconfig.json             # TypeScript configuration
```

### Server Components

#### Connection Handlers (`src/server/connection/`)
- `onInitialize.ts` - LSP initialization and capabilities
- `onCompletion.ts` - Code completion provider
- `onHover.ts` - Hover information provider
- `onDefinition.ts` - Go-to-definition provider
- `onDidChangeContent.ts` - Document change handler
- `onDidChangeConfiguration.ts` - Configuration change handler

#### Helper Functions (`src/server/helpers/`)
- `analyzeCSSFile.ts` - CSS class extraction
- `analyzeJavaScriptFile.ts` - Template helper extraction
- `containsMeteorTemplates.ts` - Template detection
- `validateTextDocument.ts` - Document validation
- `isWithinHandlebarsExpression.ts` - Handlebars context detection

## 🧪 Testing

### Unit Tests
The project includes comprehensive unit tests for all server components:

```bash
# Run all tests
npm test

# Tests are located in src/test/server/
# - connection/ - Tests for LSP handlers
# - helpers/ - Tests for utility functions
```

Test coverage includes:
- 157 unit tests covering all connection handlers and helper functions
- Mock LSP connections and documents
- Edge case handling and error scenarios

### Integration Testing
The `test-project/` directory contains a full Meteor project for testing:

```bash
cd test-project
meteor npm install    # Install dependencies
meteor                # Start Meteor (optional)

# Test the extension by opening template files in VS Code
```

### Test Cases
- `simple.html` + `simple.ts`: Basic template and helpers
- `test/template.html` + `test.ts`: Advanced TypeScript features
- `test/nestedTemplate/`: Nested directory structure

## 🤝 Contributing

### Development Guidelines
- Follow TypeScript best practices
- Add tests for new features (maintain 100% test coverage for core functionality)
- Update documentation as needed
- Ensure all checks pass:
  ```bash
  npm run lint         # ESLint code quality
  npm run check-types  # TypeScript type checking
  npm test             # Unit tests
  ```

### Pull Request Process
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add/update tests as needed
5. Run all checks (`npm run lint`, `npm run check-types`, `npm test`)
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

### Code Style
- Use TypeScript with strict type checking
- Follow existing code patterns and naming conventions
- Include JSDoc comments for public functions
- Use meaningful variable and function names
- Keep functions focused and testable

## 🚀 CI/CD

The project uses GitHub Actions for continuous integration:

### Workflows
- **CI Workflow** (`.github/workflows/ci.yml`): Runs on PRs and main branch pushes
  - Linting, type checking, and testing
  - Builds extension package
  - Uses Node.js LTS

- **Test Workflow** (`.github/workflows/test.yml`): Extended testing
  - Cross-platform testing (Ubuntu, Windows, macOS)
  - Manual dispatch and daily scheduled runs

### Release Process
1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Create release tag
4. GitHub Actions will build and create release artifacts

## 📊 Performance Considerations

- **Lazy Loading**: Language server only activates when Meteor templates are detected
- **File Watching**: Monitors changes to neighboring JS/TS/CSS files
- **Caching**: Document settings and analysis results are cached
- **Directory Scope**: Analysis limited to same directory for performance

## 🔍 Debugging

### VS Code Development
1. Open the project in VS Code
2. Set breakpoints in TypeScript files
3. Press F5 to launch Extension Development Host
4. Debug both client and server code

### Language Server Logs
Enable server tracing in VS Code settings:
```json
{
  "meteorLanguageServer.trace.server": "verbose"
}
```

### Common Issues
- **Template not detected**: Ensure HTML file contains `<template name="...">` tags
- **Completions not working**: Check that helper files are in the same directory
- **Server not starting**: Check VS Code developer console for errors

## 📚 Additional Resources

- [Language Server Protocol Specification](https://microsoft.github.io/language-server-protocol/)
- [VS Code Extension API](https://code.visualstudio.com/api)
- [TextMate Grammar Guide](https://macromates.com/manual/en/language_grammars)
- [Meteor/Blaze Documentation](https://docs.meteor.com/api/blaze.html)
