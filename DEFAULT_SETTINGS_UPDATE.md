# Default Settings Update

The extension now uses these default settings if not specified by the workspace or user:

## Block Condition Hints

### Updated Defaults:
- **Color**: `#727272` (previously `editorCodeLens.foreground`)
- **Font Style**: `italic` (unchanged)
- **Margin**: `0 0 0 0.75em` (previously `0 0 0 1em`)

These settings are applied when:
- No workspace settings exist for `meteorLanguageServer.blockConditions`
- No user settings exist for these properties
- The extension is used in a fresh installation

## Custom Theme Colors

The extension now also contributes custom theme colors that can be referenced:

### Available Custom Colors:
- `blazeBlockHash.defaultColor` - `#808080`
- `blazeBlockName.defaultColor` - `#f177ff`
- `blazeBlockArgs.defaultColor` - `#fffec4`
- `blazeBlockFirstArg.defaultColor` - `#ffd16f`
- `blazeBlockSingleArg.defaultColor` - `#ffd16f`
- `blazeExpression.defaultColor` - `#ffd16f`
- `blazeBlockIn.defaultColor` - `#00ffa2`
- `delimiter.defaultColor` - `#808080`

### Usage:
Users can reference these colors in their `editor.semanticTokenColorCustomizations`:

```jsonc
{
  "editor.semanticTokenColorCustomizations": {
    "rules": {
      "blazeBlockHash": { "foreground": "blazeBlockHash.defaultColor", "fontStyle": "bold" },
      "blazeBlockName": { "foreground": "blazeBlockName.defaultColor", "fontStyle": "italic bold" }
      // ... etc
    }
  }
}
```

## Changes Made:

### 1. package.json
- Updated `meteorLanguageServer.blockConditions.color` default from `"editorCodeLens.foreground"` to `"#727272"`
- Updated `meteorLanguageServer.blockConditions.margin` default from `"0 0 0 1em"` to `"0 0 0 0.75em"`
- Added `colors` contribution point with custom theme colors

### 2. decorationType.ts
- Updated `createBlockConditionDecorationType()` function defaults to match package.json defaults
- Changed color default from `'editorCodeLens.foreground'` to `'#727272'`
- Changed margin default from `'0 0 0 1em'` to `'0 0 0 0.75em'`

## Result:
- Fresh installations will use the specified default colors and spacing
- Existing users with custom settings are unaffected
- Users can now reference the new custom theme colors for consistency