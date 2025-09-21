# Meteor/Blaze HTML Language Server

[![CI](https://github.com/ptbarnum4/meteor-blaze-vscode-language-server/actions/workflows/ci.yml/badge.svg)](https://github.com/ptbarnum4/meteor-blaze-vscode-language-server/actions/workflows/ci.yml)

> **⚠️ Early Release Notice**: This is a new extension under active development. While functional, it may contain bugs or incomplete features. Please [report any issues](https://github.com/ptbarnum4/meteor-blaze-vscode-language-server/issues) you encounter to help improve the extension. Contributions and feedback are greatly appreciated!

A VS Code extension that provides intelligent language support for Meteor/Blaze templates within HTML files. Automatically detects Meteor templates and provides syntax highlighting, code completion, hover information, go-to-definition, and cross-file analysis.

## ✨ Key Features

- **🎯 Smart Template Detection** - Automatically activates for HTML files containing `<template name="...">` tags
- **🎨 Syntax Highlighting** - Full Blaze templating syntax support (`{{helper}}`, `{{#if}}`, etc.)
- **💡 Intelligent Code Completion** - Template helpers, CSS classes, built-in Blaze helpers, and template inclusions
- **✨ Auto-Insert End Tags** - Automatically completes Blaze block tags (`{{#if}}` → `{{/if}}`)
- **🔍 Cross-file Intelligence** - Analyzes neighboring TypeScript/JavaScript and CSS files for completions
- **📋 Rich Hover Information** - Shows helper definitions, file locations, and documentation
- **🎯 Go-to-Definition** - Navigate from helper usage to definition
- **🚨 Block Validation** - Detects missing or mismatched Blaze block end tags

## 🚀 Quick Start

### Installation
1. **From VS Code Marketplace**: Search for "Meteor/Blaze HTML Language Server" in VS Code Extensions
2. **Manual Installation**: Download the [latest .vsix file](https://github.com/ptbarnum4/meteor-blaze-vscode-language-server/releases) and install via "Extensions: Install from VSIX..."

### Usage
1. **Open an HTML file** containing Meteor templates:
   ```html
   <template name="myTemplate">
     <div>{{helper}}</div>
   </template>
   ```

2. **Add template helpers** in the same directory:
   ```javascript
   Template.myTemplate.helpers({
     helper: () => "Hello, Meteor!"
   });
   ```

3. **Start coding!** Enjoy syntax highlighting, auto-completion, and intelligent features.

## ⚙️ Configuration

Basic configuration in VS Code settings:
```json
{
  "meteorLanguageServer.maxNumberOfProblems": 100,
  "meteorLanguageServer.blockConditions.enabled": true,
  "meteorLanguageServer.trace.server": "off"
}
```

📖 **For complete configuration options and advanced features, see [docs/SETUP.md](./docs/SETUP.md)**

## 📚 Documentation

- **[📖 Complete Documentation](./docs/README.md)** - All documentation in one place
- **[⚙️ Configuration Guide](./docs/SETUP.md)** - Detailed configuration options
- **[🛠️ Development Guide](./docs/development/DEVELOPMENT.md)** - Contributing and development setup
- **[✨ Feature Documentation](./docs/FEATURES.md)** - Detailed feature explanations
- **[📝 Changelog](./docs/CHANGELOG.md)** - Version history

## 🆘 Need Help?

- **[🐛 Report Issues](https://github.com/ptbarnum4/meteor-blaze-vscode-language-server/issues)** - Bug reports and feature requests
- **[🔧 Troubleshooting](./docs/SETUP.md#troubleshooting)** - Common issues and solutions
- **[� Development](./docs/development/DEVELOPMENT.md)** - Contributing to the project

## 📄 License

MIT License - see [LICENSE](./LICENSE) file for details.

---

**Made with ❤️ for the Meteor.js community**
