const { desktopCapturer, systemPreferences } = require('electron');

// Lazy load sharp to handle native module loading in packaged apps
let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.error('[Capture] Sharp not available:', e.message);
}

let captureInterval = null;
let currentFps = 0;
let permissionWarned = false;

// Check if screen recording permission is granted (macOS only)
function hasScreenPermission() {
  if (process.platform !== 'darwin') return true;
  return systemPreferences.getMediaAccessStatus('screen') === 'granted';
}

// Check if a captured frame is blank (all black = no permission)
function isBlankFrame(pngBuffer) {
  // Quick check: if the buffer is very small or all zeros after header, it's blank
  // PNG has ~60 byte header, then pixel data
  if (pngBuffer.length < 200) return true;

  // Sample some pixels from the middle of the buffer
  const sampleStart = Math.floor(pngBuffer.length * 0.3);
  const sampleEnd = Math.min(sampleStart + 500, pngBuffer.length);
  let nonZero = 0;
  for (let i = sampleStart; i < sampleEnd; i++) {
    if (pngBuffer[i] !== 0) nonZero++;
  }
  // If almost all bytes are zero, it's likely a blank frame
  return nonZero < 10;
}

async function captureScreen() {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1280, height: 720 }
    });

    if (sources.length === 0) return null;

    // Get primary screen (first source)
    const source = sources[0];
    const thumbnail = source.thumbnail;

    // Check if thumbnail is empty (no permission)
    if (thumbnail.isEmpty()) {
      if (!permissionWarned) {
        permissionWarned = true;
        console.error('[Capture] Screen recording permission not granted - frame is empty');
      }
      return null;
    }

    // Convert NativeImage to buffer
    const pngBuffer = thumbnail.toPNG();

    // Detect blank frame (permission denied gives black frame on macOS)
    if (!permissionWarned && isBlankFrame(pngBuffer)) {
      permissionWarned = true;
      console.error('[Capture] Screen recording permission likely not granted - frame is blank/black');
    }

    // Use sharp if available, otherwise send raw PNG
    if (sharp) {
      const jpegBuffer = await sharp(pngBuffer)
        .resize({ width: 1280, withoutEnlargement: true })
        .jpeg({ quality: 60 })
        .toBuffer();
      return jpegBuffer;
    }

    // Fallback: use NativeImage resize + JPEG
    const resized = thumbnail.resize({ width: 1280 });
    return resized.toJPEG(60);
  } catch (err) {
    console.error('[Capture] Error:', err.message);
    return null;
  }
}

function startCapture(fps, onFrame) {
  stopCapture();
  if (fps <= 0) return;

  currentFps = fps;
  const intervalMs = Math.round(1000 / fps);

  let frameCount = 0;
  console.log(`[Capture] Starting at ${fps} FPS (interval: ${intervalMs}ms)`);

  captureInterval = setInterval(async () => {
    const frame = await captureScreen();
    if (frame) {
      frameCount++;
      if (frameCount <= 3 || frameCount % 10 === 0) {
        console.log(`[Capture] Frame #${frameCount} size: ${(frame.length / 1024).toFixed(1)}KB`);
      }
      onFrame(frame);
    }
  }, intervalMs);
}

function stopCapture() {
  if (captureInterval) {
    clearInterval(captureInterval);
    captureInterval = null;
    currentFps = 0;
    console.log('[Capture] Stopped');
  }
}

function isCapturing() {
  return captureInterval !== null;
}

function getCurrentFps() {
  return currentFps;
}

module.exports = {
  captureScreen,
  startCapture,
  stopCapture,
  isCapturing,
  getCurrentFps
};
