import fs from 'fs';
import path from 'path';
import * as ts from 'typescript';

export type TemplateDataAnalysis = {
  types: Record<string, string[]>;          // TS type or interface name -> properties
  typePropertyTypes: Record<string, Record<string, string>>; // Type name -> property -> type string
  typePropertyJsDocs: Record<string, Record<string, string>>; // Type name -> property -> JSDoc comment
  typedefs: Record<string, string[]>;       // JSDoc typedef name -> properties
  templateTypeMap: Record<string, string>;  // template name -> data type name
};

// Extract properties from types and interfaces in a TypeScript file
const extractTypesFromFile = (content: string): {
  types: Record<string, string[]>;
  typePropertyTypes: Record<string, Record<string, string>>;
  typePropertyJsDocs: Record<string, Record<string, string>>;
} => {
  const types: Record<string, string[]> = {};
  const typePropertyTypes: Record<string, Record<string, string>> = {};
  const typePropertyJsDocs: Record<string, Record<string, string>> = {};

  // Parse the entire file with TypeScript
  const sourceFile = ts.createSourceFile(
    'temp.ts',
    content,
    ts.ScriptTarget.Latest,
    true
  );

  // Helper to extract JSDoc comment
  function getJsDocComment(node: ts.Node): string | undefined {
    const jsDocComments = ts.getJSDocCommentsAndTags(node);

    // Try to get the main JSDoc comment
    for (const comment of jsDocComments) {
      if (ts.isJSDoc(comment) && comment.comment) {
        if (typeof comment.comment === 'string') {
          return comment.comment;
        } else if (Array.isArray(comment.comment)) {
          return comment.comment.map(c => c.text).join('');
        }
      }
    }

    return undefined;
  }

  // Visit each node in the AST
  function visit(node: ts.Node) {
    // Handle type aliases: type Name = { ... }
    if (ts.isTypeAliasDeclaration(node) && node.name) {
      const typeName = node.name.text;

      // Check if the type is an object type literal
      if (ts.isTypeLiteralNode(node.type)) {
        const names: string[] = [];
        const propTypes: Record<string, string> = {};
        const propJsDocs: Record<string, string> = {};

        node.type.members.forEach(member => {
          if (ts.isPropertySignature(member) && member.name) {
            const propName = member.name.getText(sourceFile);
            const propType = member.type ? member.type.getText(sourceFile) : 'any';
            const jsDoc = getJsDocComment(member);

            if (!names.includes(propName)) {
              names.push(propName);
            }
            propTypes[propName] = propType;
            if (jsDoc) {
              propJsDocs[propName] = jsDoc;
            }
          }
        });

        types[typeName] = names;
        typePropertyTypes[typeName] = propTypes;
        typePropertyJsDocs[typeName] = propJsDocs;
      }
    }

    // Handle interfaces: interface Name { ... }
    if (ts.isInterfaceDeclaration(node) && node.name) {
      const interfaceName = node.name.text;
      const names: string[] = [];
      const propTypes: Record<string, string> = {};
      const propJsDocs: Record<string, string> = {};

      node.members.forEach(member => {
        if (ts.isPropertySignature(member) && member.name) {
          const propName = member.name.getText(sourceFile);
          const propType = member.type ? member.type.getText(sourceFile) : 'any';
          const jsDoc = getJsDocComment(member);

          if (!names.includes(propName)) {
            names.push(propName);
          }
          propTypes[propName] = propType;
          if (jsDoc) {
            propJsDocs[propName] = jsDoc;
          }
        }
      });

      types[interfaceName] = names;
      typePropertyTypes[interfaceName] = propTypes;
      typePropertyJsDocs[interfaceName] = propJsDocs;
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return { types, typePropertyTypes, typePropertyJsDocs };
};

// Extract JSDoc typedefs
const extractTypedefs = (content: string): Record<string, string[]> => {
  const out: Record<string, string[]> = {};
  const typedefBlockRegex = /\/\*\*[\s\S]*?@typedef\s+\{Object\}\s+(\w+)[\s\S]*?\*\//g;
  let m;
  while ((m = typedefBlockRegex.exec(content)) !== null) {
    const name = m[1];
    const block = m[0];
    const props: string[] = [];
    const propRegex = /@property\s+\{[^}]+\}\s+(\w+)/g;
    let p;
    while ((p = propRegex.exec(block)) !== null) {
      if (!props.includes(p[1])) {
        props.push(p[1]);
      }
    }
    out[name] = props;
  }
  return out;
};

// Extract TemplateStaticTyped<'name', TypeName, ...>
const extractTemplateStaticTyped = (content: string): Record<string, string> => {
  const map: Record<string, string> = {};
  const regex = /TemplateStaticTyped\s*<\s*['\"]([^'\"]+)['\"]\s*,\s*([A-Za-z_][A-Za-z0-9_]*)/g;
  let m;
  while ((m = regex.exec(content)) !== null) {
    const templateName = m[1];
    const typeName = m[2];
    map[templateName] = typeName;
  }
  return map;
};

// Helper function to find tsconfig.json for TypeScript path resolution
function findTsConfigForTemplateData(startPath: string): any {
  let currentDir = startPath;

  while (currentDir !== path.dirname(currentDir)) {
    if (fs.existsSync(path.join(currentDir, '.meteor'))) {
      const tsconfigPath = path.join(currentDir, 'tsconfig.json');

      if (fs.existsSync(tsconfigPath)) {
        try {
          const tsconfigContent = fs.readFileSync(tsconfigPath, 'utf8');

          // Try multiple parsing strategies
          // Strategy 1: Parse as-is (valid JSON without comments)
          try {
            return JSON.parse(tsconfigContent);
          } catch {
            // Strategy 2: Remove comments and try again
            try {
              const cleanContent = safelyRemoveJsonComments(tsconfigContent);
              return JSON.parse(cleanContent);
            } catch {
              // Strategy 3: Remove comments AND trailing commas
              try {
                let cleaned = safelyRemoveJsonComments(tsconfigContent);
                cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
                return JSON.parse(cleaned);
              } catch {
                // Silently fail - tsconfig is not critical
                return null;
              }
            }
          }
        } catch {
          return null;
        }
      }
      break;
    }
    currentDir = path.dirname(currentDir);
  }

  return null;
}

// Safely remove comments from JSON content
function safelyRemoveJsonComments(content: string): string {
  const result: string[] = [];
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escapeNext = false;
  let i = 0;

  while (i < content.length) {
    const char = content[i];
    const nextChar = i + 1 < content.length ? content[i + 1] : '';

    // Handle block comments (not inside strings)
    if (!inString && inBlockComment) {
      if (char === '*' && nextChar === '/') {
        inBlockComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }

    // Handle line comments (not inside strings)
    if (!inString && inLineComment) {
      if (char === '\n') {
        inLineComment = false;
        result.push(char);
      }
      i++;
      continue;
    }

    // Handle escape sequences in strings
    if (inString && escapeNext) {
      result.push(char);
      escapeNext = false;
      i++;
      continue;
    }

    // Check for escape character in strings
    if (inString && char === '\\') {
      result.push(char);
      escapeNext = true;
      i++;
      continue;
    }

    // Handle string delimiters
    if (char === '"') {
      inString = !inString;
      result.push(char);
      i++;
      continue;
    }

    // Look for comment starts only outside strings
    if (!inString) {
      if (char === '/' && nextChar === '/') {
        inLineComment = true;
        i += 2;
        continue;
      } else if (char === '/' && nextChar === '*') {
        inBlockComment = true;
        i += 2;
        continue;
      }
    }

    result.push(char);
    i++;
  }

  return result.join('');
}

// TypeScript path resolution function for template data analysis
function resolveTsPathForTemplateData(importPath: string, tsconfig: any, projectRoot: string): string | null {
  if (!tsconfig?.compilerOptions?.paths) {
    return null;
  }

  const { baseUrl = '.', paths } = tsconfig.compilerOptions;
  const basePath = path.resolve(projectRoot, baseUrl);

  // Try to match the import path against tsconfig paths
  for (const [pattern, mappings] of Object.entries(paths) as [string, string[]][]) {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\*/g, '([^/]*)')  // Replace * with capture group
      .replace(/\//g, '\\/');     // Escape forward slashes

    const regex = new RegExp(`^${regexPattern}$`);
    const match = importPath.match(regex);

    if (match) {
      // Try each mapping
      for (const mapping of mappings) {
        let resolvedPath = mapping;

        // Replace captured groups in mapping
        for (let i = 1; i < match.length; i++) {
          resolvedPath = resolvedPath.replace('*', match[i]);
        }

        const fullPath = path.resolve(basePath, resolvedPath);
        return fullPath;
      }
    }
  }

  return null;
}

// Resolve imports including both relative and absolute paths
const findImportedFiles = (content: string, filePath: string): string[] => {
  const dir = path.dirname(filePath);
  const files: string[] = [];

  // Updated regex to handle both relative (./**, ../**) and absolute (/***) imports
  const importRegex = /import\s+(?:type\s+)?\{[^}]*\}\s+from\s+['\"]((?:\.\.?\/|\/).*?)['\"]/g;
  let m;

  while ((m = importRegex.exec(content)) !== null) {
    const importPath = m[1];
    let candidates: string[] = [];

    if (importPath.startsWith('/')) {
      // Absolute import - find project root and try TypeScript path resolution
      let currentDir = dir;
      let projectRoot = currentDir;

      while (currentDir !== path.dirname(currentDir)) {
        if (fs.existsSync(path.join(currentDir, '.meteor')) ||
            fs.existsSync(path.join(currentDir, 'package.json'))) {
          projectRoot = currentDir;
          break;
        }
        currentDir = path.dirname(currentDir);
      }

      // Try TypeScript path resolution first
      const tsconfig = findTsConfigForTemplateData(dir);
      let fullImportPath;

      if (tsconfig) {
        const tsResolvedPath = resolveTsPathForTemplateData(importPath, tsconfig, projectRoot);
        if (tsResolvedPath) {
          fullImportPath = tsResolvedPath;
        } else {
          // Fallback to simple resolution
          fullImportPath = path.join(projectRoot, importPath.substring(1)); // Remove leading /
        }
      } else {
        // No tsconfig, use simple resolution
        fullImportPath = path.join(projectRoot, importPath.substring(1)); // Remove leading /
      }

      candidates = [
        fullImportPath + '.ts',
        fullImportPath + '.d.ts',
        fullImportPath + '.js',
        fullImportPath
      ];
    } else {
      // Relative import
      candidates = [
        path.resolve(dir, importPath + '.ts'),
        path.resolve(dir, importPath + '.d.ts'),
        path.resolve(dir, importPath + '.js'),
        path.resolve(dir, importPath)
      ];
    }

    for (const c of candidates) {
      try {
        const stat = fs.statSync(c);
        if (stat.isFile()) {
          files.push(c);
          break;
        }
      } catch {
        // skip
      }
    }
  }
  return files;
};

export const analyzeTemplateData = (entryFilePath: string): TemplateDataAnalysis => {
  const visited = new Set<string>();
  const types: Record<string, string[]> = {};
  const typePropertyTypes: Record<string, Record<string, string>> = {};
  const typePropertyJsDocs: Record<string, Record<string, string>> = {};
  const typedefs: Record<string, string[]> = {};
  const templateTypeMap: Record<string, string> = {};

  const queue: string[] = [entryFilePath];
  while (queue.length) {
    const filePath = queue.shift()!;
    if (visited.has(filePath)) {
      continue;
    }
    visited.add(filePath);
    let content = '';
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    // Extract types and interfaces from the entire file using TypeScript AST
    const extracted = extractTypesFromFile(content);
    Object.assign(types, extracted.types);
    Object.assign(typePropertyTypes, extracted.typePropertyTypes);
    Object.assign(typePropertyJsDocs, extracted.typePropertyJsDocs);

    // JSDoc typedefs
    const td = extractTypedefs(content);
    Object.assign(typedefs, td);

    // TemplateStaticTyped mappings
    const tmap = extractTemplateStaticTyped(content);
    Object.assign(templateTypeMap, tmap);

    // Follow imports (one level recursive breadth-first)
    const imported = findImportedFiles(content, filePath);
    for (const f of imported) {
      if (!visited.has(f)) {
        queue.push(f);
      }
    }
  }

  return { types, typePropertyTypes, typePropertyJsDocs, typedefs, templateTypeMap };
};
