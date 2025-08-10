Template.simple.helpers({
  testHelper() {
    return 'Hello from simple helper!';
  },

  // NEW helper to test if new code is running
  newTestHelper() {
    return 'This helper proves new code is running!';
  }
});
