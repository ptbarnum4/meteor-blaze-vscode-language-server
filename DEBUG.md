# Debugging Guide for Meteor Language Server

## Step 1: Test Extension Activation

1. **Open the extension project** in VS Code: `/Users/peterbarnum/Desktop/meteorLanguageServer`
2. **Press F5** to launch Extension Development Host
3. **Look for activation message**: You should see "Meteor Language Server activated!" popup

## Step 2: Check Language Server Connection

1. **In the Extension Development Host window** (the new window that opens after pressing F5):
   - Go to **View → Output**
   - In the dropdown next to the Output panel, select **"Meteor Language Server"**
   - Look for initialization messages like:
     ```
     Meteor Language Server initializing...
     Meteor Language Server capabilities configured
     ```

**Important**: The logs appear in the Extension Development Host window, NOT your main VS Code window!

## Step 3: Test with Template File

1. **Open** `test-project/test/template.html` in the Extension Development Host
2. **Check the Output panel** for log messages like:
   - "Meteor Language Server initializing..."
   - "Document contains templates: true"

## Step 4: Test Completion

1. **Inside a template block** (between `<template name="test">` and `</template>`):
2. **Type `{{`** and wait
3. **Check Output panel** for "Completion requested" message
4. **You should see**:
   - Built-in helpers: `each`, `if`, `unless`, etc.
   - Custom helpers: `testText`, `showTypeInfo`, etc.

## Step 5: Test Hover

1. **Hover over** `{{testText}}` in the template
2. **Check Output panel** for "Hover requested" message
3. **You should see**: Tooltip with helper information

## Troubleshooting

### If You Only See "We received a file change event":
This means the language server is running but not processing template files properly. Check:

1. **Recompile the extension**: Run `npm run compile` in terminal
2. **IMPORTANT: Force restart Extension Development Host**:
   - **Close the Extension Development Host window completely**
   - **Wait 2-3 seconds**
   - **Press F5 again** to launch a fresh instance
3. **Open an HTML file with templates**: Make sure the file contains `<template name="...">` tags
4. **Check the detailed logs**: You should now see additional debug messages like:
   ```
   [DEBUG] File change event received for: file:///...
   [DEBUG] Document language ID: html
   [DEBUG] Contains Meteor templates: true
   [DEBUG] Processing template file: ...
   ```
5. **If you still don't see these debug messages**: Try the "Nuclear Option" below

### Nuclear Option - Complete Reset:
If the Extension Development Host isn't picking up changes:
1. **Close all Extension Development Host windows**
2. **Stop any running tasks**: Look for "npm: watch:esbuild" and "npm: watch:tsc" in Terminal panel and stop them
3. **Restart your main VS Code completely**
4. **Reopen the extension project**
5. **Run `npm run compile` again**
6. **Press F5 for a completely fresh start**

### If Output Still Shows Only "We received a file change event":
The compiled code has the debug messages, but VS Code might be caching aggressively:

1. **Try the Developer Command**:
   - In Extension Development Host: `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
   - Type: "Developer: Restart Extension Host"
   - Hit Enter

2. **Check the exact file you're opening**:
   - Make sure you're opening files that actually contain `<template name="...">` tags
   - Try opening `test-project/simple.html` specifically

3. **Manual verification**:
   ```bash
   # Verify debug code is compiled
   grep "File change event received" dist/server.js

   # Should return a line with our debug message
   ```

4. **Last resort - Clean rebuild**:
   ```bash
   rm -rf dist/
   npm run compile
   ```

### If Extension Doesn't Activate:
- Check that HTML files have `.html` extension
- Restart VS Code Extension Development Host
- Check Developer Console (Help → Toggle Developer Tools)

### If No Completion/Hover:
- Verify file contains `<template name="...">` tags
- Check Output panel for language server logs
- Ensure TypeScript files are in same directory

### If Language Server Doesn't Start:
- Check that `dist/server.js` exists
- Verify no compilation errors
- Look for errors in VS Code Developer Tools

## Manual Testing Commands

```bash
# Build extension
npm run compile

# Test server file validity
node -c dist/server.js

# Launch Extension Development Host manually
code --extensionDevelopmentPath=. test-project/test/template.html
```

## Where to Find Language Server Logs

### Primary Location: Output Panel
1. **Press F5** to launch Extension Development Host
2. **In the Extension Development Host window** (new window):
   - Go to **View → Output**
   - Select **"Meteor Language Server"** from dropdown
   - This shows all language server debug messages

### Secondary Location: Developer Tools
1. **In the Extension Development Host window**:
   - Go to **Help → Toggle Developer Tools**
   - Check **Console tab** for errors and additional logs

**Note**: Logs appear in the Extension Development Host, not your main VS Code window!

## Expected Log Output

When working correctly, you should see:
```
Meteor Language Server initializing...
Meteor Language Server capabilities configured
Document URI: file:///path/to/template.html
Document contains templates: true
Completion requested
Hover requested
```
