# Configuration Guide

This guide covers all available VS Code configuration options for the Meteor/Blaze HTML Language Server extension.

## Table of Contents
- [Quick Setup](#quick-setup)
- [Core Settings](#core-settings)
- [Block Conditions & Auto-Insert](#block-conditions--auto-insert)
- [Blaze Helpers](#blaze-helpers)
- [Theme & Syntax Highlighting](#theme--syntax-highlighting)
- [Debugging](#debugging)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)

## Quick Setup

Access VS Code settings:
1. **Settings UI**: Press `Ctrl/Cmd + ,` and search for "meteorLanguageServer"
2. **settings.json**: Press `Ctrl/Cmd + Shift + P` → "Preferences: Open Settings (JSON)"

Add configuration to your `settings.json`:

```json
{
  "meteorLanguageServer.maxNumberOfProblems": 100,
  "meteorLanguageServer.trace.server": "off",
  "meteorLanguageServer.blockConditions": {
    "enabled": true,
    "autoInsertEndTags": true,
    "color": "editorCodeLens.foreground",
    "fontStyle": "italic",
    "margin": "0 0 0 1em"
  }
}
```

## Core Settings

### `meteorLanguageServer.maxNumberOfProblems`
- **Type**: `number`
- **Default**: `100`
- **Scope**: Resource (per workspace/folder)
- **Description**: Controls the maximum number of problems (errors/warnings) reported by the server

```json
{
  "meteorLanguageServer.maxNumberOfProblems": 50
}
```

### `meteorLanguageServer.trace.server`
- **Type**: `string`
- **Default**: `"off"`
- **Options**: `"off"` | `"messages"` | `"verbose"`
- **Scope**: Window (global)
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

## Block Conditions & Auto-Insert

### `meteorLanguageServer.blockConditions`
Main configuration object for block condition hints and auto-insertion features.

#### `enabled`
- **Type**: `boolean`
- **Default**: `true`
- **Description**: Enable/disable inline condition hints for Blaze block helpers

```json
{
  "meteorLanguageServer.blockConditions": {
    "enabled": false  // Disable all block condition hints
  }
}
```

#### `autoInsertEndTags`
- **Type**: `boolean`
- **Default**: `true`
- **Description**: Automatically insert closing tags when typing opening Blaze block tags

```json
{
  "meteorLanguageServer.blockConditions": {
    "autoInsertEndTags": false  // Disable auto-insertion
  }
}
```

**How it works:**
- Type `{{#if condition}}` → automatically suggests `{{/if}}`
- Triggered by `}` character
- Smart detection prevents hints when closing tags already exist

#### `color`
- **Type**: `string`
- **Default**: `"editorCodeLens.foreground"`
- **Description**: Color for inline condition hints

**Options:**
1. **Theme colors** (recommended):
   ```json
   {
     "meteorLanguageServer.blockConditions": {
       "color": "editorCodeLens.foreground",        // Default hint color
       "color": "editorLightBulb.foreground",       // Light bulb color
       "color": "editorWarning.foreground",         // Warning color
       "color": "editorInfo.foreground"             // Info color
     }
   }
   ```

2. **Hex colors**:
   ```json
   {
     "meteorLanguageServer.blockConditions": {
       "color": "#888888",  // Gray
       "color": "#FFA500",  // Orange
       "color": "#00FF00"   // Green
     }
   }
   ```

#### `fontStyle`
- **Type**: `string`
- **Default**: `"italic"`
- **Options**: `"normal"` | `"italic"` | `"bold"`
- **Description**: Font style for inline condition hints

```json
{
  "meteorLanguageServer.blockConditions": {
    "fontStyle": "bold"    // Make hints bold
  }
}
```

#### `margin`
- **Type**: `string`
- **Default**: `"0 0 0 1em"`
- **Description**: CSS margin for positioning hints

```json
{
  "meteorLanguageServer.blockConditions": {
    "margin": "0 0 0 2em",     // More left margin
    "margin": "0.5em 0 0 1em", // Add top margin
    "margin": "0"              // No margin
  }
}
```

#### `extend`
- **Type**: `array`
- **Default**: `[]`
- **Description**: Add custom block types for inline hints

**Object properties:**
- `type` (required): Block type name
- `label` (required): Display label for hints
- `propNames` (optional): Array of property names
- `requiresEndTag` (optional): Whether block requires validation
- `autoInsertEndTag` (optional): Whether to auto-insert end tags

```json
{
  "meteorLanguageServer.blockConditions": {
    "extend": [
      {
        "type": "customBlock",
        "label": "Custom Block",
        "requiresEndTag": true,
        "autoInsertEndTag": true
      },
      {
        "type": "myHelper",
        "label": "My Helper",
        "propNames": ["data", "options"],
        "requiresEndTag": false
      }
    ]
  }
}
```

## Blaze Helpers

### `meteorLanguageServer.blazeHelpers`
Configuration for Blaze helper extensions and styling.

#### `extend`
- **Type**: `array`
- **Default**: `[]`
- **Description**: Add custom helpers for completion and hover

**Object properties:**
- `name` (required): Helper name (with or without #)
- `doc` (required): Documentation string

```json
{
  "meteorLanguageServer.blazeHelpers": {
    "extend": [
      {
        "name": "customHelper",
        "doc": "My custom helper that formats data"
      },
      {
        "name": "#myBlock",
        "doc": "My custom block helper for special formatting"
      }
    ]
  }
}
```

#### Color Customization

##### `hashColor`
- **Type**: `string`
- **Default**: `"#FF6B35"`
- **Description**: Color for the '#' in Blaze helpers

##### `nameColor`
- **Type**: `string`
- **Default**: `"#007ACC"`
- **Description**: Color for the helper name

##### `bracketColor`
- **Type**: `string`
- **Default**: `"#888888"`
- **Description**: Color for '{{' and '}}' brackets

```json
{
  "meteorLanguageServer.blazeHelpers": {
    "hashColor": "#FF0000",      // Red hash
    "nameColor": "#00FF00",      // Green helper names
    "bracketColor": "#0000FF"    // Blue brackets
  }
}
```

**Theme colors** (recommended):
```json
{
  "meteorLanguageServer.blazeHelpers": {
    "hashColor": "keyword.control",
    "nameColor": "entity.name.function",
    "bracketColor": "punctuation.definition.bracket"
  }
}
```

## Theme & Syntax Highlighting

### Token Color Customizations
Enhance syntax highlighting with custom token colors:

```json
{
  "editor.tokenColorCustomizations": {
    "textMateRules": [
      {
        "scope": "blazeBlockName",
        "settings": {
          "foreground": "#f07dff",
          "fontStyle": "italic bold"
        }
      },
      {
        "scope": "punctuation.definition.bracket.meteor",
        "settings": {
          "foreground": "#FFB300"
        }
      },
      {
        "scope": "constant.character.hash.meteor",
        "settings": {
          "foreground": "#FF6B35"
        }
      }
    ]
  }
}
```

### Semantic Token Colors
Customize semantic highlighting:

```json
{
  "editor.semanticTokenColorCustomizations": {
    "rules": {
      "blazeBlockHash": {
        "foreground": "#808080",
        "fontStyle": "bold"
      },
      "blazeBlockName": {
        "foreground": "#f177ff",
        "fontStyle": "italic bold"
      },
      "blazeBlockArgs": {
        "foreground": "#fffec4",
        "fontStyle": "bold"
      }
    }
  }
}
```

## Debugging

### Enable Debug Logging
For troubleshooting issues:

```json
{
  "meteorLanguageServer.trace.server": "verbose"
}
```

Then check: **View** → **Output** → **Meteor/Blaze Language Server**

### Common Debug Settings
```json
{
  "meteorLanguageServer.maxNumberOfProblems": 1000,  // Increase problem limit
  "meteorLanguageServer.trace.server": "verbose",    // Full logging
  "meteorLanguageServer.blockConditions": {
    "enabled": true  // Ensure features are enabled
  }
}
```

## Examples

### Minimal Configuration
```json
{
  "meteorLanguageServer.blockConditions": {
    "enabled": true,
    "autoInsertEndTags": true
  }
}
```

### Advanced Configuration
```json
{
  "meteorLanguageServer.maxNumberOfProblems": 200,
  "meteorLanguageServer.trace.server": "messages",
  "meteorLanguageServer.blockConditions": {
    "enabled": true,
    "autoInsertEndTags": true,
    "color": "#FFA500",
    "fontStyle": "bold",
    "margin": "0 0 0 2em",
    "extend": [
      {
        "type": "dataBlock",
        "label": "Data Block",
        "requiresEndTag": true,
        "autoInsertEndTag": true
      }
    ]
  },
  "meteorLanguageServer.blazeHelpers": {
    "extend": [
      {
        "name": "formatCurrency",
        "doc": "Formats numbers as currency with locale support"
      },
      {
        "name": "#dataSection",
        "doc": "Creates a data section with validation"
      }
    ],
    "hashColor": "keyword.control",
    "nameColor": "entity.name.function",
    "bracketColor": "punctuation.definition.bracket"
  }
}
```

### Team/Workspace Configuration
Add to `.vscode/settings.json` in your project:

```json
{
  "meteorLanguageServer.blockConditions": {
    "enabled": true,
    "autoInsertEndTags": true,
    "color": "editorCodeLens.foreground",
    "fontStyle": "italic"
  },
  "meteorLanguageServer.blazeHelpers": {
    "extend": [
      {
        "name": "projectHelper",
        "doc": "Project-specific helper for data formatting"
      }
    ]
  },
  "editor.tokenColorCustomizations": {
    "textMateRules": [
      {
        "scope": "blazeBlockName",
        "settings": {
          "foreground": "#569CD6",
          "fontStyle": "italic"
        }
      }
    ]
  }
}
```

## Troubleshooting

### Configuration Not Taking Effect
1. **Reload VS Code**: Press `Ctrl/Cmd + Shift + P` → "Developer: Reload Window"
2. **Check syntax**: Validate your JSON in settings.json
3. **Check scope**: Some settings are workspace-specific

### Features Not Working
1. **Enable extension**: Ensure the extension is activated (check status bar)
2. **Check file type**: Extension only works with HTML files containing `<template>` tags
3. **Enable features**: Verify `enabled: true` in configuration

### Performance Issues
```json
{
  "meteorLanguageServer.maxNumberOfProblems": 50,  // Reduce problem limit
  "meteorLanguageServer.trace.server": "off"       // Disable logging
}
```

### Reset to Defaults
Remove all `meteorLanguageServer.*` settings from your configuration to reset to defaults.

---

## Commands

The extension provides these VS Code commands:

- **`meteor-blaze-vscode-language-server.restart`**: Restart the language server
  - Access via Command Palette: `Ctrl/Cmd + Shift + P` → "Restart Meteor/Blaze HTML Language Server"

---

For more information, see the main [README.md](./README.md) or visit the [GitHub repository](https://github.com/ptbarnum4/meteor-blaze-vscode-language-server).
