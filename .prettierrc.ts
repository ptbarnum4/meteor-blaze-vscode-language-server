import Prettier from 'prettier';

const config: Prettier.Options = {
  bracketSpacing: true,
  singleQuote: true,
  jsxSingleQuote: true,
  trailingComma: 'es5',
  tabWidth: 2,
  useTabs: false,
  semi: true,
  endOfLine: 'lf',
};

export default config;
