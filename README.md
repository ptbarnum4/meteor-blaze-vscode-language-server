# Meteor/Blaze HTML Language Server

[![CI](https://github.com/ptbarnum4/meteor-blaze-vscode-language-server/actions/workflows/ci.yml/badge.svg)](https://github.com/ptbarnum4/meteor-blaze-vscode-language-server/actions/workflows/ci.yml)

> **⚠️ Early Release Notice**: This is a new extension under active development. While functional, it may contain bugs or incomplete features. Please [report any issues](https://github.com/ptbarnum4/meteor-blaze-vscode-language-server/issues) you encounter to help improve the extension. Contributions and feedback are greatly appreciated!

A VS Code extension that provides language support for Meteor/Blaze templates within HTML files. The extension detects Meteor templates embedded in HTML files and provides intelligent features like syntax highlighting, code completion, hover information, go-to-definition, and cross-file analysis.

## ✨ Features

- **🎯 Template Detection**: Automatically detects Meteor/Blaze templates within HTML files using `<template name="...">` tags
- **🎨 Syntax Highlighting**: TextMate grammar for Blaze templating syntax (`{{helper}}`, `{{#if}}`, etc.) within HTML
- **💡 Code Completion**: Intelligent autocomplete for:
  - Template helpers from neighboring TypeScript/JavaScript files
  - CSS classes from neighboring CSS/LESS files
  - Built-in Blaze helpers (`#each`, `#if`, `#unless`, `#with`, `#let`)
  - Template inclusions (`{{> templateName}}`) with smart import-based filtering
- **✨ Auto-Insert End Tags**: Automatically inserts closing tags when typing opening Blaze block tags (`{{#if}}` → `{{/if}}`)
- **🔍 Cross-file Intelligence**: Analyzes neighboring files in the same directory for:
  - Template helpers (from `Template.templateName.helpers()` definitions)
  - CSS classes for class attribute autocompletion
- **📋 Hover Information**: Shows helper definitions, file names, source locations, and template inclusion details
- **🎯 Go-to-Definition**: Navigate from helper usage to definition
- **🚨 Block Validation**: Detects missing or mismatched Blaze block end tags with intelligent error messages
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
1. Download the latest `.vsix` file from [releases](https://github.com/ptbarnum4/meteor-blaze-vscode-language-server/releases)
2. In VS Code: View → Command Palette → "Extensions: Install from VSIX..."
3. Select the downloaded `.vsix` file

## 🚀 Getting Started

After installation, the extension will automatically activate when you open HTML files containing Meteor templates:

1. **Create or open an HTML file** with Meteor templates:
   ```html
   <template name="myTemplate">
     <div>{{helper}}</div>
   </template>
   ```

2. **Add template helpers** in a JavaScript/TypeScript file in the same directory:
   ```javascript
   Template.myTemplate.helpers({
     helper: () => "Hello, Meteor!"
   });
   ```

3. **Start coding!** You'll now get:
   - ✨ Syntax highlighting for Blaze syntax
   - 💡 Auto-completion for helpers and CSS classes
   - 🔍 Hover information and go-to-definition
   - 🎯 Real-time validation and error checking

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

📖 **For complete configuration options, examples, and troubleshooting, see [CONFIGURATION.md](./CONFIGURATION.md)**

### Block Condition Settings
- **`enabled`** (boolean, default: `true`): Enable/disable inline condition hints for Blaze block helpers
- **`color`** (string, default: `"editorCodeLens.foreground"`): Color for hints. Use theme color names (e.g., `"editorCodeLens.foreground"`) or hex colors (e.g., `"#888888"`)
- **`fontStyle`** (string, default: `"italic"`): Font style for hints (`"normal"`, `"italic"`, or `"bold"`)
- **`margin`** (string, default: `"0 0 0 1em"`): CSS margin for positioning hints
- **`extend`** (array): Add custom block types for inline hints. Example: `[ { "type": "customBlock", "label": "Custom Block" } ]`

### Blaze Helpers Settings
- **`extend`** (array): Add custom helpers for completion and hover. Example: `[ { "name": "#myHelper", "doc": "My custom helper for Blaze templates" } ]`

## 💡 Usage Tips

### Template Detection
The extension automatically activates when it detects `<template name="...">` tags in HTML files. Regular HTML files without Meteor templates remain unaffected.

### Cross-file Intelligence
Place your template files alongside their corresponding JavaScript/TypeScript helper files and CSS files in the same directory for optimal autocompletion and navigation features.

### Example Project Structure
```
my-meteor-app/
├── client/
│   ├── templates/
│   │   ├── userProfile.html      # Contains <template name="userProfile">
│   │   ├── userProfile.js        # Template.userProfile.helpers({...})
│   │   └── userProfile.css       # Styles for the template
│   └── lib/
└── server/
```

## 🔧 Troubleshooting

### Extension Not Activating
- **Issue**: No syntax highlighting or completions in HTML files
- **Solution**: Ensure your HTML file contains `<template name="...">` tags. The extension only activates when Meteor templates are detected.

### No Completions for Helpers
- **Issue**: Template helpers not appearing in autocomplete
- **Solution**:
  - Check that helper files (`.js` or `.ts`) are in the same directory as the HTML template
  - Verify helpers are defined using `Template.templateName.helpers({...})`
  - Make sure the template name matches the helper file structure

### CSS Classes Not Completing
- **Issue**: CSS classes not showing in `class="{{...}}"` attributes
- **Solution**:
  - Ensure CSS files are in the same directory as the template
  - Check that CSS contains valid class definitions (`.className`)

### Go-to-Definition Not Working
- **Issue**: Cannot navigate to helper definitions
- **Solution**:
  - Verify the helper is defined in a JavaScript/TypeScript file in the same directory
  - Check that the cursor is positioned within a handlebars expression `{{helperName}}`

### Enable Debug Logging
If you're experiencing issues, enable verbose logging:
1. Open VS Code Settings (Ctrl/Cmd + ,)
2. Search for "meteorLanguageServer"
3. Set "Trace Server" to "verbose"
4. Check the Output panel → "Meteor/Blaze Language Server" for detailed logs

## 🤝 Contributing

Contributions are welcome! Please see [DEVELOPMENT.md](./DEVELOPMENT.md) for development setup, architecture details, and contribution guidelines.

### Quick Links
- 🐛 [Report Issues](https://github.com/ptbarnum4/meteor-blaze-vscode-language-server/issues)
- 💡 [Feature Requests](https://github.com/ptbarnum4/meteor-blaze-vscode-language-server/issues)
- 🔧 [Development Guide](./DEVELOPMENT.md)

## 📄 License

MIT License - see [LICENSE](./LICENSE) file for details.

---

**Made with ❤️ for the Meteor.js community**
