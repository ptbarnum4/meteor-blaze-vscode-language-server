import { Template } from 'meteor/templating';

type TrueOrFalse = string | boolean | number;

Template.registerHelper(
  'ifTrue',
  <T extends TrueOrFalse = string>(value: any, ifTrue: T, ifFalse: T): T => {
    const t = typeof ifTrue === 'string' ? ifTrue : '';
    const f = typeof ifFalse === 'string' ? ifFalse : '';
    return (!!value ? t : f) as T;
  }
);
