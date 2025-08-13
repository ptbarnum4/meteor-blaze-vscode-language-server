import { FlowRouter, Group } from 'meteor/ostrio:flow-router-extra';

import { FlowLayout } from '/imports/lib/FlowLayout';

import '/imports/ui/mainLayout.html';

const exposed = FlowRouter.group({
  name: 'exposed',
  prefix: '/'
}) as Group;

exposed.route('/', {
  name: 'home',
  action: (_params, _queryParams) => {
    FlowLayout.render('mainLayout', { main: 'test' });
  },

  waitOn: (_params, _qs) => {
    return [import('/imports/ui/test/test')];
  }
});
