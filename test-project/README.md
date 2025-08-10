# Test Project for Meteor Language Server

This is a test Meteor project used to validate the functionality of the Meteor Language Server VS Code extension.

## 🚀 Quick Start

```bash
# Install dependencies
meteor npm install

# Start development server
npm run dev
# or
meteor

# Type checking
npm run type-check
```

## 📁 Structure

- `simple.html` + `simple.ts` - Basic template with TypeScript helpers
- `test/template.html` + `test.ts` - Advanced TypeScript features
- `test/nestedTemplate/` - Nested directory structure tests
- `styles.css` - CSS classes for autocompletion testing

## 🧪 Testing the Extension

1. Open this project in VS Code
2. Install the Meteor Language Server extension
3. Open any `.html` file containing `<template>` tags
4. Test the following features:

### Code Completion
- Type `{{` inside a template to see helper suggestions
- Type `class="` to see CSS class suggestions
- Type `{{#` to see built-in Blaze helpers

### Hover Information
- Hover over helper names to see definitions and file locations

### Go-to-Definition
- Ctrl/Cmd + Click on helper names to navigate to definitions

## 📝 Test Cases

### Simple Template (`simple.html`)
```html
<template name="simple">
  <div class="{{cssClass}}">
    <h1>{{title}}</h1>
    <p>{{content}}</p>
  </div>
</template>
```

### TypeScript Helpers (`simple.ts`)
```typescript
Template.simple.helpers({
  title: (): string => "Hello World",
  cssClass: (): string => "container",
  content: (): string => "This is a test template"
});
```

### Expected Behavior
- Autocompletion should show `title`, `cssClass`, `content` when typing `{{`
- Hover should show helper definitions and file info
- Go-to-definition should navigate to helper definitions
- CSS classes should autocomplete when typing `class="`

## 🔧 Development

This project uses:
- **Meteor 3.x** with TypeScript support
- **React** for UI components
- **@types/meteor** for TypeScript definitions

The project is configured to work seamlessly with the Meteor Language Server extension.
