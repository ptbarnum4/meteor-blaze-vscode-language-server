// Manual test script to verify template matching logic
const fs = require('fs');
const path = require('path');

// Simulate the analyzeJavaScriptFile function
function analyzeJavaScriptFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const helpers = [];
    let extractedTemplateName;

    // Find Template.name.helpers() calls with proper brace matching
    const templateHelperPattern = /Template\.(\w+)\.helpers\s*\(\s*\{/g;
    let match;

    while ((match = templateHelperPattern.exec(content)) !== null) {
      // Extract the template name from Template.templateName.helpers
      const templateNameFromCode = match[1];
      if (!extractedTemplateName) {
        extractedTemplateName = templateNameFromCode;
      }

      console.log(`Found Template.${templateNameFromCode}.helpers() in ${filePath}`);

      const startIndex = match.index + match[0].length - 1; // Start at the opening brace
      let braceCount = 1;
      let endIndex = startIndex + 1;

      // Find the matching closing brace
      while (endIndex < content.length && braceCount > 0) {
        if (content[endIndex] === '{') {
          braceCount++;
        } else if (content[endIndex] === '}') {
          braceCount--;
        }
        endIndex++;
      }

      if (braceCount === 0) {
        // Extract the content between braces
        const helpersContent = content.substring(startIndex + 1, endIndex - 1);

        // Extract helper function names
        const patterns = [
          /(\w+)\s*\([^)]*\)\s*\{/g,
          /(\w+)\s*:\s*function\s*\([^)]*\)\s*\{/g,
          /(\w+)\s*:\s*\([^)]*\)\s*=>\s*[\{\.]/g,
          /(\w+)\s*:\s*\w+\s*=>\s*[\{\.]/g
        ];

        patterns.forEach(pattern => {
          let helperMatch;
          while ((helperMatch = pattern.exec(helpersContent)) !== null) {
            if (!helpers.includes(helperMatch[1])) {
              helpers.push(helperMatch[1]);
            }
          }
        });
      }
    }

    console.log(`Extracted helpers: ${JSON.stringify(helpers)}`);
    console.log(`Extracted template name: ${extractedTemplateName}`);

    return { helpers, templateName: extractedTemplateName };
  } catch (error) {
    console.error(`Error analyzing file ${filePath}:`, error);
    return { helpers: [] };
  }
}

// Test the files
console.log('=== Testing simple.ts ===');
const simpleResult = analyzeJavaScriptFile('./test-project/simple.ts');

console.log('\n=== Testing test.ts ===');
const testResult = analyzeJavaScriptFile('./test-project/test/test.ts');

console.log('\n=== Summary ===');
console.log('simple.ts:', simpleResult);
console.log('test.ts:', testResult);
