/**
 * Browser-based barcode scanner
 * Uses native BarcodeDetector API (Chrome/Android) with html5-qrcode fallback
 */
(function (global) {
  'use strict';

  const SUPPORTED_FORMATS = ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'itf', 'data_matrix', 'aztec', 'pdf417', 'qr_code'];

  const CSS = `
    #bs-overlay {
      position: fixed; inset: 0; z-index: 99999;
      background: rgba(0,0,0,0.92);
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      font-family: 'Poppins', sans-serif;
    }
    #bs-overlay .bs-title {
      color: #fff; font-size: 16px; font-weight: 600;
      margin-bottom: 16px; letter-spacing: .5px;
    }
    #bs-overlay .bs-viewport {
      position: relative; width: min(90vw, 360px); height: min(90vw, 360px);
      border-radius: 12px; overflow: hidden; background: #000;
    }
    #bs-overlay video {
      width: 100%; height: 100%; object-fit: cover; display: block;
    }
    #bs-overlay .bs-frame {
      position: absolute; inset: 0; pointer-events: none;
    }
    #bs-overlay .bs-frame::before,
    #bs-overlay .bs-frame::after {
      content: '';
      position: absolute; width: 40px; height: 40px;
      border-color: #4fc3f7; border-style: solid; border-radius: 4px;
    }
    #bs-overlay .bs-frame::before { top: 16px; left: 16px; border-width: 3px 0 0 3px; }
    #bs-overlay .bs-frame::after  { bottom: 16px; right: 16px; border-width: 0 3px 3px 0; }
    #bs-overlay .bs-line {
      position: absolute; left: 16px; right: 16px; height: 2px;
      background: linear-gradient(90deg, transparent, #4fc3f7, transparent);
      animation: bs-scan 2s linear infinite;
    }
    @keyframes bs-scan { 0% { top: 20%; } 100% { top: 80%; } }
    #bs-overlay .bs-hint {
      color: #aaa; font-size: 13px; margin-top: 14px; text-align: center; padding: 0 20px;
    }
    #bs-overlay .bs-btn-row {
      display: flex; gap: 12px; margin-top: 20px;
    }
    #bs-overlay .bs-btn {
      padding: 10px 28px; border-radius: 8px; border: none; cursor: pointer;
      font-size: 14px; font-weight: 600; transition: opacity .2s;
    }
    #bs-overlay .bs-btn:active { opacity: .75; }
    #bs-overlay .bs-btn-cancel { background: #444; color: #fff; }
    #bs-overlay .bs-btn-torch  { background: #1a73e8; color: #fff; }
    #bs-overlay .bs-error {
      color: #ef5350; font-size: 13px; margin-top: 10px; text-align: center; padding: 0 20px;
    }
    #bs-overlay #bs-html5qr-region { width: min(90vw, 360px) !important; }
    #bs-overlay #bs-html5qr-region video { border-radius: 12px; }
  `;

  let overlayEl = null;
  let videoStream = null;
  let animFrameId = null;
  let torchOn = false;
  let html5QrInstance = null;

  function injectStyles() {
    if (document.getElementById('bs-styles')) return;
    const s = document.createElement('style');
    s.id = 'bs-styles';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function stopAll() {
    if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
    if (videoStream) { videoStream.getTracks().forEach((t) => t.stop()); videoStream = null; }
    if (html5QrInstance) {
      try { html5QrInstance.stop().catch(() => {}); } catch (e) {}
      html5QrInstance = null;
    }
    if (overlayEl) { overlayEl.remove(); overlayEl = null; }
  }

  function buildOverlay(title) {
    const div = document.createElement('div');
    div.id = 'bs-overlay';
    div.innerHTML = `
      <div class="bs-title">${title || 'Scan Barcode'}</div>
      <div class="bs-viewport">
        <video id="bs-video" autoplay playsinline muted></video>
        <div class="bs-frame"><div class="bs-line"></div></div>
      </div>
      <div class="bs-hint">Arahkan kamera ke barcode</div>
      <div id="bs-error" class="bs-error"></div>
      <div class="bs-btn-row">
        <button class="bs-btn bs-btn-torch" id="bs-torch-btn">Senter</button>
        <button class="bs-btn bs-btn-cancel" id="bs-cancel-btn">Batal</button>
      </div>
    `;
    return div;
  }

  function buildHtml5QrOverlay(title) {
    const div = document.createElement('div');
    div.id = 'bs-overlay';
    div.innerHTML = `
      <div class="bs-title">${title || 'Scan Barcode'}</div>
      <div id="bs-html5qr-region"></div>
      <div class="bs-hint">Arahkan kamera ke barcode</div>
      <div id="bs-error" class="bs-error"></div>
      <div class="bs-btn-row">
        <button class="bs-btn bs-btn-cancel" id="bs-cancel-btn">Batal</button>
      </div>
    `;
    return div;
  }

  // --- Strategy 1: native BarcodeDetector ---
  async function scanWithBarcodeDetector(callback, title) {
    overlayEl = buildOverlay(title);
    document.body.appendChild(overlayEl);

    const video = document.getElementById('bs-video');
    const errorEl = document.getElementById('bs-error');

    try {
      videoStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      video.srcObject = videoStream;
    } catch (e) {
      errorEl.textContent = 'Tidak dapat mengakses kamera: ' + e.message;
      return;
    }

    const detector = new BarcodeDetector({ formats: SUPPORTED_FORMATS });

    async function detect() {
      if (!overlayEl) return;
      try {
        const barcodes = await detector.detect(video);
        if (barcodes.length > 0) {
          const result = barcodes[0].rawValue;
          stopAll();
          callback(result);
          return;
        }
      } catch (_) {}
      animFrameId = requestAnimationFrame(detect);
    }

    video.addEventListener('loadeddata', () => { animFrameId = requestAnimationFrame(detect); });

    // Torch toggle
    document.getElementById('bs-torch-btn').addEventListener('click', async () => {
      const track = videoStream && videoStream.getVideoTracks()[0];
      if (!track) return;
      try {
        torchOn = !torchOn;
        await track.applyConstraints({ advanced: [{ torch: torchOn }] });
      } catch (_) {}
    });

    document.getElementById('bs-cancel-btn').addEventListener('click', () => { stopAll(); });
  }

  // --- Strategy 2: html5-qrcode fallback ---
  function loadHtml5QrScript(cb) {
    if (global.Html5Qrcode) { cb(); return; }
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
    s.onload = cb;
    s.onerror = () => {
      const errorEl = document.getElementById('bs-error');
      if (errorEl) errorEl.textContent = 'Gagal memuat library scanner.';
    };
    document.head.appendChild(s);
  }

  function scanWithHtml5Qrcode(callback, title) {
    overlayEl = buildHtml5QrOverlay(title);
    document.body.appendChild(overlayEl);

    loadHtml5QrScript(() => {
      try {
        html5QrInstance = new Html5Qrcode('bs-html5qr-region');
        const config = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 };
        html5QrInstance.start(
          { facingMode: 'environment' },
          config,
          (decodedText) => {
            stopAll();
            callback(decodedText);
          },
          () => {}
        ).catch((e) => {
          const el = document.getElementById('bs-error');
          if (el) el.textContent = 'Kamera error: ' + e;
        });
      } catch (e) {
        const el = document.getElementById('bs-error');
        if (el) el.textContent = 'Error: ' + e.message;
      }
    });

    document.getElementById('bs-cancel-btn').addEventListener('click', () => { stopAll(); });
  }

  /**
   * @param {function(string): void} callback - called with the decoded barcode string
   * @param {string} [title] - optional modal title
   */
  global.openBarcodeScanner = function (callback, title) {
    injectStyles();
    stopAll(); // close any existing scanner

    if (typeof BarcodeDetector !== 'undefined') {
      BarcodeDetector.getSupportedFormats().then(() => {
        scanWithBarcodeDetector(callback, title);
      }).catch(() => {
        scanWithHtml5Qrcode(callback, title);
      });
    } else {
      scanWithHtml5Qrcode(callback, title);
    }
  };

})(window);
