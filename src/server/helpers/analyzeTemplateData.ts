import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { TsConfig } from '../../types';
import { safeParse } from './strings.js';

export type TemplateDataAnalysis = {
  types: Record<string, string[]>; // TS type or interface name -> properties
  typePropertyTypes: Record<string, Record<string, string>>; // Type name -> property -> type string
  typePropertyJsDocs: Record<string, Record<string, string>>; // Type name -> property -> JSDoc comment
  typedefs: Record<string, string[]>; // JSDoc typedef name -> properties
  templateTypeMap: Record<string, string>; // template name -> data type name
  templateInstanceTypeMap: Record<string, string>; // template name -> instance type name (T parameter)
};

// Extract properties from types and interfaces in a TypeScript file
const extractTypesFromFile = (
  content: string
): {
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
          return comment.comment.map((c) => c.text).join('');
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

        node.type.members.forEach((member) => {
          if (ts.isPropertySignature(member) && member.name) {
            const propName = member.name.getText(sourceFile);
            const propType = member.type
              ? member.type.getText(sourceFile)
              : 'any';
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

      node.members.forEach((member) => {
        if (ts.isPropertySignature(member) && member.name) {
          const propName = member.name.getText(sourceFile);
          const propType = member.type
            ? member.type.getText(sourceFile)
            : 'any';
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
  const typedefBlockRegex =
    /\/\*\*[\s\S]*?@typedef\s+\{Object\}\s+(\w+)[\s\S]*?\*\//g;
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

// Extract TemplateStaticTyped<'name', DataType, InstanceType>
// Also extracts properties from inline object types in the third parameter
const extractTemplateStaticTyped = (
  content: string,
  types: Record<string, string[]>
): {
  templateTypeMap: Record<string, string>;
  templateInstanceTypeMap: Record<string, string>;
} => {
  const templateTypeMap: Record<string, string> = {};
  const templateInstanceTypeMap: Record<string, string> = {};

  // Match TemplateStaticTyped with 2 or 3 type parameters
  // Handles:
  // - TemplateStaticTyped<'name', DataType>
  // - TemplateStaticTyped<'name', DataType, InstanceType> (named type)
  // - TemplateStaticTyped<'name', DataType, { props: ... }> (inline object type)
  const regex =
    /TemplateStaticTyped\s*<\s*['\"]([^'\"]+)['\"]\s*,\s*([A-Za-z_][\w.]*(?:\s*\|\s*[A-Za-z_][\w.]*)*)\s*(?:,\s*(.+?))?\s*>/gs;
  let m;
  while ((m = regex.exec(content)) !== null) {
    const templateName = m[1];
    const dataTypeName = m[2];
    const instanceTypeParam = m[3]?.trim(); // May be undefined if only 2 params

    // console.log(
    //   `[analyzeTemplateData] Found TemplateStaticTyped for ${templateName}:`,
    //   {
    //     dataTypeName,
    //     instanceTypeParam: instanceTypeParam?.substring(0, 100),
    //   }
    // );

    templateTypeMap[templateName] = dataTypeName;

    if (instanceTypeParam) {
      // Check if it's an inline object type (starts with '{')
      if (instanceTypeParam.startsWith('{')) {
        // console.log(
        //   `[analyzeTemplateData] ${templateName} has inline object type`
        // );
        // Extract properties from inline object type
        // Create a synthetic type name for this inline type
        const syntheticTypeName = `__${templateName}_InstanceType__`;

        // Find the complete object literal by matching braces
        let braceCount = 0;
        let inlineTypeEnd = 0;
        for (let i = 0; i < instanceTypeParam.length; i++) {
          const char = instanceTypeParam[i];
          if (char === '{') {
            braceCount++;
          } else if (char === '}') {
            braceCount--;
            if (braceCount === 0) {
              inlineTypeEnd = i + 1;
              break;
            }
          }
        }

        const inlineTypeBody = instanceTypeParam.substring(
          1,
          inlineTypeEnd - 1
        );
        // console.log(
        //   `[analyzeTemplateData] Inline type body for ${templateName}:`,
        //   inlineTypeBody
        // );

        // Extract property names and their types from the inline object type
        const propNames: string[] = [];
        // Updated regex to capture both property name and type
        const propRegex =
          /^\s*(?:\/\*\*[\s\S]*?\*\/\s*)?([a-zA-Z_$][\w$]*)\s*[?:]\s*([A-Za-z_][\w.]*)/gm;
        let propMatch;
        while ((propMatch = propRegex.exec(inlineTypeBody)) !== null) {
          const propName = propMatch[1];
          const propTypeName = propMatch[2];

          // Check if this property is named 'props' and its type exists in our types map
          if (propName === 'props' && types[propTypeName]) {
            // Use the properties of the referenced type instead
            const referencedProps = types[propTypeName];
            // console.log(
            //   `[analyzeTemplateData] Found 'props' property with type ${propTypeName}, which has ${referencedProps.length} properties:`,
            //   referencedProps
            // );
            propNames.push(...referencedProps);
          } else if (!propNames.includes(propName)) {
            // Regular property
            propNames.push(propName);
          }
        }

        // console.log(
        //   `[analyzeTemplateData] Extracted ${propNames.length} props from inline type:`,
        //   propNames
        // );

        // Store the inline type properties
        types[syntheticTypeName] = propNames;
        templateInstanceTypeMap[templateName] = syntheticTypeName;
      } else {
        // It's a named type reference
        templateInstanceTypeMap[templateName] = instanceTypeParam;
      }
    }
  }

  return { templateTypeMap, templateInstanceTypeMap };
};

// Helper function to find tsconfig.json for TypeScript path resolution
function findTsConfigForTemplateData(startPath: string): TsConfig | null {
  let currentDir = startPath;

  while (currentDir !== path.dirname(currentDir)) {
    if (!fs.existsSync(path.join(currentDir, '.meteor'))) {
      currentDir = path.dirname(currentDir);
    }
    const tsconfigPath = path.join(currentDir, 'tsconfig.json');

    if (!fs.existsSync(tsconfigPath)) {
      break;
    }

    try {
      const tsconfigContent = fs.readFileSync(tsconfigPath, 'utf8');

      // Try multiple parsing strategies
      // Strategy 1: Parse as-is (valid JSON without comments)
      const tsconfig = safeParse<TsConfig>(tsconfigContent);
      if (tsconfig) {
        return tsconfig;
      }

      // Strategy 2: Remove comments and try again
      const commentsRemoved = safelyRemoveJsonComments(tsconfigContent);
      const cleanContent = safeParse<TsConfig>(commentsRemoved);

      if (cleanContent) {
        return cleanContent;
      }

      // Strategy 3: Remove comments AND trailing commas
      const withoutTrailingCommas = safeParse<TsConfig>(
        commentsRemoved?.replace(/,(\s*[}\]])/g, '$1')
      );

      return withoutTrailingCommas || null;
    } catch {
      return null;
    }
  }

  return null;
}

// Safely remove comments from JSON content
function safelyRemoveJsonComments(content: string): string {
  if (!content) {
    return '';
  }
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
function resolveTsPathForTemplateData(
  importPath: string,
  tsconfig: TsConfig,
  projectRoot: string
): string | null {
  if (!tsconfig?.compilerOptions?.paths) {
    return null;
  }

  const { baseUrl = '.', paths } = tsconfig.compilerOptions;
  const basePath = path.resolve(projectRoot, baseUrl);

  // Try to match the import path against tsconfig paths
  for (const [pattern, mappings] of Object.entries(paths) as [
    string,
    string[],
  ][]) {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\*/g, '([^/]*)') // Replace * with capture group
      .replace(/\//g, '\\/'); // Escape forward slashes

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
  const importRegex =
    /import\s+(?:type\s+)?\{[^}]*\}\s+from\s+['\"]((?:\.\.?\/|\/).*?)['\"]/g;
  let m;

  while ((m = importRegex.exec(content)) !== null) {
    const importPath = m[1];
    let candidates: string[] = [];

    if (importPath.startsWith('/')) {
      // Absolute import - find project root and try TypeScript path resolution
      let currentDir = dir;
      let projectRoot = currentDir;

      while (currentDir !== path.dirname(currentDir)) {
        if (
          fs.existsSync(path.join(currentDir, '.meteor')) ||
          fs.existsSync(path.join(currentDir, 'package.json'))
        ) {
          projectRoot = currentDir;
          break;
        }
        currentDir = path.dirname(currentDir);
      }

      // Try TypeScript path resolution first
      const tsconfig = findTsConfigForTemplateData(dir);
      let fullImportPath;

      if (tsconfig) {
        const tsResolvedPath = resolveTsPathForTemplateData(
          importPath,
          tsconfig,
          projectRoot
        );
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
        fullImportPath,
      ];
    } else {
      // Relative import
      candidates = [
        path.resolve(dir, importPath + '.ts'),
        path.resolve(dir, importPath + '.d.ts'),
        path.resolve(dir, importPath + '.js'),
        path.resolve(dir, importPath),
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

export const analyzeTemplateData = (
  entryFilePath: string
): TemplateDataAnalysis => {
  const visited = new Set<string>();
  const types: Record<string, string[]> = {};
  const typePropertyTypes: Record<string, Record<string, string>> = {};
  const typePropertyJsDocs: Record<string, Record<string, string>> = {};
  const typedefs: Record<string, string[]> = {};
  const templateTypeMap: Record<string, string> = {};
  const templateInstanceTypeMap: Record<string, string> = {};

  // Store file contents for second pass
  const fileContents: Map<string, string> = new Map();

  // FIRST PASS: Collect all files and extract ALL types
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

    // Store content for second pass
    fileContents.set(filePath, content);

    // Extract types and interfaces from the entire file using TypeScript AST
    const extracted = extractTypesFromFile(content);
    Object.assign(types, extracted.types);
    Object.assign(typePropertyTypes, extracted.typePropertyTypes);
    Object.assign(typePropertyJsDocs, extracted.typePropertyJsDocs);

    // JSDoc typedefs
    const td = extractTypedefs(content);
    Object.assign(typedefs, td);

    // Follow imports (one level recursive breadth-first)
    const imported = findImportedFiles(content, filePath);
    for (const f of imported) {
      if (!visited.has(f)) {
        queue.push(f);
      }
    }
  }

  // SECOND PASS: Now that we have ALL types, extract TemplateStaticTyped with type resolution
  for (const [_filePath, content] of fileContents.entries()) {
    const tmaps = extractTemplateStaticTyped(content, types);
    Object.assign(templateTypeMap, tmaps.templateTypeMap);
    Object.assign(templateInstanceTypeMap, tmaps.templateInstanceTypeMap);
  }

  return {
    types,
    typePropertyTypes,
    typePropertyJsDocs,
    typedefs,
    templateTypeMap,
    templateInstanceTypeMap,
  };
};
