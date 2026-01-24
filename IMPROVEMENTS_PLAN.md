# Improvements Plan

## Performance Improvements

### Critical Performance Issues

- [ ] **Cache `analyzeTemplateData` results** - This function is called repeatedly in `analyzeNeighboringFiles` for every file change and performs expensive TypeScript AST parsing. Consider caching results by file path + mtime.
  - Location: [analyzeNeighboringFiles.ts](src/server/helpers/analyzeNeighboringFiles.ts#L10)
  - Impact: High - called on every document change

- [ ] **Implement incremental parsing** - Currently re-parsing entire files on every change
  - Locations:
    - [onDidChangeContent.ts](src/server/connection/onDidChangeContent.ts)
    - [analyzeNeighboringFiles.ts](src/server/helpers/analyzeNeighboringFiles.ts)
  - Impact: High - affects responsiveness on large files

- [ ] **Optimize regex patterns** - Multiple complex regex patterns executed repeatedly in loops
  - Location: [analyzeJavaScriptFile.ts](src/server/helpers/analyzeJavaScriptFile.ts#L92-L95)
  - Impact: Medium - nested loops with regex execution

- [ ] **Debounce file analysis on document changes** - Rapid typing triggers multiple expensive analysis operations
  - Location: [onDidChangeContent.ts](src/server/connection/onDidChangeContent.ts)
  - Impact: Medium - reduces unnecessary work during editing

- [ ] **Lazy load global helpers** - `analyzeGlobalHelpers` scans entire workspace synchronously
  - Location: [onHover.ts](src/server/connection/onHover.ts#L320)
  - Impact: Medium - blocks hover requests

### File System Operations

- [ ] **Batch file reads** - Multiple `readFileSync` calls in tight loops
  - Locations:
    - [analyzeNeighboringFiles.ts](src/server/helpers/analyzeNeighboringFiles.ts)
    - [parseTemplateImports functions](src/server/connection/onCompletion.ts#L750)
  - Impact: Medium - I/O bound operations

- [ ] **Add file watcher for workspace files** - Currently re-scanning on demand
  - Impact: Medium - would improve response time

## Code Deduplication

### High Priority Duplications

#### 1. `findTsConfigForMeteorProject` function (4 identical copies)

**What it does**: Walks up directory tree to find `.meteor` directory, then locates and parses `tsconfig.json` with comment removal strategies.

**Locations**:

- [onHover.ts](src/server/connection/onHover.ts#L1368-L1416)
- [onCompletion.ts](src/server/connection/onCompletion.ts#L584-L632)
- [findTemplateDefinition.ts](src/server/connection/onDefinition/findTemplateDefinition.ts#L428-L476)
- [analyzeTemplateData.ts](src/server/helpers/analyzeTemplateData.ts#L154-L198)

**Suggested Helper**: `src/server/helpers/findTsConfig.ts`

```typescript
export function findTsConfig(startPath: string): TsConfig | null;
```

#### 2. `safelyRemoveJsonComments` function (4 identical copies)

**What it does**: Removes line comments (`//`) and block comments (`/* */`) from JSON content while preserving strings.

**Locations**:

- [onHover.ts](src/server/connection/onHover.ts#L1491)
- [onCompletion.ts](src/server/connection/onCompletion.ts#L634)
- [findTemplateDefinition.ts](src/server/connection/onDefinition/findTemplateDefinition.ts#L480)
- [analyzeTemplateData.ts](src/server/helpers/analyzeTemplateData.ts#L200)

**Suggested Helper**: `src/server/helpers/jsonComments.ts`

```typescript
export function safelyRemoveJsonComments(content: string): string;
```

#### 3. `resolveTsPath` function (4 identical copies)

**What it does**: Resolves TypeScript path aliases from `tsconfig.json` paths configuration.

**Locations**:

- [onHover.ts](src/server/connection/onHover.ts#L1497)
- [onCompletion.ts](src/server/connection/onCompletion.ts#L711)
- [findTemplateDefinition.ts](src/server/connection/onDefinition/findTemplateDefinition.ts#L559)
- [analyzeTemplateData.ts](src/server/helpers/analyzeTemplateData.ts#L277)

**Suggested Helper**: `src/server/helpers/resolveTsPath.ts`

```typescript
export function resolveTsPath(
  importPath: string,
  tsconfig: TsConfig,
  projectRoot: string
): string | null;
```

#### 4. `parseTemplateImports` function (3 similar copies with minor variations)

**What it does**: Parses import statements from JS/TS files, resolves paths, and extracts template names from imported files.

**Locations**:

- [onHover.ts](src/server/connection/onHover.ts#L1224) - `parseTemplateImportsForHover`
- [onCompletion.ts](src/server/connection/onCompletion.ts#L750) - `parseTemplateImports`
- [findTemplateDefinition.ts](src/server/connection/onDefinition/findTemplateDefinition.ts#L204) - `parseTemplateImportsForDefinition`

**Suggested Helper**: `src/server/helpers/parseTemplateImports.ts`

```typescript
export function parseTemplateImports(
  filePath: string,
  fs: typeof fsModule,
  path: typeof pathModule
): string[];
```

### Medium Priority Duplications

#### 5. Template import resolution logic

**What it does**: Complex logic to resolve absolute/relative imports with tsconfig path support.

**Locations**:

- [onHover.ts](src/server/connection/onHover.ts#L1234-L1350)
- [onCompletion.ts](src/server/connection/onCompletion.ts#L756-L915)
- [findTemplateDefinition.ts](src/server/connection/onDefinition/findTemplateDefinition.ts#L214-L350)

**Suggested Helper**: `src/server/helpers/resolveTemplateImport.ts`

```typescript
export function resolveTemplateImport(
  importPath: string,
  currentFilePath: string,
  tsconfig?: TsConfig
): string | null;
```

#### 6. JavaScript keywords list (2 identical copies)

**What it does**: Array of JavaScript reserved words to filter out from helper name extraction.

**Locations**:

- [analyzeJavaScriptFile.ts](src/server/helpers/analyzeJavaScriptFile.ts#L29-L72)
- [analyzeJavaScriptFile.ts](src/server/helpers/analyzeJavaScriptFile.ts#L237-L280) (within fallback patterns)

**Suggested Helper**: Move to constants file

```typescript
// src/server/constants/jsKeywords.ts
export const JS_KEYWORDS = [...]
```

#### 7. Directory lookup key generation

**What it does**: Creates directory-based keys for file analysis lookups (`${dir}/${baseName}`).

**Locations**:

- [onHover.ts](src/server/connection/onHover.ts#L145-L149)
- [onCompletion.ts](src/server/connection/onCompletion.ts#L169-L178)
- [analyzeNeighboringFiles.ts](src/server/helpers/analyzeNeighboringFiles.ts#L61-L66)

**Suggested Helper**: `src/server/helpers/generateLookupKeys.ts`

```typescript
export function generateLookupKeys(
  dir: string,
  baseName: string,
  templateName?: string
): string[];
```

#### 8. Template name extraction from HTML

**What it does**: Regex-based extraction of template names from `<template name="...">` tags.

**Locations**:

- [analyzeNeighboringFiles.ts](src/server/helpers/analyzeNeighboringFiles.ts#L27-L31)
- [server-clean.ts](src/server-clean.ts#L172-L177)
- [onDefinition/index.ts](src/server/connection/onDefinition/index.ts#L48-L52)

**Suggested Helper**: `src/server/helpers/extractTemplateNames.ts`

```typescript
export function extractTemplateNames(htmlContent: string): string[];
```

## Untyped Properties (Explicit `any`)

| Filename                       | Line      | Link                                                                             | Suggested Type                                                                 | Notes                               |
| ------------------------------ | --------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------- |
| onHover.ts                     | 331       | [Link](src/server/connection/onHover.ts#L331)                                    | `HelperInfo`                                                                   | Used in `.find()` for helper lookup |
| onHover.ts                     | 707       | [Link](src/server/connection/onHover.ts#L707)                                    | `HelperInfo`                                                                   | Used in `.map()` for global helpers |
| onHover.ts                     | 1168-1169 | [Link](src/server/connection/onHover.ts#L1168-L1169)                             | `typeof import('fs')` and `typeof import('path')`                              | fs and path modules                 |
| onHover.ts                     | 1226-1227 | [Link](src/server/connection/onHover.ts#L1226-L1227)                             | `typeof import('fs')` and `typeof import('path')`                              | fs and path modules                 |
| onHover.ts                     | 1370-1372 | [Link](src/server/connection/onHover.ts#L1370-L1372)                             | `typeof import('fs')`, `typeof import('path')`, return type `TsConfig \| null` | fs/path modules and tsconfig object |
| onHover.ts                     | 1499-1501 | [Link](src/server/connection/onHover.ts#L1499-L1501)                             | `TsConfig`, `typeof import('path')`                                            | tsconfig and path module            |
| onHover.ts                     | 1544-1545 | [Link](src/server/connection/onHover.ts#L1544-L1545)                             | `typeof import('fs')` and `typeof import('path')`                              | fs and path modules                 |
| onHover.ts                     | 2233-2234 | [Link](src/server/connection/onHover.ts#L2233-L2234)                             | `typeof import('fs')` and `typeof import('path')`                              | fs and path modules                 |
| extractTemplateParameters.ts   | 385       | [Link](src/server/helpers/extractTemplateParameters.ts#L385)                     | `typeof import('fs')`                                                          | fs module                           |
| extractTemplateParameters.ts   | 636-637   | [Link](src/server/helpers/extractTemplateParameters.ts#L636-L637)                | `typeof import('fs')` and `typeof import('path')`                              | fs and path modules                 |
| onCompletion.ts                | 357       | [Link](src/server/connection/onCompletion.ts#L357)                               | `HelperInfo`                                                                   | Used in `.map()` for global helpers |
| onCompletion.ts                | 584       | [Link](src/server/connection/onCompletion.ts#L584)                               | Return type `TsConfig \| null`                                                 | Function return type                |
| onCompletion.ts                | 713       | [Link](src/server/connection/onCompletion.ts#L713)                               | `TsConfig`                                                                     | tsconfig parameter                  |
| onCompletion.ts                | 1217-1218 | [Link](src/server/connection/onCompletion.ts#L1217-L1218)                        | `typeof import('fs')` and `typeof import('path')`                              | fs and path modules                 |
| onCompletion.ts                | 1241-1242 | [Link](src/server/connection/onCompletion.ts#L1241-L1242)                        | `typeof import('fs')` and `typeof import('path')`                              | fs and path modules                 |
| findParameterInTemplateHtml.ts | 9-10      | [Link](src/server/connection/onDefinition/findParameterInTemplateHtml.ts#L9-L10) | `typeof import('fs')` and `typeof import('path')`                              | fs and path modules                 |
| findTemplateDefinition.ts      | 147-148   | [Link](src/server/connection/onDefinition/findTemplateDefinition.ts#L147-L148)   | `typeof import('fs')` and `typeof import('path')`                              | fs and path modules                 |
| findTemplateDefinition.ts      | 206-207   | [Link](src/server/connection/onDefinition/findTemplateDefinition.ts#L206-L207)   | `typeof import('fs')` and `typeof import('path')`                              | fs and path modules                 |
| findTemplateDefinition.ts      | 351-352   | [Link](src/server/connection/onDefinition/findTemplateDefinition.ts#L351-L352)   | `typeof import('fs')` and `typeof import('path')`                              | fs and path modules                 |
| findTemplateDefinition.ts      | 430-432   | [Link](src/server/connection/onDefinition/findTemplateDefinition.ts#L430-L432)   | `typeof import('fs')`, `typeof import('path')`, return `TsConfig \| null`      | fs/path modules and return type     |
| findTemplateDefinition.ts      | 559-561   | [Link](src/server/connection/onDefinition/findTemplateDefinition.ts#L559-L561)   | `TsConfig`, `typeof import('path')`                                            | tsconfig and path module            |
| validateTextDocument.ts        | 31-32     | [Link](src/server/helpers/validateTextDocument.ts#L31-L32)                       | `BlockCondition`                                                               | Block conditions from validation    |

### Type Definitions Needed

Create `src/types.ts` or extend existing:

```typescript
// TypeScript configuration object
export interface TsConfig {
  compilerOptions?: {
    baseUrl?: string;
    paths?: Record<string, string[]>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// Block condition for validation
export interface BlockCondition {
  type: string;
  requiresEndTag?: boolean;
  [key: string]: unknown;
}
```

## Summary

**Total Improvements**: 19 tasks

- Performance: 7 tasks
- Code Deduplication: 8 major duplications identified
- Type Safety: 24 explicit `any` usages documented

**Estimated Impact**:

- **High Priority**: 11 items (Critical performance + major duplications)
- **Medium Priority**: 8 items (Optimization + minor duplications)

**Next Steps**:

1. Create shared helper modules for duplicated functions
2. Define proper TypeScript interfaces for `any` types
3. Implement caching layer for expensive operations
4. Add performance monitoring/profiling
