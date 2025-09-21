# Block Condition Hints Fix Test

To test the block condition hints are working properly:

1. Open `test-project/imports/ui/test/template.html` in VS Code
2. Open `test-project/imports/ui/test/comment-test.html` for comment detection tests
3. Look for the following patterns and verify hints appear only when appropriate:

## Expected Results:

### For `{{/if}}` blocks:
```html
{{#if condition}}
  <p>Condition is true</p>
{{else}}         // NOT condition (hint appears)
  <p>Condition is false</p>
{{/if}}          // END if condition (hint appears)

{{#if condition}}
  <p>Condition is true</p>
{{/if}} <!-- custom comment --> (NO hint - comment exists)
```

### For `{{/each}}` blocks:
```html
{{#each box in boxes}}
  <div class="box">
    <span class="box-text">Box</span>
    <span class="box-number">{{pad}}</span>
  </div>
{{/each}}        // END each box in boxes (hint appears)

{{#each item in items}}
  <div>{{item}}</div>
{{/each}} <!-- loop comment --> (NO hint - comment exists)
```

### For `{{/unless}}` blocks:
```html
{{#unless someCondition}}
  <p>Content when condition is false</p>
{{else}}         // IS someCondition (hint appears)
  <p>Content when condition is true</p>
{{/unless}}      // END unless someCondition (hint appears)
```

## Bugs Fixed:

### 1. Original Bug - Comment Detection
The bug was in `decorationType.ts` where `isWithinComment(text, match.index)` was being used directly as a boolean. However, the `isWithinComment` function returns an object with an `isWithin` property, not a boolean. This caused all matches to be skipped since objects are always truthy.

**Fixed by changing:**
- `if (isWithinComment(text, match.index))` → `if (isWithinComment(text, match.index).isWithin)`
- `if (isWithinComment(text, elseMatch.index))` → `if (isWithinComment(text, elseMatch.index).isWithin)`

### 2. New Feature - Same Line Comment Detection
Added functionality to prevent displaying block condition hints when a comment already exists on the same line.

**Implementation:**
- Added `lineHasExistingComment()` helper function that detects HTML (`<!-- -->`) and Handlebars (`{{!-- --}}`, `{{! }}`) comments
- Added checks before adding decorations: `if (lineHasExistingComment(text, endPos)) { continue; }`
- Applied to both closing tag hints (`{{/if}}`, `{{/each}}`, etc.) and else tag hints (`{{else}}`)

**Supported comment types:**
- HTML comments: `<!-- comment -->`
- Handlebars block comments: `{{!-- comment --}}`
- Handlebars inline comments: `{{! comment }}`