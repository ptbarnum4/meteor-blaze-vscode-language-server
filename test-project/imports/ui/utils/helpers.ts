import { Template } from 'meteor/templating';

type TrueOrFalse = string | boolean | number;

Template.registerHelper(
  'ifTrue',
  (value: any, ifTrue: TrueOrFalse = '', ifFalse: TrueOrFalse = '') => {
    const t = typeof ifTrue === 'string' ? ifTrue : '';
    const f = typeof ifFalse === 'string' ? ifFalse : '';
    return !!value ? t : f;
  }
);