# Template Inclusion Feature Demo

This document demonstrates the new template inclusion features added to the Meteor/Blaze Language Server.

## Features Added

### 1. Smart Template Inclusion Completion (`{{> templateName}}`)

When you type `{{>` followed by a space, the language server will **intelligently suggest only templates that are imported** in the associated JavaScript/TypeScript file for the current template.

#### How it Works:
- Finds the associated JS/TS file for the current template (e.g., `test.ts` for `test` template)
- Parses import statements to identify imported templates
- Only suggests templates that are actually imported and available
- Provides intelligent completion suggestions filtered by what you've already typed

#### Example:
```typescript
// In test.ts
import './nestedTemplate/nestedTemplate';
import './style.less';
import './template.html';
```

```html
<!-- In template.html -->
<template name="test">
  <div>
    {{> }} <!-- Will ONLY suggest "nestedTemplate" since it's imported -->
  </div>
</template>
```

#### Import Patterns Recognized:
- `import './templateName/templateName';` (standard Meteor pattern)
- `import './templateName';` (simplified imports)
- `import '../path/templateName/templateName';` (relative path imports)

### 2. Enhanced Template Inclusion Hover Information

When you hover over a template name in a `{{> templateName}}` expression, you'll see:
- **Import Status**: Whether the template is properly imported
- **Template Content Preview**: First 10 lines of the template HTML
- **File Location**: Relative path to the template file
- **Import Guidance**: Instructions if template is not imported

#### Example Hover Information:

**For Imported Templates:**
```
nestedTemplate - Imported Template
✅ Template imported in associated file
File: test-project/imports/ui/test/nestedTemplate/template.html
Template Content: [preview]
Usage: {{> nestedTemplate}}
```

**For Non-Imported Templates:**
```
someTemplate - Template Include
⚠️ Template not imported
The template 'someTemplate' is not imported in the associated JavaScript/TypeScript file.
To use this template, add an import statement like:
import './someTemplate/someTemplate';
```

### 3. Intelligent Template Discovery

The language server now:
- **Associates templates with their JS/TS files** based on naming conventions
- **Parses import statements** to understand template dependencies
- **Validates template availability** before suggesting completions
- **Provides contextual error messages** for missing imports

### 4. Benefits of Import-Based Completion

#### ✅ **Accurate Suggestions**
- Only shows templates that are actually available in the current context
- Prevents errors from referencing non-imported templates
- Matches the actual Meteor/Blaze import structure

#### ✅ **Better Development Experience**
- Reduces cognitive load by showing fewer, more relevant options
- Provides clear guidance on import requirements
- Follows Meteor best practices for template organization

#### ✅ **Error Prevention**
- Catches missing template imports early
- Provides actionable error messages
- Guides developers to proper import syntax

## Test Cases

The following templates are available in the test project:

1. **`test`** - Main test template in `test-project/imports/ui/test/template.html`
2. **`nestedTemplate`** - Nested template in `test-project/imports/ui/test/nestedTemplate/template.html`
3. **`mainLayout`** - Layout template in `test-project/imports/ui/mainLayout.html`

## Usage Examples

### Basic Template Inclusion
```html
<template name="parent">
  <div class="container">
    {{> nestedTemplate}}
  </div>
</template>
```

### Template Inclusion with Parameters
```html
<template name="parent">
  <div class="container">
    {{> nestedTemplate
        title="My Title"
        subtitle="My Subtitle"
        description="Template description"
    }}
  </div>
</template>
```

### Completion Workflow
1. Type `{{>` in your template
2. Press space to trigger completion
3. Select from the list of available templates
4. The template name will be inserted

### Hover Workflow
1. Hover over any template name after `{{>`
2. View detailed information about the template
3. See content preview and file location
4. Get usage guidance

## Implementation Details

The feature is implemented in:
- **Completion**: `src/server/connection/onCompletion.ts` - Handles `{{>` detection and template name suggestions
- **Hover**: `src/server/connection/onHover.ts` - Provides detailed template information on hover
- **Template Discovery**: Both files include workspace scanning logic to find available templates

The implementation is non-intrusive and only activates within Handlebars expressions in Meteor template files.
