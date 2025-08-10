import { TemplateStaticTyped, Template as _Template } from 'meteor/templating';

import './template.html';
import './style.less';

type TestProps = {
  // Add template props here and in the `onCreated` function inside `this.props`
  showDetails: boolean;
  userCount: number;
};

type TestData = {
  // Add template data here
  title: string;
  subtitle: string;
  isActive: boolean;
};

// Create the static typed template
type TestTemplate = TemplateStaticTyped<'test', TestData, { props: TestProps }>;

// Resign the template to the static typed template
const Template = _Template as TestTemplate;

Template.test.onCreated(function () {
  this.props = {
    // Add template props here and in the types above
    showDetails: true,
    userCount: 42
  };
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
   * This is a test helper method
   * @returns A string for the test text
   */
  testText() {
    return 'This is a TypeScript-powered Meteor template';
  },

  showTypeInfo() {
    return Template.instance().props?.showDetails || false;
  },

  getPropInfo() {
    const count = Template.instance().props?.userCount || 0;
    return `Props available: showDetails, userCount (${count})`;
  },

  getDataInfo() {
    return 'Data context is typed with TestData interface';
  },

  formattedUserCount() {
    const count = this.props?.userCount || 0;
    return count > 1 ? `${count} users` : `${count} user`;
  }
});

Template.test.events({
  // test event handlers
  'click .test-content'(event, template) {
    console.log('TypeScript template clicked!', template.props);
  },

  'mouseenter .typescript-indicator'(event, template) {
    console.log('Hovering TypeScript indicator');
  }
});
