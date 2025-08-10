## Testing Handlebars Expression Detection

The language server has been updated to only provide autocompletion and hover information within handlebars expressions (`{{}}` or `{{{}}}`).

### What Changed:

1. **Added `isWithinHandlebarsExpression()` function**: This function properly detects if the cursor is positioned within `{{}}` or `{{{}}}` expressions.

2. **Updated completion provider**: Now only triggers when cursor is inside handlebars expressions.

3. **Updated hover provider**: Now only shows helper information when hovering within handlebars expressions.

4. **Fixed TypeScript helper parsing**: Improved the `analyzeJavaScriptFile()` function to properly parse TypeScript files with nested braces in helper method bodies.

### Test Cases:

1. **simple.html** (with simple.js) - Should work ✅
   - `{{testHelper}}` - Should show autocompletion and hover

2. **test/template.html** (with test.ts) - Should now work ✅
   - `{{testText}}` - Should show autocompletion and hover
   - `{{getPropInfo}}` - Should show autocompletion and hover
   - `{{getDataInfo}}` - Should show autocompletion and hover

3. **Outside handlebars** - Should NOT trigger ❌
   - Regular HTML text
   - HTML attributes (except within `{{}}`)
   - CSS class names (except within `{{}}`)

### How to Test:

1. Press F5 to launch Extension Development Host
2. Open both `simple.html` and `test/template.html`
3. Test autocompletion by typing `{{` and see if helpers appear
4. Test hover by hovering over helper names within `{{}}`
5. Verify that autocompletion does NOT appear outside of `{{}}`
6. Check the Output panel → "Meteor Language Server" for debug logs

The language server should now work correctly for both JavaScript and TypeScript helper files, and only activate within proper handlebars expressions.
