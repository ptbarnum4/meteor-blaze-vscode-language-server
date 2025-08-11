# Meteor/Blaze HTML Language Server

A VS Code extension that provides language support for Meteor/Blaze templates within HTML files. The extension detects Meteor templates embedded in HTML files and provides intelligent features like syntax highlighting, code completion, hover information, go-to-definition, and cross-file analysis.

## ✨ Features

- **🎯 Template Detection**: Automatically detects Meteor/Blaze templates within HTML files using `<template name="...">` tags
- **🎨 Syntax Highlighting**: TextMate grammar for Blaze templating syntax (`{{helper}}`, `{{#if}}`, etc.) within HTML
- **💡 Code Completion**: Intelligent autocomplete for:
  - Template helpers from neighboring TypeScript/JavaScript files
  - CSS classes from neighboring CSS/LESS files
  - Built-in Blaze helpers (`#each`, `#if`, `#unless`, `#with`, `#let`)
- **🔍 Cross-file Intelligence**: Analyzes neighboring files in the same directory for:
  - Template helpers (from `Template.templateName.helpers()` definitions)
  - CSS classes for class attribute autocompletion
- **📋 Hover Information**: Shows helper definitions, file names, and source locations
- **🎯 Go-to-Definition**: Navigate from helper usage to definition
- **🔧 Non-intrusive**: Only activates when Meteor templates are detected; regular HTML files remain unaffected
- **🤝 Handlebars Support**: Full support for Handlebars/Blaze syntax within template blocks
- **📁 Directory-specific**: Only includes helpers and classes from files in the same directory

## How It Works

The extension works with standard HTML files that contain Meteor/Blaze templates:

```html
<!DOCTYPE html>
<html>
<head>
    <title>My Meteor App</title>
</head>
<body>
    <!-- Regular HTML content -->
    <div id="app"></div>

    <!-- Meteor template - triggers language server features -->
    <template name="myTemplate">
        <div class="{{cssClass}}">
            <h1>{{title}}</h1>
            {{#if showContent}}
                <p>{{content}}</p>
            {{/if}}
        </div>
    </template>

    <!-- Another template -->
    <template name="userProfile">
        <div class="user-card">
            <img src="{{avatar}}" alt="{{username}}">
            <h2>{{displayName}}</h2>
        </div>
    </template>
</body>
</html>
```

## Cross-file Analysis

The extension automatically analyzes files in the same directory to provide intelligent completions:

**template.js** (Template helpers):
```javascript
Template.myTemplate.helpers({
    title: () => "Hello World",
    cssClass: () => "my-custom-class",
    showContent: () => true,
    content: () => "This is dynamic content"
});
```

**styles.css** (CSS classes):
```css
.my-custom-class {
    background-color: #f0f0f0;
    padding: 20px;
}

.user-card {
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 16px;
}
```

## 🚀 Installation

### From VS Code Marketplace
1. Open VS Code
2. Go to Extensions (Ctrl/Cmd + Shift + X)
3. Search for "Meteor/Blaze HTML Language Server"
4. Click Install

### Manual Installation
1. Download the latest `.vsix` file from releases
2. Run `code --install-extension meteor-blaze-vscode-language-server-x.x.x.vsix`

## 🔧 Development

### Quick Start
```bash
# Clone the repository
git clone <repository-url>
cd meteorLanguageServer

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
```

### Development Workflow
1. **Setup**: Run `npm install` and `npm run dev`
2. **Code**: Make changes to `src/` files
3. **Test**: Press F5 in VS Code to launch Extension Development Host
4. **Debug**: Open test files in `test-project/` to test features
5. **Package**: Run `npm run package` to create production build

### Project Structure
```
meteorLanguageServer/
├── src/
│   ├── extension.ts           # VS Code extension client
│   └── server/index.ts        # Language server implementation
├── test-project/              # Test Meteor project (excluded from build)
│   ├── simple.html            # Basic template test
│   ├── simple.ts              # TypeScript helpers
│   └── test/                  # Nested template tests
├── syntaxes/
│   └── meteor-html.tmLanguage.json  # TextMate grammar
├── package.json               # Extension manifest
└── tsconfig.json             # TypeScript configuration
```

## 🏗️ Architecture

- **Client** (`src/extension.ts`): VS Code extension that manages the language server
- **Server** (`src/server/index.ts`): Language server providing completion, validation, hover, and definition features
- **Grammar** (`syntaxes/meteor-html.tmLanguage.json`): TextMate grammar for Blaze syntax highlighting
- **Protocol**: Uses Language Server Protocol (LSP) for communication

The extension only activates language features when Meteor templates are detected in HTML files, ensuring it doesn't interfere with regular HTML development.

## ⚙️ Configuration

Configure the extension through VS Code settings. Use nested objects for advanced features:

```json
{
  "meteorLanguageServer.maxNumberOfProblems": 100,
  "meteorLanguageServer.trace.server": "off",
  "meteorLanguageServer.blockConditions": {
    "enabled": true,
    "color": "editorCodeLens.foreground",
    "fontStyle": "italic",
    "margin": "0 0 0 1em",
    "extend": [
      { "type": "customBlock", "label": "Custom Block" }
    ]
  },
  "meteorLanguageServer.blazeHelpers": {
    "extend": [
      { "name": "#myHelper", "doc": "My custom helper for Blaze templates" }
    ]
  }
}
```

### Block Condition Settings
- **`enabled`** (boolean, default: `true`): Enable/disable inline condition hints for Blaze block helpers
- **`color`** (string, default: `"editorCodeLens.foreground"`): Color for hints. Use theme color names (e.g., `"editorCodeLens.foreground"`) or hex colors (e.g., `"#888888"`)
- **`fontStyle`** (string, default: `"italic"`): Font style for hints (`"normal"`, `"italic"`, or `"bold"`)
- **`margin`** (string, default: `"0 0 0 1em"`): CSS margin for positioning hints
- **`extend`** (array): Add custom block types for inline hints. Example: `[ { "type": "customBlock", "label": "Custom Block" } ]`

### Blaze Helpers Settings
- **`extend`** (array): Add custom helpers for completion and hover. Example: `[ { "name": "#myHelper", "doc": "My custom helper for Blaze templates" } ]`

## 🧪 Testing

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

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`npm test`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Development Guidelines
- Follow TypeScript best practices
- Add tests for new features
- Update documentation as needed
- Ensure all checks pass (`npm run lint`, `npm run check-types`)

## 📄 License

MIT License - see LICENSE file for details.

## 🐛 Issues & Support

- Report bugs on [GitHub Issues](https://github.com/ptbarnum4/meteor-blaze-vscode-language-server/issues)
- Feature requests welcome
- Check existing issues before creating new ones
