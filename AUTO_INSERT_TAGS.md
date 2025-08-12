# Auto-Insert End Tags Feature

## Overview
The Meteor Blaze Language Server now supports automatic insertion of closing tags when typing opening Blaze block tags. This feature helps reduce errors and speeds up development by automatically completing block structures.

## Default Behavior
The extension provides intelligent auto-completion for missing Blaze block end tags:

### **Completion Within Opening Block** (Primary Method):
When you have an incomplete opening block like `{{#if condition}}` (missing closing tag), you can press **Ctrl+Space** anywhere within the opening brackets to see auto-completion options:

- Place cursor in `{{#if condition|}}` → Press Ctrl+Space → Shows "Add closing {{/if}}"
- Place cursor in `{{#unless |disabled}}` → Press Ctrl+Space → Shows "Add closing {{/unless}}"
- Place cursor in `{{#with user|Data}}` → Press Ctrl+Space → Shows "Add closing {{/with}}"
- Place cursor in `{{#each |items}}` → Press Ctrl+Space → Shows "Add closing {{/each}}"

**Note**: Auto-completion hints will **not** appear if the end condition is already present on the same line. For example:
- `{{#if condition}} content {{/if}}` → No completion hints (end tag on same line)
- `{{#if condition}}` → Shows completion hints (end tag missing)

### **Space-Triggered Completion** (Secondary Method):
When typing a new block, after adding a space following the block name, press Ctrl+Space to complete:

- `{{#if ` → Press Ctrl+Space → Shows completion for full block structure

### Discovery Mode
You can also type `{{#` and press Ctrl+Space to see all available block completions.

## Triggering Auto-Insertion
The auto-insertion feature works in three scenarios:

1. **Ctrl+Space Within Block** (Primary): Press **Ctrl+Space** anywhere within an incomplete opening block to see completion for missing end tag
2. **Ctrl+Space After Space** (Secondary): Type `{{#blockname ` (with space) and press **Ctrl+Space** to see full block structure completion
3. **Discovery Trigger**: Type `{{#` and press Ctrl+Space to see all available blocks

## Configuration

### Enable/Disable Auto-Insert
```json
{
  "meteorLanguageServer.blockConditions": {
    "autoInsertEndTags": true  // Default: true
  }
}
```

### Custom Block Types
You can configure custom block types to support auto-insertion:

```json
{
  "meteorLanguageServer.blockConditions": {
    "autoInsertEndTags": true,
    "extend": [
      {
        "type": "customBlock",
        "label": "Custom Block",
        "requiresEndTag": true,      // For validation
        "autoInsertEndTag": true     // For auto-insertion
      },
      {
        "type": "myHelper",
        "label": "My Helper Block",
        "requiresEndTag": true,
        "autoInsertEndTag": false    // Disable auto-insert for this block
      }
    ]
  }
}
```

## Configuration Options

### For Default Blocks
- **if, unless, with, each**: Auto-insertion is enabled by default
- Can be globally disabled with `autoInsertEndTags: false`

### For Custom Blocks
- `autoInsertEndTag`: Controls whether this specific custom block should have auto-insertion
- Defaults to `true` if not specified
- Independent of the `requiresEndTag` validation option

## Usage Examples

### **1. Complete Missing End Tags** (Primary Use Case):
   - You have: `{{#if someCondition}}`
   - Place cursor anywhere within the opening brackets: `{{#if some|Condition}}`
   - Press **Ctrl+Space**
   - Select "Add closing {{/if}}" from completion list
   - Result: Adds `\n\t$CURSOR\n{{/if}}` after the opening block

### **2. Full Block Creation**:
   - Type `{{#if ` (with space)
   - Press **Ctrl+Space**
   - Select completion option
   - Result: `{{#if condition}}\n\t$CURSOR\n{{/if}}`

### **3. Discovery Mode**:
   - Type `{{#`
   - Press Ctrl+Space to see all available block types
   - Select desired block type (e.g., "#if")

### **4. Smart Detection**:
   - Only offers completion for blocks that don't already have closing tags
   - Works with nested blocks correctly
   - Supports snippet navigation with Tab between placeholders

## Benefits
- **Faster Development**: Automatic closing tag insertion
- **Fewer Errors**: Reduces missing end tag mistakes
- **Customizable**: Works with custom block types
- **Intelligent**: Only activates within Handlebars expressions
- **Configurable**: Can be disabled globally or per custom block type

## Related Features
- **Block Validation**: Validates missing end tags (configured separately with `requiresEndTag`)
- **Block Condition Hints**: Shows inline hints for block conditions
- **Syntax Highlighting**: Enhanced highlighting for Blaze expressions
