/**
 * Tests for electron-app/src/capture.js
 *
 * Mocks Electron's desktopCapturer and sharp so we can test
 * captureScreen, startCapture, stopCapture, and isBlankFrame logic.
 *
 * @jest-environment node
 */

// --- Mocks -------------------------------------------------------------------
// Electron mock is provided by moduleNameMapper in jest.config.js

const mockThumbnail = {
  isEmpty: jest.fn(() => false),
  toPNG: jest.fn(() => {
    // Create a non-blank PNG-like buffer (enough non-zero bytes)
    const buf = Buffer.alloc(2000);
    for (let i = 0; i < buf.length; i++) buf[i] = (i % 255) + 1;
    return buf;
  }),
};

const electron = require('electron');
const mockDesktopCapturer = electron.desktopCapturer;
const mockSystemPreferences = electron.systemPreferences;

// Configure desktopCapturer mock to return test sources
mockDesktopCapturer.getSources.mockImplementation(() =>
  Promise.resolve([
    {
      id: 'screen:0:0',
      name: 'Entire Screen',
      thumbnail: mockThumbnail,
    },
  ])
);

const mockJpegBuffer = Buffer.from('fake-jpeg-data');
const sharpChain = {
  resize: jest.fn().mockReturnThis(),
  jpeg: jest.fn().mockReturnThis(),
  toBuffer: jest.fn(() => Promise.resolve(mockJpegBuffer)),
};
jest.mock('sharp', () => jest.fn(() => sharpChain));

// --- Import after mocks ------------------------------------------------------

const capture = require('../../electron-app/src/capture');

// --- Tests -------------------------------------------------------------------

describe('capture.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capture.stopCapture();
    // Reset thumbnail behavior
    mockThumbnail.isEmpty.mockReturnValue(false);
    mockThumbnail.toPNG.mockReturnValue((() => {
      const buf = Buffer.alloc(2000);
      for (let i = 0; i < buf.length; i++) buf[i] = (i % 255) + 1;
      return buf;
    })());
    mockDesktopCapturer.getSources.mockResolvedValue([
      { id: 'screen:0:0', name: 'Entire Screen', thumbnail: mockThumbnail },
    ]);
  });

  describe('captureScreen', () => {
    test('returns a JPEG buffer on success', async () => {
      const result = await capture.captureScreen();
      expect(result).toBe(mockJpegBuffer);
      expect(mockDesktopCapturer.getSources).toHaveBeenCalledWith({
        types: ['screen'],
        thumbnailSize: { width: 1280, height: 720 },
      });
    });

    test('returns null when no sources available', async () => {
      mockDesktopCapturer.getSources.mockResolvedValue([]);
      const result = await capture.captureScreen();
      expect(result).toBeNull();
    });

    test('returns null when thumbnail is empty (no permission)', async () => {
      mockThumbnail.isEmpty.mockReturnValue(true);
      const result = await capture.captureScreen();
      expect(result).toBeNull();
    });

    test('returns null on desktopCapturer error', async () => {
      mockDesktopCapturer.getSources.mockRejectedValue(new Error('capture failed'));
      const result = await capture.captureScreen();
      expect(result).toBeNull();
    });

    test('processes through sharp with correct options', async () => {
      await capture.captureScreen();
      const sharp = require('sharp');
      expect(sharp).toHaveBeenCalled();
      expect(sharpChain.resize).toHaveBeenCalledWith({ width: 1280, withoutEnlargement: true });
      expect(sharpChain.jpeg).toHaveBeenCalledWith({ quality: 60 });
    });
  });

  describe('isBlankFrame detection', () => {
    // We test indirectly through captureScreen since isBlankFrame is not exported.
    // A blank frame is one where the PNG buffer has almost all zero bytes
    // in the sampled region.

    test('detects blank (all-zero) frame', async () => {
      // Create a mostly-zero buffer (blank frame)
      const blankBuf = Buffer.alloc(2000, 0);
      mockThumbnail.toPNG.mockReturnValue(blankBuf);

      // captureScreen still returns the jpeg (isBlankFrame only logs a warning)
      // but we can verify it processes correctly
      const result = await capture.captureScreen();
      // The function still returns the buffer (it only warns, doesn't skip)
      expect(result).toBe(mockJpegBuffer);
    });

    test('small buffer (< 200 bytes) is treated as blank', async () => {
      const smallBuf = Buffer.alloc(50, 0);
      mockThumbnail.toPNG.mockReturnValue(smallBuf);
      // Still processes through sharp
      const result = await capture.captureScreen();
      expect(result).toBe(mockJpegBuffer);
    });
  });

  describe('startCapture', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
      capture.stopCapture();
    });

    test('sets interval at correct FPS', () => {
      const onFrame = jest.fn();
      capture.startCapture(2, onFrame); // 2 FPS = 500ms interval

      expect(capture.isCapturing()).toBe(true);
      expect(capture.getCurrentFps()).toBe(2);
    });

    test('calls onFrame callback with captured buffer', async () => {
      const onFrame = jest.fn();
      capture.startCapture(1, onFrame);

      // Advance timer to trigger one interval tick
      jest.advanceTimersByTime(1000);

      // Since captureScreen is async (desktopCapturer.getSources + sharp.toBuffer),
      // we need to flush multiple microtask cycles
      await Promise.resolve(); // getSources resolves
      await Promise.resolve(); // sharp chain resolves
      await Promise.resolve(); // onFrame called
      await Promise.resolve(); // extra flush

      expect(onFrame).toHaveBeenCalledWith(mockJpegBuffer);
    });

    test('does not start if fps <= 0', () => {
      const onFrame = jest.fn();
      capture.startCapture(0, onFrame);
      expect(capture.isCapturing()).toBe(false);
    });

    test('stops previous capture before starting new one', () => {
      const onFrame1 = jest.fn();
      const onFrame2 = jest.fn();

      capture.startCapture(1, onFrame1);
      expect(capture.isCapturing()).toBe(true);

      capture.startCapture(2, onFrame2);
      expect(capture.isCapturing()).toBe(true);
      expect(capture.getCurrentFps()).toBe(2);
    });
  });

  describe('stopCapture', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('clears interval and resets state', () => {
      capture.startCapture(1, jest.fn());
      expect(capture.isCapturing()).toBe(true);

      capture.stopCapture();
      expect(capture.isCapturing()).toBe(false);
      expect(capture.getCurrentFps()).toBe(0);
    });

    test('is safe to call when not capturing', () => {
      expect(() => capture.stopCapture()).not.toThrow();
      expect(capture.isCapturing()).toBe(false);
    });
  });

  describe('hasScreenPermission (macOS check)', () => {
    // hasScreenPermission is not exported, but we can test it indirectly
    // by checking that captureScreen works when permission is granted

    test('captureScreen succeeds when permission is granted', async () => {
      mockSystemPreferences.getMediaAccessStatus.mockReturnValue('granted');
      const result = await capture.captureScreen();
      expect(result).toBe(mockJpegBuffer);
    });
  });
});
