const Store = jest.fn(() => ({
  get: jest.fn(() => ''),
  set: jest.fn(),
  clear: jest.fn(),
  store: {},
}));
module.exports = Store;
