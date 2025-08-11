# Deploying to the VS Code Marketplace

This project is ready to package and publish to the Visual Studio Code Marketplace using either local commands or GitHub Actions.

## 1) Prerequisites

- Node.js 18+ (20.x recommended)
- A VS Code publisher (e.g., `ptbarnum4`)
- A Personal Access Token for the Marketplace (VSCE PAT)

### Create a Publisher (one-time)
1. Sign in at https://marketplace.visualstudio.com/manage
2. Create a new Publisher (use the same name you set in `package.json` under `publisher`).

### Create a VSCE Personal Access Token (one-time)
1. Go to https://dev.azure.com and create a PAT with scope "Marketplace (Publish)".
2. Save the token as a secret. You'll use it locally or in GitHub Actions as `VSCE_PAT`.

## 2) Ensure manifest is correct

In `package.json`:
- `name`, `displayName`, `publisher`, `version` are set
- `icon` points to `solar-brackets.png`
- `engines.vscode` is set appropriately

## 3) Package locally

You can build and create a `.vsix` locally:

```bash
npm ci
npm run package:vsix
```

The VSIX file will be generated in the project root.

Install locally for testing:

```bash
code --install-extension ./*.vsix --force
```

## 4) Publish locally (manual)

Install vsce and publish directly:

```bash
npm i -g @vscode/vsce
export VSCE_PAT=YOUR_TOKEN_HERE
npm run publish:marketplace
```

Alternatively bump version automatically:

```bash
# Patch/minor/major release
npm run publish:patch
npm run publish:minor
npm run publish:major
```

## 5) Publish with GitHub Actions (automated)

This repo includes `.github/workflows/publish.yml` that publishes on GitHub Release (Published) or via manual dispatch.

### Set secret
In your GitHub repo settings → Secrets and variables → Actions → New repository secret:
- Name: `VSCE_PAT`
- Value: your VSCE token

### Trigger publish
Option A: Create a GitHub Release for the commit you want to publish. The workflow will build and run `vsce publish` using `VSCE_PAT`.

Option B: Manually trigger the workflow from the Actions tab ("Publish Extension").

## Notes

- `.vscodeignore` is configured to exclude tests and sources; the built `dist/**` is included in the VSIX.
- The CI workflow `ci.yml` packages a VSIX artifact on pushes to `main`.
- If Marketplace assets (images/links) appear broken, ensure `--baseImagesUrl` and `--baseContentUrl` are correct, or use absolute URLs in the README.

