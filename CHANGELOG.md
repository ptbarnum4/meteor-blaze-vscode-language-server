# Change Log

All notable changes to the "meteor-blaze-vscode-language-server" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.0.3] - 2025-08-11

### Added
templates
  - Detects missing/mismatched closing tags with intelligent error messages
  - Suggests correct closing tags based on context and nesting
  - Configurable validation rules through `meteorLanguageServer.blockConditions` settings
- **Smart File Filtering**: Template validation now only applies to appropriate files
  - Validates `.html`, `.htm`, and `.meteor` files containing actual templates
  - Excludes test files (`.test.ts`, `.spec.js`, etc.), config files, and source code files
  - Prevents lint errors in test suites and development files
- **Meteor Project Detection**: Extension only activates when `.meteor` directory is found
  - Recursive detection up to 5 directory levels from workspace root
  - Improves performance by avoiding activation in non-Meteor projects
- **Enhanced Code Completion**:
  - Context-aware `else` completion only shows in `#if`/`#unless` blocks
  - Argument-aware semantic token highlighting for Blaze expressions
  - Improved completion hints with better contextual relevance
- **Advanced Template Analysis**:
  - Support for `#each` context detection with alias and source identification
  - Enhanced definition lookup with TypeScript method syntax support
  - Improved hover information with parameter names and JSDoc extraction
  - Data property navigation in analyzed files
- **Syntax Highlighting Improvements**:
  - Consistent coloring for `else` statements using `blazeBlockName` color
  - Enhanced semantic tokens for better visual distinction
  - Conditional logic for argument-aware expression highlighting

### Changed
- Reorganized project structure: moved `src/extension.ts` to `src/extension/index.ts`
- Updated all import references for consistency
- Enhanced error messages for block validation with contextual suggestions
- Improved completion trigger characters to include `}` for auto-insertion

### Fixed
- Comprehensive test suite repair: all 165 tests now passing
- Fixed import path issues causing module resolution failures
- Resolved Mac Ctrl+Space conflicts with Spotlight search
- Enhanced same-line detection logic for accurate completion hints

### Technical Improvements
- Added 6 new test cases for file filtering validation
- Comprehensive test coverage for auto-insertion functionality
- Enhanced language server protocol integration
- Improved TypeScript compilation and bundling process

## [Unreleased]

- Initial release