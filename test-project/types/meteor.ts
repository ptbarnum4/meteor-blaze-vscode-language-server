declare module 'meteor/blaze' {
  namespace Blaze {
    function _toText(
      view: Blaze.View,
      parentViewOrTextMode: Blaze.View | string,
      textMode?: string
    ): string;

    function registerHelper(
      name: string,
      helperFunction: ((this: any, ...args: any[]) => any) | Blaze.Template
    ): void;
  }
}

declare module 'meteor/templating' {
  // /**
  //  * A helper type to make the access to data and template instance member type safe.
  //  * @example
  //  * const TemplateTyped = Template as TemplateStaticTyped<
  //  *     'newTemplate',
  //  *     { foo: string },
  //  *     {
  //  *         state: ReactiveDict<{ bar: number }>;
  //  *         getFooBar(): string;
  //  *     }
  //  * >;
  //  * TemplateTyped.newTemplate.onCreated(function () { ...
  //  * @template N Template name
  //  * @template D Data
  //  * @template T Template interface with custom properties and methods that extends the template instance
  //  */
  // export type Template<
  //   N extends string,
  //   D extends any = unknown,
  //   T extends Record<string, unknown> = Record<string, never>
  // > = import('meteor/templating').TemplateStaticTyped<N, D, T>;
}

declare module 'meteor/ostrio:flow-router-extra' {
  type DynamicImport = Promise<string>;

  export type WaitOnCallback = (
    params: Param,
    qs: QueryParam,
    ready: (func: () => ReturnType<WaitOnCallback>) => void
  ) =>
    | Promise<any>
    | Array<Promise<any>>
    | Meteor.SubscriptionHandle
    | Tracker.Computation
    | Array<Tracker.Computation>
    | DynamicImport
    | Array<DynamicImport | Meteor.SubscriptionHandle>;

  export type Param<T extends Record<string, string> = {}> = T & {
    [key: string]: string;
  };

  export type QueryParam<T extends Record<string, string> = {}> = Param<T>;

  // Route Group Types
  export type GroupRouteActionCallback = (params: Param, queryParams: QueryParam) => void;

  export type GroupRouteTriggerCallbackContext = {
    canonicalPath: string;
    hash: string;
    params: Param;
    path: string;
    pathname: string;
    querystring: string;
    state: { path: string };
    title: string;
    route: Group;
  };
  export type GroupRouteTriggerCallback = (
    context: GroupRouteTriggerCallbackContext,
    redirect: (path: string) => void
  ) => void;

  export type GroupRouteOptions = {
    isTask?: boolean;
    name?: string;
    action?: GroupRouteActionCallback;
    triggersExit?: GroupRouteTriggerCallback[];
    triggersEnter?: GroupRouteTriggerCallback[];
    waitOn?: WaitOnCallback;
  };
  export type GroupOptions = GroupRouteOptions & {
    prefix?: string;
    name: string;
  };
  export type Group = {
    name: string;
    group(options: GroupOptions): Group;
    route(path: string, options: GroupRouteOptions): Group;
  };
}
