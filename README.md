# Meteor Language Server

A VS Code extension that provides language support for Meteor/Blaze templates within HTML files. The extension detects Meteor templates embedded in HTML files and provides intelligent features like syntax highlighting, code completion, and cross-file analysis.

## Features

- **Template Detection**: Automatically detects Meteor/Blaze templates within HTML files using `<template name="...">` tags
- **Syntax Highlighting**: TextMate grammar for Blaze templating syntax (`{{helper}}`, `{{#if}}`, etc.) within HTML
- **Code Completion**: Intelligent autocomplete for template helpers and CSS classes from neighboring files
- **Cross-file Intelligence**: Analyzes neighboring `.js`, `.ts`, `.css`, and `.less` files for:
  - Template helpers (from `Template.name.helpers()` definitions)
  - CSS classes for autocompletion
- **Non-intrusive**: Only activates when Meteor templates are detected; regular HTML files remain unaffected
- **Handlebars Support**: Full support for Handlebars/Blaze syntax within template blocks

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

## Test Files

Check the `test-project/` directory for test cases and examples.

## Installation

1. Install from the VS Code marketplace (when published)
2. Open an HTML file containing `<template>` tags
3. The language server will automatically provide Meteor/Blaze features

## Development

To contribute to this extension:

1. Clone the repository
2. Run `npm install` to install dependencies
3. Run `npm run compile` to build the extension
4. Press F5 to launch the Extension Development Host
5. Open an HTML file with `<template>` tags to test

### Package development
```bash
# Stop any existing watch processes
pkill -f "npm.*watch"
# Build the extension
npm run compile
# Package the extension
npm run package
# Create a VSIX package for distribution
npx vsce package
# Install the extension globally for testing
code --install-extension meteor-language-server-0.0.1.vsix
```

### Building

```bash
npm run compile        # Build once
npm run watch          # Build and watch for changes
npm run package        # Build for production
```

### Testing

```bash
npm test               # Run tests (when implemented)
```

## Architecture

- **Client** (`src/extension.ts`): VS Code extension that manages the language server
- **Server** (`src/server.ts`): Language server providing completion, validation, and hover features
- **Grammar** (`syntaxes/meteor-html.tmLanguage.json`): TextMate grammar for Blaze syntax highlighting
- **Protocol**: Uses Language Server Protocol (LSP) for communication

The extension only activates language features when Meteor templates are detected in HTML files, ensuring it doesn't interfere with regular HTML development.

## Configuration

Configure the extension through VS Code settings:

```json
{
  "meteorLanguageServer.maxNumberOfProblems": 100,
  "meteorLanguageServer.trace.server": "off"
}
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details.
