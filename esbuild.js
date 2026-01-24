/* eslint-disable */

const esbuild = require('esbuild');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**@type {import('esbuild').Plugin} */
const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',

  setup(build) {
    build.onStart(() => {
      console.info('[watch] build started');
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        console.error(
          `    ${location?.file}:${location?.line}:${location?.column}:`
        );
      });
      console.info('[watch] build finished');
    });
  },
};

/**@type {import('esbuild').Plugin} */
const pathAliasPlugin = {
  name: 'path-alias',
  setup(build) {
    // Resolve paths starting with '/' to 'src/'
    build.onResolve({ filter: /^\// }, (args) => {
      return {
        path: path.resolve(__dirname, 'src', args.path.slice(1)),
      };
    });
  },
};

async function main() {
  const contexts = [];

  // Build extension (client)
  const extensionCtx = await esbuild.context({
    entryPoints: ['src/extension/index.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    logLevel: 'silent',
    plugins: [pathAliasPlugin, esbuildProblemMatcherPlugin],
  });
  contexts.push(extensionCtx);

  // Build server
  const serverCtx = await esbuild.context({
    entryPoints: ['src/server/index.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'dist/server.js',
    external: ['vscode'],
    logLevel: 'silent',
    plugins: [pathAliasPlugin, esbuildProblemMatcherPlugin],
  });
  contexts.push(serverCtx);

  // Build tests
  const glob = require('glob');
  const testFiles = glob.sync('src/test/**/*.test.ts');

  if (testFiles.length > 0) {
    const testCtx = await esbuild.context({
      entryPoints: testFiles,
      bundle: true,
      format: 'cjs',
      minify: false,
      sourcemap: true,
      sourcesContent: true,
      platform: 'node',
      outdir: 'out/test',
      outbase: 'src/test',
      external: ['vscode', 'mocha'],
      logLevel: 'silent',
      plugins: [pathAliasPlugin, esbuildProblemMatcherPlugin],
    });
    contexts.push(testCtx);
  }

  if (watch) {
    await Promise.all(contexts.map((ctx) => ctx.watch()));
  } else {
    await Promise.all(contexts.map((ctx) => ctx.rebuild()));
    await Promise.all(contexts.map((ctx) => ctx.dispose()));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
