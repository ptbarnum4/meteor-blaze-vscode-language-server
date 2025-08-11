import { CompletionItem } from 'vscode-languageserver/node';

import { CurrentConnectionConfig } from '../../types';

const onCompletionResolve = (_config: CurrentConnectionConfig) => {
  return (item: CompletionItem): CompletionItem => {
    return item;
  };
};

export default onCompletionResolve;
