# How to Test Your Meteor Language Server Extension

You now have an enhanced language server extension (`meteor-blaze-vscode-language-server-0.0.1.vsix`) that supports both JavaScript and TypeScript Meteor templates, plus LESS styling. Here are the testing methods:

## Method 1: Install the Extension Globally

1. **Install the extension**:
   ```bash
   code --install-extension meteor-blaze-vscode-language-server-0.0.1.vsix
   ```

2. **Open any project** with HTML files containing Meteor templates

3. **Test the features**:
   - Open an HTML file with `<template name="...">` tags
   - Verify syntax highlighting and completion work

## Method 2: Test with the Included TypeScript Example

The extension now includes a sophisticated TypeScript example in `test-project/test/`:

1. **Open the test project**: Open `test-project/test/template.html` in VS Code
2. **Test completions**:
   - Type `{{` inside the template and see TypeScript helpers from `test.ts`
   - Type `class="` and see LESS classes from `style.less`
3. **Verify syntax highlighting**: Blaze syntax should be highlighted properly

## Method 3: Create Your Own Test Project

1. **Create a new test project**:
   ```bash
   mkdir ~/my-meteor-test
   cd ~/my-meteor-test
   code .
   ```

2. **Create test files**:

   **template.html**:
   ```html
   <template name="myTest">
     <div class="{{containerClass}}">
       <h1>{{title}}</h1>
       <p>{{description}}</p>
     </div>
   </template>
   ```

   **helpers.ts** (TypeScript):
   ```typescript
   import { Template } from 'meteor/templating';

   Template.myTest.helpers({
     title(): string {
       return 'TypeScript Template';
     },
     description(): string {
       return 'This helper is written in TypeScript!';
     },
     containerClass(): string {
       return 'test-container';
     }
   });
   ```

   **styles.less** (LESS):
   ```less
   .test-container {
     background: #f8f9fa;
     padding: 20px;

     h1 {
       color: #007acc;
     }
   }
   ```

## What to Test

### ✅ Enhanced Features:

1. **TypeScript Support**:
   - `.ts` files with `Template.name.helpers()` are analyzed
   - Typed helper functions are detected and suggested
   - Both arrow functions and regular methods work

2. **LESS Support**:
   - `.less` files are parsed for CSS classes
   - Nested selectors are detected
   - Both class names and IDs are available for completion

3. **Cross-file Intelligence**:
   - HTML templates get completions from neighboring `.ts` and `.js` files
   - CSS classes from `.css` and `.less` files are suggested
   - File association works with matching base names

4. **Template Detection**:
   - Only activates when `<template name="...">` tags are present
   - Regular HTML files remain unaffected

### 🧪 Test Scenarios:

#### TypeScript Template Test:
1. Open `test-project/test/template.html`
2. Inside the `<template name="test">` block:
   - Type `{{` and expect to see: `testText`, `showTypeInfo`, `getPropInfo`, etc.
   - Type `class="` and expect to see: `test-content`, `helper-text`, `typescript-indicator`

#### Mixed File Test:
Create files with the same base name but different extensions:
- `myComponent.html` (with templates)
- `myComponent.ts` (with helpers)
- `myComponent.less` (with styles)

Test that completions from both `.ts` and `.less` files appear in the HTML template.

#### Built-in Blaze Helpers:
Type `{{` and verify these built-ins appear:
- `each`, `if`, `unless`, `with`, `let`
- `@index`, `@key`, `@first`, `@last`

### 🐛 Debugging

If features don't work:

1. **Check Output Panel**: View → Output → "Meteor Language Server"
2. **Verify File Structure**: Ensure HTML, TS/JS, and CSS/LESS files have matching base names
3. **Restart Language Server**: Command Palette → "Restart Meteor Language Server"
4. **Check Template Detection**: Ensure HTML files contain `<template name="...">` tags

### 📁 Example Project Structure

```
my-meteor-project/
├── components/
│   ├── userProfile.html     ← Contains templates
│   ├── userProfile.ts       ← Contains helpers (detected)
│   └── userProfile.less     ← Contains styles (detected)
├── layouts/
│   ├── main.html
│   ├── main.js              ← Legacy JS support
│   └── main.css
└── pages/
    ├── home.html
    ├── home.ts              ← TypeScript helpers
    └── home.less            ← LESS styles
```

## Advanced Features

### Template-Specific Analysis:
The language server now looks for helpers specific to template names and provides contextual completions based on the current template context.

### Modern Meteor Development:
- Full TypeScript support for template helpers
- LESS/SCSS preprocessing support
- Typed template interfaces (when using `TemplateStaticTyped`)
- Cross-file dependency analysis

## Uninstalling

To remove the extension:
```bash
code --uninstall-extension meteor-blaze-vscode-language-server
```

Or through VS Code: Extensions → Installed → Find "Meteor/Blaze HTML Language Server" → Uninstall
