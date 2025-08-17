import fs from 'fs';
import path from 'path';

export type TemplateDataAnalysis = {
  types: Record<string, string[]>;          // TS type or interface name -> properties
  typePropertyTypes: Record<string, Record<string, string>>; // Type name -> property -> type string
  typedefs: Record<string, string[]>;       // JSDoc typedef name -> properties
  templateTypeMap: Record<string, string>;  // template name -> data type name
};

// Extract simple property keys from a type/interface body
const extractPropsFromBlock = (body: string): { names: string[]; types: Record<string, string> } => {
  const names: string[] = [];
  const types: Record<string, string> = {};
  // Capture key and following type up to comma or semicolon or newline
  const propRegex = /\b(\w+)\s*:\s*([^;\n,\r\}]+)[;\n,\r]?/g;
  let p;
  while ((p = propRegex.exec(body)) !== null) {
    const key = p[1];
    const typeStr = (p[2] || '').trim();
    if (!names.includes(key)) {
      names.push(key);
    }
    if (typeStr) {
      types[key] = typeStr;
    }
  }
  return { names, types };
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
          // Remove comments before parsing
          const cleanContent = tsconfigContent.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
          return JSON.parse(cleanContent);
        } catch (e) {
          console.error('Error parsing tsconfig.json:', e);
          return null;
        }
      }
      break;
    }
    currentDir = path.dirname(currentDir);
  }

  return null;
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

    // Types: type Name = { ... }
    const typeRegex = /type\s+(\w+)\s*=\s*\{([\s\S]*?)\};?/g;
    let match;
    while ((match = typeRegex.exec(content)) !== null) {
      const typeName = match[1];
      const body = match[2];
      const { names, types: propTypes } = extractPropsFromBlock(body);
      types[typeName] = names;
      typePropertyTypes[typeName] = propTypes;
    }

    // Interfaces: interface Name { ... }
    const ifaceRegex = /interface\s+(\w+)\s*\{([\s\S]*?)\}/g;
    let im;
    while ((im = ifaceRegex.exec(content)) !== null) {
      const name = im[1];
      const body = im[2];
      const { names, types: propTypes } = extractPropsFromBlock(body);
      types[name] = names;
      typePropertyTypes[name] = propTypes;
    }

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

  return { types, typePropertyTypes, typedefs, templateTypeMap };
};
