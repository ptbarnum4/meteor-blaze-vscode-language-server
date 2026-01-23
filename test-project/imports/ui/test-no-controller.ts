import { ReactiveVar } from 'meteor/reactive-var';
import { Template as _Template, TemplateStaticTyped } from 'meteor/templating';

type ParentWithControllerProps = {
  userName: ReactiveVar<string>;
};
type ParentWithControllerData = {
  age: number;
};

type ParentWithControllerTemplate = TemplateStaticTyped<
  'parentWithController',
  ParentWithControllerData,
  { props: ParentWithControllerProps }
>;

const Template = _Template as ParentWithControllerTemplate;

Template.parentWithController.onCreated(function () {
  this.props = {
    userName: new ReactiveVar('John Doe')
  };
});

Template.parentWithController.helpers({
  greeting(): string {
    const template = Template.instance();
    return `Hello, ${template.props.userName.get()}!`;
  },
  userName() {
    const template = Template.instance();
    return template.props.userName.get();
  },
  active() {
    const age = Template.instance().data.age;
    return age >= 18;
  }
});
