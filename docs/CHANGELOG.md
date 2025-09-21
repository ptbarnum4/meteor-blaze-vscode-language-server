# Change Log

All notable changes to the "meteor-blaze-vscode-language-server" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.0.7] - 2025-09-21

### 🔄 Major Infrastructure & Dependency Updates
- **GitHub Actions Modernization**: Updated to latest action versions and Node.js 22.x
  - Updated `actions/checkout` from v4 → v5
  - Updated `actions/setup-node` from v4 → v5
  - Updated `softprops/action-gh-release` from v1 → v2
  - Migrated CI/CD pipeline to Node.js 22.x (latest LTS)
- **Dependency Modernization**: Major updates to all core dependencies
  - TypeScript ESLint: v6.21.0 → v8.0.0
  - Node.js types: v16.x → v24.5.2
  - VS Code types: v1.74.0 → v1.104.0
  - ESBuild: v0.19.12 → v0.25.10
  - ESLint: v8.56.0 → v9.0.0 with new flat config format
  - Mocha testing: v10.2.0 → v11.7.2
  - Language Server Protocol: v8.1.0 → v9.0.1 (client & server)
  - VS Code Engine: v1.74.0 → v1.104.0 minimum requirement
- **Automated Dependency Management**: Added comprehensive Dependabot configuration
  - Weekly dependency updates with intelligent grouping
  - Separate tracking for development, testing, and VS Code dependencies
  - GitHub Actions updates monitoring

### 🎨 Enhanced Visual & Theme Integration
- **Improved Block Condition Hints**: Enhanced visual integration and smart behavior
  - Updated default color from `editorCodeLens.foreground` → `#727272` for better theme compatibility
  - Refined default margin from `0 0 0 1em` → `0 0 0 0.75em` for optimal spacing
  - **Smart Comment Detection**: Hints automatically hide when existing comments are present
  - Support for HTML (`<!-- -->`) and Handlebars (`{{!-- --}}`, `{{! }}`) comment detection
- **New Custom Theme Colors**: Added 8 semantic token colors for enhanced syntax highlighting
  - `blazeBlockHash.defaultColor` (#808080) - Hash symbols
  - `blazeBlockName.defaultColor` (#f177ff) - Block names (if, each, etc.)
  - `blazeBlockArgs.defaultColor` (#fffec4) - Block arguments
  - `blazeBlockFirstArg.defaultColor` (#ffd16f) - First argument highlighting
  - `blazeBlockSingleArg.defaultColor` (#ffd16f) - Single argument highlighting
  - `blazeExpression.defaultColor` (#ffd16f) - Blaze expressions
  - `blazeBlockIn.defaultColor` (#00ffa2) - 'in' keyword highlighting
  - `delimiter.defaultColor` (#808080) - Delimiter symbols

### 📋 Documentation & Configuration Overhaul
- **Reorganized Documentation Structure**: Consolidated and organized all documentation under `docs/`
  - New `docs/README.md` - Central documentation hub
  - New `docs/SETUP.md` - Complete setup and configuration guide
  - New `docs/FEATURES.md` - Comprehensive feature documentation
  - Enhanced `docs/development/` - Development guides and references
- **Streamlined Main README**: Simplified and reorganized with visual examples and better navigation
- **Removed Legacy Documentation**: Consolidated multiple standalone docs into organized structure
  - Removed: `CONFIGURATION.md`, `AUTO_INSERT.md`, `TEMPLATE_INCLUSION.md`, `DETECTION_TEST.md`
  - Content preserved and enhanced in new documentation structure

### 🛠️ Code Quality & Performance Improvements
- **ESLint Configuration Modernization**: Updated to ESLint v9 flat config format
  - Enhanced TypeScript integration and rule optimization
  - Better handling of unused variables and error patterns
  - Improved development workflow with modern linting standards
- **Enhanced Error Handling**: Improved error handling patterns throughout codebase
  - Anonymous catch blocks where error details aren't needed
  - Better type safety and error boundary handling
- **Code Formatting & Cleanup**: Consistent code formatting and removal of unused imports
- **TypeScript Configuration Updates**: Updated to Node.js 20 module resolution with `skipLibCheck`

### 🧪 Testing & Development Enhancements
- **Test Infrastructure Updates**: Enhanced test coverage and examples
  - New comment detection test cases in `test-project/imports/ui/test/commentTest.html`
  - Updated test project configurations for Node.js 22.x
  - Improved CI/CD pipeline reliability
- **Development Environment**: Better development experience with updated tooling
  - Modernized build system with latest ESBuild
  - Enhanced debugging capabilities
  - Improved documentation for contributors

### 🔧 Compatibility & Migration
- **Backward Compatibility**: All changes maintain backward compatibility
- **Migration Benefits**: Users upgrading will experience:
  - Better visual integration with updated default colors
  - Enhanced documentation and setup guides
  - Improved performance from dependency updates
  - More robust block condition hint behavior
- **System Requirements**:
  - VS Code v1.104.0 or newer required
  - Optimized for Node.js 22.x (latest LTS)

## [0.0.6] - 2025-08-17

### Fixed
- **Global Helper Reference Resolution**: Fixed critical issues with global template helper lookup
  - **Absolute Import Support**: Fixed resolution of absolute imports (e.g., `/imports/lib/globalHelpers`)
  - **TypeScript Path Mapping**: Added support for TypeScript `paths` configuration in `tsconfig.json`
  - **Template Parameter Hover**: Fixed template parameter hover information that was broken due to path resolution issues
  - **Project Root Detection**: Improved algorithm for finding project root in complex directory structures
- **Enhanced Template Import Resolution**: Better handling of various import patterns
  - Updated regex patterns to support both relative and absolute import styles
  - Added robust fallback mechanisms when primary resolution methods fail
  - Support for multiple Meteor import patterns used in real-world projects

### Enhanced
- **Code Architecture Overhaul**: Refactored extension activation into focused, testable modules
  - `createCompletionItemProvider()` - Isolated completion logic
  - `createSemanticProvider()` - Dedicated semantic token management
  - `promptIfNoConfigsSet()` - User configuration guidance
  - Parsing modules for better code organization (`parseBlockConditions`, `parseBlockExpressions`)
- **Global Helper Analysis Improvements**: Enhanced parsing and documentation extraction
  - Better JSDoc extraction from various helper definition patterns
  - Support for `Template.registerHelper('name', functionName)` pattern
  - Multi-line pattern handling for complex helper registrations
  - Improved parameter and return type extraction
- **Comment-Aware Processing**: Added comprehensive comment detection and filtering
  - New `isWithinComment()` function prevents processing Blaze code inside comments
  - Support for HTML comments (`<!-- -->`), Handlebars comments (`{{!-- --}}`, `{{! }}`), and JavaScript comments
  - Enhanced syntax highlighting accuracy by excluding commented code

### Added
- **Enhanced Validation and Diagnostics**:
  - Nesting validation between HTML tags and Blaze blocks
  - Duplicate parameter detection in template inclusions
  - Cross-boundary violation detection with specific error messages
  - Improved error positioning and more helpful diagnostic messages
- **Comprehensive Testing Infrastructure**:
  - Full test suite for global helper analysis functionality
  - Complete test coverage for comment detection logic
  - Tests for JSDoc extraction and TypeScript function references
  - Cross-platform compatibility testing with proper cleanup

### Technical Improvements
- **Dependency Updates**: Updated to `glob@^11.0.3` for better file pattern matching
- **Performance Optimizations**: Enhanced file type filtering and lazy loading
- **Build Process**: Improved build configuration and error handling
- **Code Quality**: Enhanced TypeScript strict mode and ESLint configuration

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
- **Comprehensive Configuration Documentation**: New consolidated setup documentation in `docs/SETUP.md`
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