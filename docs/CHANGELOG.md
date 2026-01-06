# Change Log

All notable changes to the "meteor-blaze-vscode-language-server" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.0.10] - 2026-01-06

### ✨ New Features

#### Rich Global Helper Configuration
- **New `meteorLanguageServer.globalHelpers` setting**: Define custom global helpers with comprehensive documentation
- **Parameter definitions**: Document parameter names, types, and descriptions
- **Return type information**: Specify and document return types
- **Usage examples**: Provide template code examples for each helper
- **Optional parameters**: Mark parameters as optional with default values
- **Union types**: Support multiple types for parameters (e.g., `["string", "Date"]`)
- **Enhanced IntelliSense**: Full documentation appears in hover and completion
- **Backward compatible**: Legacy `blazeHelpers.extend` still supported

#### Configuration Example
```json
{
  "meteorLanguageServer.globalHelpers": {
    "extend": [
      {
        "name": "formatDate",
        "doc": "Format dates with custom patterns",
        "params": [
          {
            "name": "date",
            "type": ["string", "Date"],
            "doc": "Date to format"
          },
          {
            "name": "format",
            "type": "string",
            "optional": true,
            "default": "MM/DD/YYYY"
          }
        ],
        "return": {
          "type": "string",
          "doc": "Formatted date string"
        },
        "examples": [
          { "html": "{{ formatDate createdAt 'DD-MM-YYYY' }}" }
        ]
      }
    ]
  }
}
```

**Benefits:**
- Better documentation for external package helpers
- Improved team collaboration with shared helper docs
- Enhanced code completion with type information
- Quick reference through hover and examples

## [0.0.9] - 2025-11-08

### 🔧 Maintenance

#### Development Dependencies Updated
- **@eslint/js**: Updated from ^9.0.0 to ^9.39.1
- **@types/node**: Updated from ^24.5.2 to ^24.10.0
- **@types/vscode**: Updated from ^1.104.0 to ^1.105.0
- **@typescript-eslint/eslint-plugin**: Updated from ^8.0.0 to ^8.46.3
- **@typescript-eslint/parser**: Updated from ^8.0.0 to ^8.46.3
- **esbuild**: Updated from ^0.25.10 to ^0.25.12
- **eslint**: Updated from ^9.0.0 to ^9.39.1
- **mocha**: Updated from ^11.7.2 to ^11.7.5
- **typescript**: Updated from ^5.3.3 to ^5.9.3
- **VS Code engine**: Updated from ^1.104.0 to ^1.105.0

No functional changes to the extension - this is a pure dependency maintenance release ensuring compatibility with the latest tooling and security patches.

## [0.0.8] - 2025-11-08

### ✨ New Features

#### Invalid Block Detection in HTML Tags
- **Detects invalid Blaze syntax patterns**: Extension now identifies and reports errors when `{{#if}}` or `{{#unless}}` blocks are used directly within HTML element tags to conditionally set attributes
- **Smart validation**: Correctly allows blocks within quoted attribute values (e.g., `class="{{#if}}...{{/if}}"`)
- **Comment-aware**: Skips validation within HTML (`<!-- -->`) and Handlebars (`{{!-- --}}`, `{{! }}`) comments
- **Helpful error messages**: Provides clear guidance on proper alternatives (helper functions or template restructuring)
- **Complete block highlighting**: Highlights entire blocks from `{{#if}}` to `{{/if}}` for better error visibility

#### Workspace-Wide Validation
- **New command**: "Meteor/Blaze: Validate All Templates in Workspace" accessible via Command Palette
- **Automatic validation on startup**: Validates all `.html`, `.htm`, `.meteor`, and `.hbs` files when language server starts (configurable)
- **New setting**: `meteorLanguageServer.validateWorkspaceOnStartup` (default: `true`)
- **Centralized error management**: All validation errors appear in the Problems panel for easy navigation
- **Click-to-fix**: Jump directly to problematic code from the Problems panel
- **Large project support**: Efficiently handles projects with many template files

#### Enhanced HTML/Blaze Nesting Validation
- **{{else}} boundary support**: Added `{{else}}` tag recognition as a structural boundary
- **Flexible HTML placement**: Allows HTML to be opened in `{{#if}}` and closed in `{{else}}` (or vice versa)
- **Better nested block handling**: Improved validation of nested blocks within `{{else}}` branches
- **Context-aware validation**: Skips validation for tags within comments or quoted strings

### 🐛 Bug Fixes

#### Duplicate Parameter Detection
- **Fixed false positives for hyphenated attributes**: Now correctly distinguishes between similar hyphenated HTML attributes (e.g., `data-test-id`, `data-custom-id`, `data-id`)
- **Technical improvement**: Updated regex pattern from `/\b([a-zA-Z_$][a-zA-Z0-9_$]*)=/g` to `/(?:^|\s)([a-zA-Z_$][a-zA-Z0-9_$-]*)=/g` to properly handle hyphens in attribute names
- **Eliminated false duplicates**: Attributes like `data-test-id` and `data-custom-id` are now correctly recognized as different parameters

#### Handlebars Inline Comment Detection
- **Fixed nested expression handling**: Correctly handles inline comments containing nested `{{ }}` expressions
- **Brace depth tracking**: Implemented proper brace counting to identify true comment boundaries
- **Eliminated false positives**: Comments like `{{! <button {{#if active}}disabled{{/if}}></button> }}` are now correctly recognized as single comments
- **Improved parser accuracy**: No longer treats the first `}}` within a comment as the comment's end

#### Quote Tracking in Template Files
- **Smart quote detection**: Enhanced quote tracking to avoid false positives from single quotes in Handlebars expressions
- **Context-aware parsing**: Only tracks quotes within attribute assignments, not within Handlebars expression arguments
- **Better handling of complex templates**: Properly handles templates with quotes in parameters like `{{#if isInRole 'admin,super,admiral' 'confirmed'}}`
- **Reduced noise**: Significantly reduced false validation errors in real-world templates

### 📝 Documentation

#### New Example Configuration Files
- **example-settings.jsonc**: Basic language server configuration with block conditions and custom helpers
- **example-settings-auto-insert.jsonc**: Auto-insert end tags configuration examples
- **example-settings-blazeHelpers-colors.jsonc**: Custom colors for Blaze helper tokens
- **example-blaze-token-theme.jsonc**: TextMate token color customization examples

#### Updated Documentation
- **README.md**: Added workspace validation section with configuration examples and example file references
- **SETUP.md**: Added reference to example configuration files at the top with detailed descriptions
- **Enhanced feature documentation**: Improved examples and use cases throughout documentation

### 🏗️ Technical Changes

#### New Files
- `src/server/helpers/validateWorkspace.ts`: Workspace validation logic with recursive file discovery and error handling
- 20+ test files in `test-project/imports/ui/`: Comprehensive test coverage for edge cases and validation scenarios

#### Modified Files
- `src/server/helpers/validateTextDocument.ts`: Core validation logic with new validators for invalid blocks and enhanced nesting
- `src/server/helpers/isWithinComment.ts`: Enhanced comment detection with brace depth tracking for nested expressions
- `src/server/connection/onInitialized.ts`: Auto-validation on startup with configurable settings
- `src/server/index.ts`: Custom request handler for workspace validation command
- `src/extension/activate.ts`: Validate workspace command registration
- `package.json`: New command and setting configuration

#### Test Coverage
Added 20+ comprehensive test cases:
- Invalid blocks in HTML tags (multiple scenarios)
- Blocks within quoted attribute values (valid use cases)
- Comment detection (HTML and Handlebars, including nested)
- Nested blocks and complex expressions
- Single vs. double quote handling
- HTML within `{{else}}` blocks
- Multi-line templates and edge cases
- False positive prevention scenarios

### 🎨 Code Quality Improvements

#### Enhanced Quote Tracking Algorithm
- Properly distinguishes between quotes in attribute assignments vs. text content
- Handles nested Handlebars expressions within quotes
- Tracks single and double quotes independently
- Respects escape sequences

#### Improved Comment Handling
- Implemented brace depth tracking for inline comments
- Handles nested `{{ }}` expressions within comments
- Supports all comment types: HTML (`<!-- -->`), Handlebars block (`{{!-- --}}`), and inline (`{{! }}`)

#### Pattern Matching Enhancements
- Fixed regex patterns to handle hyphenated attribute names
- Improved parameter extraction accounting for whitespace and special characters
- Added lookbehind assertions for more accurate matching

### 📊 Statistics
- **New files**: 23
- **Modified files**: 12
- **Test cases added**: 20+
- **Lines of documentation**: 100+
- **Bug fixes**: 3 major false positive scenarios resolved

### 🔄 Breaking Changes
**None.** This release is fully backward compatible.

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