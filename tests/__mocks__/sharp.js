const mockSharp = jest.fn(() => ({
  resize: jest.fn().mockReturnThis(),
  png: jest.fn().mockReturnThis(),
  jpeg: jest.fn().mockReturnThis(),
  ensureAlpha: jest.fn().mockReturnThis(),
  composite: jest.fn().mockReturnThis(),
  toBuffer: jest.fn(() => Promise.resolve(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))),
  toFile: jest.fn(() => Promise.resolve()),
}));

module.exports = mockSharp;
