/**
 *  Modified from [kadirahq/blaze-layout](https://github.com/kadirahq/blaze-layout/blob/master/lib/client/layout.js)
 */

import { Blaze as _Blaze } from 'meteor/blaze';
import { ReactiveDict } from 'meteor/reactive-dict';
import { Meteor } from 'meteor/meteor';
import each from 'lodash/each';

type HTMLNodeCommon = {
  _templateInstance?: Blaze.TemplateInstance;
  _blaze_view?: Blaze.View;
};
type HtmlJQueryNode = JQuery & { jquery: string } & HTMLNodeCommon;

type HtmlNode = HTMLElement & HTMLNodeCommon;
type BlazeViewWithProperties = _Blaze.View & {
  _templateInstance?: Blaze.TemplateInstance;
  _blaze_view?: Blaze.View;
  _domrange?: Record<string, any>;
  originalParentView?: BlazeViewWithProperties;
  _template?: Blaze.Template;
};

type BlazeType = typeof _Blaze & {
  _getTemplate: (
    name: string,
    parentView: Blaze.View | (() => Blaze.View | null)
  ) => Blaze.View | null;
  _TemplateWith: (
    data: Record<string, any>,
    contentFunc: () => Blaze.TemplateInstance
  ) => Blaze.View;
  _DOMBackend: {
    parseHTML: (html: string) => HtmlNode[];
    findBySelector: (selector: string, element: HtmlNode) => HtmlNode[];
  };
  remove: (view: Blaze.View) => void;
  getView: (element: HtmlNode) => Blaze.View;
  render: (
    view: Blaze.View,
    parentView: Blaze.View | null,
    nextNode: HtmlNode | null,
    parentElement: HtmlNode | DocumentFragment | null
  ) => void;
};

const Blaze = _Blaze as BlazeType;

type ExtendedLayout = {
  _domrange: Record<string, any>;
  onViewReady: (callback: () => void) => void;
  dataVar: Record<string, any>;
};

type CurrentLayout = Blaze.View & ExtendedLayout;

export class FlowLayout {
  public static currentLayoutName: string | null = null;
  public static currentLayout: CurrentLayout | null = null;
  public static currentRegions: ReactiveDict = new ReactiveDict();
  public static currentData: Record<string, any> | null = null;
  private static _root: HtmlNode | HTMLElement | HtmlJQueryNode | null = null;

  public static setRoot(root: HtmlNode | HTMLElement | null): void {
    FlowLayout._root = root;
  }

  public static render(layout: string, regions?: Record<string, any>): void {
    Meteor.startup(() => FlowLayout._render(layout, regions || {}));
  }

  public static reset(): void {
    let layout = FlowLayout.currentLayout;
    if (!layout) {
      return;
    }

    if (layout?._domrange) {
      // if it's rendered let's remove it right away
      Blaze.remove(layout);
    } else {
      // if not let's remove it when it rendered
      layout.onViewReady(() => layout && Blaze.remove(layout));
    }

    FlowLayout.currentLayout = null;
    FlowLayout.currentLayoutName = null;
    FlowLayout.currentRegions = new ReactiveDict();
  }

  private static _regionsToData(
    regions: Record<string, any>,
    data?: Record<string, any>
  ): Record<string, any> {
    const newData = (data = data || {});
    each(regions, (value, key) => {
      FlowLayout.currentRegions.set(key, value);
      newData[key] = FlowLayout._buildRegionGetter(key);
    });

    return newData;
  }

  private static _updateRegions(regions?: Record<string, any>): void {
    if (!regions) {
      regions = {};
    }
    let needsRerender = false;
    // unset removed regions from the exiting data
    each(FlowLayout.currentData, (_value, key) => {
      if (regions[key] === undefined) {
        FlowLayout.currentRegions.set(key, undefined);
        delete FlowLayout.currentData?.[key];
      }
    });

    each(regions, (value, key) => {
      // if this key does not yet exist then blaze
      // has no idea about this key and it won't get the value of this key
      // so, we need to force a re-render
      if (FlowLayout.currentData && FlowLayout.currentData[key] === undefined) {
        needsRerender = true;
        // and, add the data function for this new key
        FlowLayout.currentData[key] = FlowLayout._buildRegionGetter(key);
      }
      FlowLayout.currentRegions.set(key, value);
    });

    // force re-render if we need to
    if (FlowLayout.currentLayout && needsRerender) {
      FlowLayout.currentLayout.dataVar.dep.changed();
    }
  }

  private static _getRootDomNode(): HtmlNode {
    let root = FlowLayout._root;

    if (!root) {
      root = Blaze._DOMBackend.parseHTML('<div id="__blaze-root"></div>')[0];
      document.body.appendChild(root);
      FlowLayout.setRoot(root);
    } else if (typeof root === 'string') {
      // @ts-ignore - Blaze._DOMBackend exists and `document` is a valid node
      root = Blaze._DOMBackend.findBySelector(root, document)[0] as HtmlNode;
    } else if ('jquery' in root) {
      root = (root as JQuery)[0];
    }

    if (!root) {
      throw new Error('Root element does not exist');
    }

    return root;
  }

  private static _buildRegionGetter(key: string): () => any {
    return () => FlowLayout.currentRegions.get(key);
  }

  private static _getTemplate(
    layout: string,
    rootDomNode: HtmlNode
  ): Blaze.Template | Blaze.View | null {
    if (!Blaze._getTemplate) {
      return Template[layout];
    }
    // if Meteor 1.2, see https://github.com/meteor/meteor/pull/4036
    // using Blaze._getTemplate instead of directly accessing Template allows
    // packages like Blaze Components to hook into the process
    return Blaze._getTemplate(layout, () => {
      let view = Blaze.getView(rootDomNode) as BlazeViewWithProperties | null;

      // find the closest view with a template instance
      while (view && !view._templateInstance) {
        view = view.originalParentView || view.parentView;
      }

      const foundView = view?._templateInstance as unknown as Blaze.View | null;
      // return found template instance, or null
      return foundView || null;
    });
  }

  private static _render(layout: string, regions?: Record<string, any>): void {
    let rootDomNode = FlowLayout._getRootDomNode();
    if (FlowLayout.currentLayoutName === layout) {
      FlowLayout._updateRegions(regions);
      return;
    }
    // remove old view
    FlowLayout.reset();
    // @ts-ignore - FlowLayout.currentData is set in _regionsToData
    FlowLayout.currentData = FlowLayout._regionsToData(regions);
    // @ts-ignore
    FlowLayout.currentLayout = Blaze._TemplateWith(FlowLayout.currentData, function () {
      // @ts-ignore - FlowLayout.currentData is set in _regionsToData
      const template = FlowLayout._getTemplate(layout, rootDomNode);

      // 'layout' should be null (to render nothing) or an existing template name
      if (layout !== null && !template) {
        console.error('FlowLayout warning: unknown template "' + layout + '"');
      }
      // @ts-ignore - Spacebars exists globally in Blaze
      return Spacebars.include(template);
    });
    if (FlowLayout.currentLayout) {
      // @ts-ignore
      Blaze.render(FlowLayout.currentLayout, rootDomNode, null, Blaze.getView(rootDomNode));
    }
    FlowLayout.currentLayoutName = layout;
  }
}
