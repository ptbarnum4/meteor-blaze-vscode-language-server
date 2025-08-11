import { TemplateStaticTyped, Template as _Template } from 'meteor/templating';

import './template.html';
import './style.less';

type TestProps = {
  count: ReactiveVar<number>;
};

type TestData = {};

// Create the static typed template
type TestTemplate = TemplateStaticTyped<'test', TestData, { props: TestProps }>;

// Resign the template to the static typed template
const Template = _Template as TestTemplate;

Template.test.onCreated(function () {
  this.props = {
    count: new ReactiveVar(60)
  };
  console.log('Test template created with initial count:', this.props.count.get());
});

Template.test.onDestroyed(function () {
  // test onDestroyed
  console.log('Test template destroyed');
});

Template.test.onRendered(function () {
  // test onRendered
  console.log('Test template rendered');
});

Template.test.helpers({
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

Template.test.events({
  'click .increment'(event, instance) {
    // test events
    event.preventDefault();
    const currentCount = instance.props.count.get();
    instance.props.count.set(currentCount + 1);
    console.log('Count incremented to:', instance.props.count.get());
  }
});
