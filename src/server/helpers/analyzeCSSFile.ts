import fs from 'fs';

export const analyzeCSSFile = (filePath: string): string[] => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const classes: string[] = [];

    // Extract CSS classes (.class-name {)
    const classMatches = content.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)\s*\{/g);
    for (const match of classMatches) {
      classes.push(match[1]);
    }

    // Extract LESS/SCSS nested classes (  .class-name {)
    const nestedMatches = content.matchAll(/\s+\.([a-zA-Z][a-zA-Z0-9_-]*)\s*\{/g);
    for (const match of nestedMatches) {
      if (!classes.includes(match[1])) {
        classes.push(match[1]);
      }
    }

    // Extract ID selectors as well (#id-name {)
    const idMatches = content.matchAll(/#([a-zA-Z][a-zA-Z0-9_-]*)\s*\{/g);
    for (const match of idMatches) {
      if (!classes.includes(match[1])) {
        classes.push(match[1]);
      }
    }

    return classes;
  } catch (error) {
    console.error(`Error analyzing CSS file ${filePath}:`, error);
    return [];
  }
};
