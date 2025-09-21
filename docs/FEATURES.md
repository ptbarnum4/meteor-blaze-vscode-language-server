# Features Guide

Comprehensive guide to all features provided by the Meteor/Blaze HTML Language Server extension.

## Overview

The extension provides intelligent language support for Meteor/Blaze templates with features that activate automatically when it detects `<template name="...">` tags in HTML files within Meteor projects.

## Core Features

### 🎯 Smart Template Detection
The extension automatically detects Meteor projects and activates only when:
- A `.meteor` directory is present in the workspace
- HTML files contain `<template name="...">` tags
- Regular HTML files without Meteor templates remain unaffected

**Testing Template Detection:**
- ✅ **Meteor Project**: Extension activates and shows "Meteor/Blaze HTML Language Server activated for Meteor project!"
- ❌ **Non-Meteor Project**: Extension remains inactive, no Blaze features available

### 🎨 Syntax Highlighting & Expression Detection
Full support for Blaze templating syntax with intelligent expression detection:

- **Handlebars Expressions**: `{{helper}}`, `{{{rawHtml}}}`
- **Block Helpers**: `{{#if}}`, `{{#each}}`, `{{#unless}}`, `{{#with}}`
- **Template Inclusions**: `{{> templateName}}`
- **Comments**: `{{!-- comment --}}`

**Smart Expression Detection:**
- Auto-completion only triggers within `{{}}` or `{{{}}}` expressions
- Hover information shows only when cursor is inside handlebars expressions
- No interference with regular HTML content

### 💡 Intelligent Code Completion
Advanced auto-completion that analyzes neighboring files:

#### Template Helpers
```javascript
// template.js
Template.myTemplate.helpers({
  userName: () => "John Doe",
  isActive: () => true,
  formatDate: (date) => new Date(date).toLocaleDateString()
});
```

#### CSS Classes
```css
/* styles.css */
.user-card { border: 1px solid #ddd; }
.active-status { color: green; }
```

#### Built-in Blaze Helpers
- `#each`, `#if`, `#unless`, `#with`, `#let`
- `this`, `@index`, `@key`
- Context-aware suggestions

#### Template Inclusions (`{{> templateName}}`)
Smart template inclusion with import-based filtering:

```typescript
// test.ts
import './nestedTemplate/nestedTemplate';
import './userProfile/userProfile';
```

```html
<!-- template.html -->
<template name="test">
  {{> }} <!-- Only suggests imported templates: nestedTemplate, userProfile -->
</template>
```

**Features:**
- Analyzes import statements in associated JS/TS files
- Only suggests templates that are actually imported
- Supports various import patterns (relative paths, standard Meteor patterns)
- Provides hover information for template inclusions

## ✨ Auto-Insert End Tags

Automatically inserts closing tags for Blaze block helpers, reducing errors and speeding development.

### How It Works

#### Primary Method: Completion Within Opening Block
When you have an incomplete opening block, press **Ctrl+Space** anywhere within the brackets:

```html
{{#if condition|}}  <!-- Press Ctrl+Space here -->
```

Shows completion: "Add closing {{/if}}"

#### Secondary Method: Space-Triggered Completion
After typing a block name with space:

```html
{{#if   <!-- Press Ctrl+Space after space -->
```

Shows full block structure completion.

#### Discovery Mode
Type `{{#` and press Ctrl+Space to see all available block types.

### Supported Blocks
- `{{#if}}` → `{{/if}}`
- `{{#unless}}` → `{{/unless}}`
- `{{#each}}` → `{{/each}}`
- `{{#with}}` → `{{/with}}`
- Custom blocks (configurable)

### Configuration
```json
{
  "meteorLanguageServer.blockConditions": {
    "autoInsertEndTags": true,  // Enable/disable globally
    "extend": [
      {
        "type": "customBlock",
        "label": "Custom Block",
        "autoInsertEndTag": true  // Per-block control
      }
    ]
  }
}
```

### Smart Behavior
- Only offers completion for blocks missing closing tags
- Works correctly with nested blocks
- Includes snippet navigation with Tab between placeholders
- No completion when end tag already exists on same line

## 📋 Block Condition Hints

Visual inline hints that show the condition for closing block tags.

### Visual Examples

```html
{{#if userIsActive}}
  <p>User is active</p>
{{else}}         <!-- NOT userIsActive (hint appears) -->
  <p>User is inactive</p>
{{/if}}          <!-- END if userIsActive (hint appears) -->

{{#each item in items}}
  <div>{{item.name}}</div>
{{/each}}        <!-- END each item in items (hint appears) -->

{{#unless loading}}
  <p>Content loaded</p>
{{/unless}}      <!-- END unless loading (hint appears) -->
```

### Hint Display Rules
- ✅ **Shows hints** when no existing comment on the closing tag
- ❌ **No hints** when comment already exists: `{{/if}} <!-- custom comment -->`
- ✅ **Context-aware** shows appropriate condition text
- ✅ **Styled** with configurable colors and fonts

### Configuration
```json
{
  "meteorLanguageServer.blockConditions": {
    "enabled": true,
    "color": "#727272",
    "fontStyle": "italic",
    "margin": "0 0 0 0.75em"
  }
}
```

## 🔍 Cross-file Intelligence

Analyzes neighboring files in the same directory for comprehensive language support:

### File Analysis
- **JavaScript/TypeScript files**: Parses `Template.templateName.helpers()` definitions
- **CSS/LESS files**: Extracts class definitions for auto-completion
- **Directory-scoped**: Only includes files from the same directory as the template

### Helper Analysis
Supports both JavaScript and TypeScript with complex parsing:

```typescript
// Advanced TypeScript parsing
Template.myTemplate.helpers({
  complexHelper: (): HelperResult => {
    const data = { nested: { braces: "work fine" } };
    return processData(data);
  },

  simpleHelper() {
    return "Simple helper";
  }
});
```

### Benefits
- **Hover Information**: Shows helper definitions, file locations, and JSDoc
- **Go-to-Definition**: Navigate from helper usage to definition
- **Real-time Updates**: Automatically detects file changes
- **Type Safety**: Better support for TypeScript projects

## 🚨 Block Validation

Intelligent validation that detects missing or mismatched Blaze block end tags:

### Validation Features
- Detects missing closing tags (`{{#if}}` without `{{/if}}`)
- Identifies mismatched block types
- Shows clear error messages with context
- Highlights problematic blocks

### Error Examples
```html
{{#if condition}}
  <p>Content</p>
<!-- Missing {{/if}} - shows validation error -->

{{#each items}}
  <div>{{this}}</div>
{{/if}}  <!-- Mismatch: /if should be /each - shows error -->
```

### Configuration
```json
{
  "meteorLanguageServer.maxNumberOfProblems": 100,
  "meteorLanguageServer.blockConditions": {
    "extend": [
      {
        "type": "customBlock",
        "requiresEndTag": true  // Enable validation for custom blocks
      }
    ]
  }
}
```

## 🛠️ Advanced Configuration

### Custom Block Types
Extend the extension with custom block helpers:

```json
{
  "meteorLanguageServer.blockConditions": {
    "extend": [
      {
        "type": "customHelper",
        "label": "Custom Helper Block",
        "requiresEndTag": true,      // Validation
        "autoInsertEndTag": true     // Auto-insertion
      }
    ]
  }
}
```

### Custom Blaze Helpers
Add custom helpers for completion and hover:

```json
{
  "meteorLanguageServer.blazeHelpers": {
    "extend": [
      {
        "name": "#myCustomHelper",
        "doc": "Custom helper with documentation"
      },
      {
        "name": "utilityFunction",
        "doc": "Utility function for templates"
      }
    ]
  }
}
```

## 📊 Performance & Optimization

### Performance Features
- **Lazy Loading**: Features activate only when needed
- **Incremental Parsing**: Analyzes changes incrementally
- **Directory Scoping**: Limits analysis to relevant files
- **Caching**: Caches parsed results for better performance

### Optimization Tips
1. **Limit Problem Count**: Reduce `maxNumberOfProblems` for large projects
2. **Disable Tracing**: Set `trace.server` to `"off"` in production
3. **Organize Files**: Keep template-related files in the same directory
4. **Clean Imports**: Remove unused template imports for better completion filtering

## 🧪 Testing Features

To test all features are working correctly:

### 1. Template Detection Test
- Open a Meteor project (with `.meteor` directory)
- Verify activation message appears
- Open HTML file with `<template name="...">` tags

### 2. Auto-completion Test
```html
<template name="test">
  {{  <!-- Type and press Ctrl+Space - should show helpers -->
</template>
```

### 3. Block Hints Test
```html
{{#if someCondition}}
  <p>Content</p>
{{/if}}  <!-- Should show: END if someCondition -->
```

### 4. Auto-insert Test
```html
{{#if condition  <!-- Press Ctrl+Space - should offer closing tag -->
```

### 5. Template Inclusion Test
```html
{{>   <!-- Press Ctrl+Space - should show imported templates only -->
```

## Related Documentation

- **[Setup & Configuration](../SETUP.md)** - Detailed configuration options
- **[Development Guide](../development/DEVELOPMENT.md)** - Contributing and development
- **[Main Documentation](../README.md)** - Complete documentation index