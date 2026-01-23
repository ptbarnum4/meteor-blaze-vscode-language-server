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
Template.childTemplate.onCreated(function () {
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

Template.anotherTemplate.onCreated(function () {
  this.data = {
    param1: '',
    param2: '',
    param3: ''
  } as AnotherTemplateData;
});
// Define data type for parentTemplate (testing same-named params)
type ParentTemplateData = {
  /** Page number from parent - used as value */
  page: number;
  /** Items per page from parent */
  perPage: number;
  /** Total results count from parent */
  totalResults: number;
  /** Loading state from parent */
  isLoading: boolean;
};

// Define data type for paginatorTemplate (child)
type PaginatorData = {
  /** Current page number for paginator */
  page: number;
  /** Number of items per page */
  perPage: number;
  /** Total number of items */
  total: number;
  /** Whether pagination is disabled */
  disabled?: boolean;
  /** Whether to use fixed positioning */
  fixed?: boolean;
  /** Whether to enable query params */
  enableQueryParams?: string[];
};

Template.parentTemplate.helpers({
  /** Page number in parent context */
  page(): number {
    return 1;
  },

  /** Items per page in parent context */
  perPage(): number {
    return 10;
  },

  /** Total results in parent context */
  totalResults(): number {
    return 100;
  },

  /** Loading state in parent context */
  isLoading(): boolean {
    return false;
  }
});

Template.paginatorTemplate.onCreated(function () {
  this.data = {
    page: 1,
    perPage: 10,
    total: 100,
    disabled: false,
    fixed: false
  } as PaginatorData;
});
