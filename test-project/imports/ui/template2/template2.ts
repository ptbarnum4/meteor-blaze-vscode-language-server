import { TemplateStaticTyped, Template as _Template } from 'meteor/templating';

import '../utils/helpers';

import './style.less';
import './template.html';

type Template2Props = {
  /**
   * Reactive variable to hold the count value.
   * This will be used to demonstrate reactivity in the template.
   */
  count: ReactiveVar<number>;
};

/**
 * Test template for demonstrating static typing with Meteor templates.
 * This template includes reactive variables, helpers, and events.
 */
type Template2Data = {
  /**
   * Data properties for the test template.
   * These properties can be used to pass data into the template.
   */
  data1: string;
  /**
   * Additional data properties for the test template.
   * These properties can be used to pass more data into the template.
   */
  data2: number;
  /**
   * Another data property for the test template.
   * This can be used to pass boolean values into the template.
   */
  data3: boolean;
  /**
   * An array of strings for the test template.
   * This can be used to pass a list of items into the template.
   */
  data4: string[];
};

// Create the static typed template
type Template2Template = TemplateStaticTyped<'template2', Template2Data, { props: Template2Props }>;

// Resign the template to the static typed template
const Template = _Template as Template2Template;

Template.template2.onCreated(function () {
  this.props = {
    count: new ReactiveVar(60)
  };
});

Template.template2.onDestroyed(function () {
  // test onDestroyed
  console.info('Test template destroyed');
});

Template.template2.onRendered(function () {
  // test onRendered
  console.info('Test template rendered');
});

Template.template2.helpers({
  /**
   * Get the current count from the reactive variable.
   * @returns current count
   */
  count(): number {
    return Template.instance().props.count.get();
  },
  /**
   * Generate an array of numbers from 1 to the current count.
   * @returns Array of numbers
   */
  boxes(): number[] {
    const count = Template.instance().props.count.get();
    return Array.from({ length: count }, (_, i) => i + 1);
  },
  /**
   * Pad a number with leading zeros to ensure it is at least three digits.
   * @param num
   * @returns
   */
  pad(num: number) {
    if (!num || num < 0) {
      return '000';
    }
    return num.toString().padStart(3, '0');
  }
});

Template.template2.events({
  'click .increment'(event, instance) {
    // test events
    event.preventDefault();
    const currentCount = instance.props.count.get();
    instance.props.count.set(currentCount + 1);
    console.info('Count incremented to:', instance.props.count.get());
  }
});
