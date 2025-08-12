## Meteor Project Detection Test

This project contains a `.meteor` directory, so the Meteor/Blaze Language Server extension should activate.

### Test Instructions:

1. Open this folder in VS Code
2. The extension should automatically activate and show the message: "Meteor/Blaze HTML Language Server activated for Meteor project!"
3. Open a `.html` or `.hbs` file and you should see:
   - Syntax highlighting for Blaze expressions
   - Code completion for Blaze helpers
   - Block condition hints
   - Else block hints

### Test Files:
- `imports/ui/mainLayout.html` - Contains Blaze templates for testing

### Non-Meteor Project Test:
To test that the extension doesn't activate in non-Meteor projects:
1. Create a new folder without a `.meteor` directory
2. Open it in VS Code
3. The extension should NOT activate
4. No Meteor/Blaze features should be available
