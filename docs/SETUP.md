# Setup & Configuration

Complete guide for setting up and configuring the Meteor/Blaze HTML Language Server extension.

## 📋 Example Configuration Files

The following example configuration files are available in this directory for reference:

- **[example-settings.jsonc](./example-settings.jsonc)** - Basic language server configuration with block conditions and custom helpers
- **[example-settings-auto-insert.jsonc](./example-settings-auto-insert.jsonc)** - Auto-insert end tags configuration examples
- **[example-settings-blazeHelpers-colors.jsonc](./example-settings-blazeHelpers-colors.jsonc)** - Custom colors for Blaze helper tokens
- **[example-blaze-token-theme.jsonc](./example-blaze-token-theme.jsonc)** - TextMate token color customization examples

You can copy settings from these files into your VS Code `settings.json` file.

## Quick Setup

### Access VS Code Settings
1. **Settings UI**: Press `Ctrl/Cmd + ,` and search for "meteorLanguageServer"
2. **settings.json**: Press `Ctrl/Cmd + Shift + P` → "Preferences: Open Settings (JSON)"

### Basic Configuration
Add this to your `settings.json`:

```json
{
  "meteorLanguageServer.maxNumberOfProblems": 100,
  "meteorLanguageServer.trace.server": "off",
  "meteorLanguageServer.blockConditions": {
    "enabled": true,
    "autoInsertEndTags": true,
    "color": "#727272",
    "fontStyle": "italic",
    "margin": "0 0 0 0.75em"
  }
}
```

## Core Settings

### `meteorLanguageServer.maxNumberOfProblems`
- **Type**: `number`
- **Default**: `100`
- **Description**: Maximum number of problems (errors/warnings) reported by the server

```json
{
  "meteorLanguageServer.maxNumberOfProblems": 50
}
```

### `meteorLanguageServer.trace.server`
- **Type**: `string`
- **Default**: `"off"`
- **Options**: `"off"` | `"messages"` | `"verbose"`
- **Description**: Traces communication between VS Code and the language server

```json
{
  "meteorLanguageServer.trace.server": "verbose"
}
```

**Use cases:**
- `"off"`: No tracing (production use)
- `"messages"`: Log basic messages (moderate debugging)
- `"verbose"`: Log everything (detailed debugging)

## Block Conditions & Visual Hints

### `meteorLanguageServer.blockConditions`
Main configuration object for block condition hints and auto-insertion features.

#### Basic Options
```json
{
  "meteorLanguageServer.blockConditions": {
    "enabled": true,                    // Enable/disable block condition hints
    "autoInsertEndTags": true,         // Enable auto-insertion of closing tags
    "color": "#727272",                // Color for condition hints
    "fontStyle": "italic",             // Font style: "normal", "italic", "bold"
    "margin": "0 0 0 0.75em"          // CSS margin for positioning hints
  }
}
```

#### Advanced Custom Blocks
```json
{
  "meteorLanguageServer.blockConditions": {
    "enabled": true,
    "extend": [
      {
        "type": "customBlock",
        "label": "Custom Block",
        "requiresEndTag": true,
        "autoInsertEndTag": true
      }
    ]
  }
}
```

## Blaze Helpers Configuration

### `meteorLanguageServer.blazeHelpers`
Extend built-in Blaze helpers with custom ones.

```json
{
  "meteorLanguageServer.blazeHelpers": {
    "extend": [
      {
        "name": "#myHelper",
        "doc": "My custom helper for Blaze templates"
      },
      {
        "name": "customUtility",
        "doc": "Custom utility helper function"
      }
    ]
  }
}
```

## Theme & Syntax Highlighting

### Custom Theme Colors
The extension provides custom theme colors for advanced syntax highlighting:

```json
{
  "editor.semanticTokenColorCustomizations": {
    "rules": {
      "blazeBlockHash": { "foreground": "#808080", "fontStyle": "bold" },
      "blazeBlockName": { "foreground": "#f177ff", "fontStyle": "italic bold" },
      "blazeBlockArgs": { "foreground": "#fffec4" },
      "blazeBlockFirstArg": { "foreground": "#ffd16f" },
      "blazeExpression": { "foreground": "#ffd16f" },
      "blazeBlockIn": { "foreground": "#00ffa2" },
      "delimiter": { "foreground": "#808080" }
    }
  }
}
```

## Custom Global Helpers

### `meteorLanguageServer.globalHelpers`
Define custom global helpers with rich documentation, parameter types, and examples. This is useful for:
- Helpers from external packages not auto-detected
- Custom app-level helpers with detailed documentation
- Providing better IntelliSense for team members

#### Simple Helper Configuration
```json
{
  "meteorLanguageServer.globalHelpers": {
    "extend": [
      {
        "name": "trim",
        "doc": "Trims whitespace from the beginning and end of a string."
      }
    ]
  }
}
```

#### Full Helper Configuration with Parameters
```json
{
  "meteorLanguageServer.globalHelpers": {
    "extend": [
      {
        "name": "formatDate",
        "doc": "Format the given date string into a more readable format.",
        "params": [
          {
            "name": "date",
            "type": ["string", "Date"],
            "doc": "The date string to format."
          },
          {
            "name": "format",
            "type": "string",
            "optional": true,
            "default": "MM/DD/YYYY",
            "doc": "The desired output format (e.g., 'MM/DD/YYYY')."
          }
        ],
        "return": {
          "type": "string",
          "doc": "The formatted date string."
        },
        "examples": [
          {
            "html": "{{ formatDate '2023-10-05' 'DD-MM-YYYY' }}"
          },
          {
            "html": "{{ formatDate createdAt }}"
          }
        ]
      }
    ]
  }
}
```

#### Configuration Fields

**Required:**
- `name` (string): The helper name

**Optional:**
- `doc` (string): Description of what the helper does
- `params` (array): Array of parameter definitions
  - `name` (string): Parameter name (required)
  - `type` (string | string[]): Type(s) for the parameter
  - `doc` (string): Parameter documentation
  - `optional` (boolean): Whether parameter is optional
  - `default` (string): Default value
- `return` (object): Return value information
  - `type` (string): Return type
  - `doc` (string): Return value documentation
- `examples` (array): Usage examples
  - `html` (string): Example template code

#### Benefits
- **IntelliSense**: Hover over helpers to see full documentation
- **Type Information**: Parameter and return types displayed
- **Examples**: Quick reference for correct usage
- **Completions**: Custom helpers appear in autocomplete

See [example-settings-globalHelpers.jsonc](./example-settings-globalHelpers.jsonc) for more examples.

### `meteorLanguageServer.blazeHelpers` (Legacy)
Simple helper configuration with name and doc only. For more advanced documentation, use `globalHelpers` instead.

```json
{
  "meteorLanguageServer.blazeHelpers": {
    "extend": [
      {
        "name": "#customBlock",
        "doc": "Custom block helper with documentation"
      }
    ]
  }
}
```

## Token Color Customization

### Semantic Token Colors
- `blazeBlockHash.defaultColor` - `#808080`
- `blazeBlockName.defaultColor` - `#f177ff`
- `blazeBlockArgs.defaultColor` - `#fffec4`
- `blazeBlockFirstArg.defaultColor` - `#ffd16f`
- `blazeBlockSingleArg.defaultColor` - `#ffd16f`
- `blazeExpression.defaultColor` - `#ffd16f`
- `blazeBlockIn.defaultColor` - `#00ffa2`
- `delimiter.defaultColor` - `#808080`

## Default Settings

The extension uses these defaults when no custom settings are provided:

### Block Condition Defaults
- **Color**: `#727272` (updated from `editorCodeLens.foreground`)
- **Font Style**: `italic`
- **Margin**: `0 0 0 0.75em` (updated from `0 0 0 1em`)

These settings provide better visual integration with most VS Code themes.

## Complete Configuration Example

```json
{
  "meteorLanguageServer.maxNumberOfProblems": 100,
  "meteorLanguageServer.trace.server": "off",
  "meteorLanguageServer.blockConditions": {
    "enabled": true,
    "autoInsertEndTags": true,
    "color": "#727272",
    "fontStyle": "italic",
    "margin": "0 0 0 0.75em",
    "extend": [
      {
        "type": "customHelper",
        "label": "Custom Helper",
        "requiresEndTag": true,
        "autoInsertEndTag": true
      }
    ]
  },
  "meteorLanguageServer.blazeHelpers": {
    "extend": [
      {
        "name": "#customBlock",
        "doc": "Custom block helper with documentation"
      }
    ]
  },
  "editor.semanticTokenColorCustomizations": {
    "rules": {
      "blazeBlockHash": { "foreground": "#808080", "fontStyle": "bold" },
      "blazeBlockName": { "foreground": "#f177ff", "fontStyle": "italic bold" }
    }
  }
}
```

## Troubleshooting

### Extension Not Activating
- **Issue**: No syntax highlighting or completions in HTML files
- **Solution**: Ensure your HTML file contains `<template name="...">` tags and you're in a Meteor project (has `.meteor` directory)

### No Completions for Helpers
- **Issue**: Template helpers not appearing in autocomplete
- **Solution**:
  - Check that helper files (`.js` or `.ts`) are in the same directory as the HTML template
  - Verify helpers are defined using `Template.templateName.helpers({...})`
  - Ensure the template name matches the helper file structure

### Block Condition Hints Not Showing
- **Issue**: No inline hints for block conditions
- **Solution**:
  - Verify `meteorLanguageServer.blockConditions.enabled` is `true`
  - Check that you're inside a `<template>` block
  - Ensure the closing tag doesn't already have a comment

### CSS Classes Not Completing
- **Issue**: CSS classes not showing in `class="{{...}}"` attributes
- **Solution**:
  - Ensure CSS files are in the same directory as the template
  - Check that CSS contains valid class definitions (`.className`)

### Debug Logging
Enable detailed logging to troubleshoot issues:

1. Set `"meteorLanguageServer.trace.server": "verbose"`
2. Check VS Code Output panel → "Meteor/Blaze Language Server"
3. Look for initialization and error messages

### Performance Issues
If experiencing slow performance:

1. Reduce `maxNumberOfProblems` to a lower value (e.g., 25)
2. Set `trace.server` to `"off"` in production
3. Check for very large CSS/JS files in template directories