import { Template } from 'meteor/templating';

type TrueOrFalse = string | boolean | number;

Template.registerHelper(
  'ifTrue',
  /**
   * Evaluates a condition and returns a specified value based on the truthiness of the condition.
   * @param value - The value to evaluate
   * @param ifTrue - The value to return if the condition is true
   * @param ifFalse - The value to return if the condition is false
   * @template T - The type of the return value, which can be a string, boolean, or number.
   * @returns - Returns `ifTrue` if `value` is truthy, otherwise returns `ifFalse`.
   */
  <T extends TrueOrFalse = string>(value: any, ifTrue: T, ifFalse: T): T => {
    const t = typeof ifTrue === 'string' ? ifTrue : '';
    const f = typeof ifFalse === 'string' ? ifFalse : '';
    return (!!value ? t : f) as T;
  }
);
