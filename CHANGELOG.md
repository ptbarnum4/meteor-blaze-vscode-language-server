# Change Log

All notable changes to the "meteor-blaze-vscode-language-server" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.0.5] - 2025-08-13

### Added
- **Enhanced Template Completion System**: Comprehensive auto-completion for Meteor/Blaze templates
  - **Smart Single Bracket Detection**: Automatically detects single `{` and wraps completions in double brackets `{{}}`
  - **Template Helper Completions**: Intelligent detection and completion of Template.helpers() functions with full JSDoc support
  - **Global Helper Support**: Auto-completion for globally registered template helpers across the workspace
  - **Template Data Properties**: Completion suggestions for template data context properties
  - **Built-in Blaze Helpers**: Completion support for `#if`, `#unless`, `#each`, `#with`, `#let`, and `this`
  - **File Type Filtering**: Completions only appear in appropriate template files (`.html`, `.htm`, `.meteor`)

### Enhanced
- **Intelligent Helper Parsing**: Advanced JavaScript analysis with robust filtering
  - Comprehensive exclusion of JavaScript keywords and control flow statements (`if`, `for`, `while`, etc.)
  - Smart object literal context validation to ensure only actual template helpers are detected
  - Enhanced JSDoc parsing for parameter types, return types, and documentation
  - Support for multiple helper definition patterns (arrow functions, function expressions, standard methods)
- **Handlebars Expression Detection**: Improved bracket matching and expression boundary detection
  - Better handling of incomplete expressions and cursor positioning
  - Enhanced single bracket detection with context-aware completion triggering

### Technical Improvements
- **Enhanced File Analysis**: Robust Template.helpers() block parsing with proper brace matching
- **Improved Code Completion Engine**: More accurate completion suggestions with detailed documentation
- **Better Error Handling**: Comprehensive error handling in file analysis and completion generation
- **Performance Optimizations**: Efficient parsing algorithms with reduced redundant processing

## [0.0.4] - 2025-08-11

### Added
- **Comprehensive Configuration Documentation**: New `CONFIGURATION.md` file with complete VS Code settings reference
  - Detailed examples for all extension configuration options
  - Theme customization guide with color token explanations
  - Block condition configuration with troubleshooting tips
  - Blaze helpers setup documentation with performance optimization
- **Enhanced User Experience**: Improved extension activation messaging
  - Added clickable "Open Configuration Guide" button linking to GitHub documentation
  - Streamlined onboarding with direct access to configuration help
  - Better discoverability of extension features and customization options
- **Documentation Cross-Referencing**: Added prominent links to configuration guide in main README

### Changed
- **Simplified Onboarding**: Removed redundant color theme setup prompts
- **Enhanced Theme Support**: Improved approach to Handlebars token highlighting
  - Removed standalone `blaze-theme.json` to prevent auto-generated VS Code UI elements
  - Moved to flexible `editor.tokenColorCustomizations` approach
  - Maintained compatibility with all VS Code themes
  - Enhanced semantic token organization in package.json

### Removed
- Color theme setup notification messages that interrupted workflow
- Auto-generated "Set Color Theme" button from extension UI
- Standalone `blaze-theme.json` theme file

### Technical Improvements
- Enhanced activation flow with actionable user guidance
- Improved documentation structure for better maintainability
- Cleaned up package.json theme contributions
- Better file organization (renamed README-new.md to GITHUB_RELEASE_INSTRUCTIONS.md)

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