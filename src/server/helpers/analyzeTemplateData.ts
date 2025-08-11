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

// Resolve simple local imports of types/interfaces
const findImportedFiles = (content: string, filePath: string): string[] => {
  const dir = path.dirname(filePath);
  const files: string[] = [];
  const importRegex = /import\s+(?:type\s+)?\{[^}]*\}\s+from\s+['\"](\.\.?\/[^'\"]+)['\"]/g;
  let m;
  while ((m = importRegex.exec(content)) !== null) {
    const rel = m[1];
    const candidates = [
      path.resolve(dir, rel + '.ts'),
      path.resolve(dir, rel + '.d.ts'),
      path.resolve(dir, rel + '.js'),
      path.resolve(dir, rel)
    ];
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
