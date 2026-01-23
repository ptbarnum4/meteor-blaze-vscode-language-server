import { Template } from 'meteor/templating';
import './test-issue-62.html';

/**
 * Test Parameter Completion - Issue #62
 */

// Define data types for childTemplate
type ChildTemplateData = {
  /** The main parameter for the child */
  childParam: string;
  /** Secondary parameter */
  childParam2?: number;
  /** Third parameter */
  childParam3?: boolean;
};

// Define helpers for testParameterCompletion
Template.testParameterCompletion.helpers({
  someValue(): string {
    return 'test value';
  },

  anotherValue(): number {
    return 42;
  },

  helper(): string {
    return 'helper result';
  }
});

// Define data context for childTemplate
Template.childTemplate.onCreated(function() {
  this.data = {
    childParam: 'default',
    childParam2: 0,
    childParam3: false
  } as ChildTemplateData;
});

// Define helpers for childTemplate
Template.childTemplate.helpers({
  displayParam(): string {
    const data = Template.currentData() as ChildTemplateData;
    return data.childParam || 'none';
  }
});

// Define data type for anotherTemplate
type AnotherTemplateData = {
  /** First parameter */
  param1: string;
  /** Second parameter */
  param2: string;
  /** Third parameter */
  param3: string;
};

Template.anotherTemplate.onCreated(function() {
  this.data = {
    param1: '',
    param2: '',
    param3: ''
  } as AnotherTemplateData;
});
