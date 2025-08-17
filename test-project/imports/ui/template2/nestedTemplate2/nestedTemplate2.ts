import { TemplateStaticTyped, Template as _Template } from 'meteor/templating';

import './style.less';
import './template.html';

type NestedTemplate2Props = {
  // Add template props here and in the `onCreated` function inside `this.props`
};

type NestedTemplate2Data = {
  /**
   * This is a test data type for the nested template.
   * It includes various properties to demonstrate the structure.
   */
  thing1: string;
  /**
   * This is a test data type for the nested template.
   * It includes various properties to demonstrate the structure.
   * thing 2!!!
   */
  thing2: number;
  /**
   * This is a test data type for the nested template. thing 3 abc
   */
  thing3: boolean;
  /**
   * This is a test data type for the nested template  asdsd
   */
  thing4: string[];
  // Complex nested object with additional properties
  thing5: {
    nestedThing1: string;
    nestedThing2: number;
    nestedThing3: boolean;
  };
};

// Create the static typed template
type NestedTemplate2Instance = TemplateStaticTyped<
  'nestedTemplate2',
  NestedTemplate2Data,
  { props: NestedTemplate2Props }
>;

// Resign the template to the static typed template
const Template = _Template as NestedTemplate2Instance;

Template.nestedTemplate2.onCreated(function () {
  this.props = {
    // Add template props here and in the types above
  };
});

Template.nestedTemplate2.onDestroyed(function () {
  // test onDestroyed
});

Template.nestedTemplate2.onRendered(function () {
  // test onRendered
});

Template.nestedTemplate2.helpers({
  /**
   * this is a test helper function
   * @returns A test string to display in the template
   */
  testText(): string {
    return 'test text';
  },

  /**
   * Nested template helper function
   * @returns A nested text string
   */
  nestedText(): string {
    return 'This is nested template text';
  }
});

Template.nestedTemplate2.events({
  // test event handlers
});
