# Continuous Integration

This project uses GitHub Actions for continuous integration and testing.

## Workflows

### CI Workflow (`.github/workflows/ci.yml`)

**Triggers:**
- Push to `main` branch
- Pull requests targeting `main` branch

**Jobs:**
1. **Test Job** - Runs on Ubuntu with Node.js 18.x, 20.x, and 22.x
   - Checkout code
   - Install dependencies (`npm ci`)
   - Run linting (`npm run lint`)
   - Run type checking (`npm run check-types`)
   - Run tests (`npm test`)
   - Build extension (`npm run compile`)

2. **Package Job** - Runs only on pushes to `main`, after tests pass
   - Install VSCE (VS Code Extension Manager)
   - Package extension as `.vsix` file
   - Upload artifact for 30 days

### Test Workflow (`.github/workflows/test.yml`)

**Triggers:**
- Manual dispatch (workflow_dispatch)
- Daily schedule at 2 AM UTC
- Cross-platform testing on Ubuntu, Windows, and macOS

**Purpose:**
- Extended testing across multiple operating systems
- Daily regression testing
- Manual testing when needed

## Status Badge

The main README includes a CI status badge:
```markdown
[![CI](https://github.com/ptbarnum4/meteor-blaze-vscode-language-server/actions/workflows/ci.yml/badge.svg)](https://github.com/ptbarnum4/meteor-blaze-vscode-language-server/actions/workflows/ci.yml)
```

## Local Development

To run the same checks locally:

```bash
# Install dependencies
npm ci

# Run all checks (same as CI)
npm run lint
npm run check-types
npm test
npm run compile

# Or run the full test suite
npm test
```

## Notes

- The workflows use `npm ci` for faster, reliable dependency installation
- Tests run against multiple Node.js versions to ensure compatibility
- The package job only runs on main branch pushes, creating release artifacts
- All workflows use the latest Ubuntu runner for primary testing
