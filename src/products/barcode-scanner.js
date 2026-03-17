/* ── Barcode Scanner ──────────────────────────────────────── */

import { mapOffApiProduct } from './database.js';

let scannerInstance = null;

export async function openBarcodeScanner(onProductFound) {
  const modal = document.getElementById('barcode-modal');
  if (!modal) return;
  modal.classList.add('open');
  const statusEl = document.getElementById('barcode-status');
  const videoContainer = document.getElementById('barcode-reader');

  if (statusEl) statusEl.textContent = 'Camera starten\u2026';
  if (videoContainer) videoContainer.innerHTML = '';

  try {
    // Try native BarcodeDetector first (Chrome/Edge)
    if ('BarcodeDetector' in window) {
      await startNativeScanner(videoContainer, statusEl, onProductFound);
    } else {
      await startLibraryScanner(videoContainer, statusEl, onProductFound);
    }
  } catch (err) {
    if (statusEl) statusEl.textContent = 'Camera niet beschikbaar: ' + (err.message || 'Onbekende fout');
  }
}

async function startNativeScanner(container, statusEl, onProductFound) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
  });
  const video = document.createElement('video');
  video.srcObject = stream;
  video.setAttribute('playsinline', 'true');
  video.style.cssText = 'width:100%;border-radius:8px';
  container.appendChild(video);
  await video.play();

  if (statusEl) statusEl.textContent = 'Richt camera op barcode\u2026';

  const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
  let scanning = true;

  const scan = async () => {
    if (!scanning) return;
    try {
      const barcodes = await detector.detect(video);
      if (barcodes.length > 0) {
        scanning = false;
        stopScanner();
        await handleBarcode(barcodes[0].rawValue, statusEl, onProductFound);
        return;
      }
    } catch {}
    if (scanning) requestAnimationFrame(scan);
  };

  scannerInstance = {
    stop: () => {
      scanning = false;
      stream.getTracks().forEach(t => t.stop());
      video.remove();
    },
  };

  requestAnimationFrame(scan);
}

async function startLibraryScanner(container, statusEl, onProductFound) {
  const { Html5Qrcode } = await import('html5-qrcode');
  const readerId = 'barcode-reader';
  container.id = readerId;

  const html5QrCode = new Html5Qrcode(readerId);

  scannerInstance = {
    stop: async () => {
      try { await html5QrCode.stop(); } catch {}
      try { html5QrCode.clear(); } catch {}
    },
  };

  if (statusEl) statusEl.textContent = 'Richt camera op barcode\u2026';

  await html5QrCode.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 250, height: 150 } },
    async (decodedText) => {
      await html5QrCode.stop();
      await handleBarcode(decodedText, statusEl, onProductFound);
    },
    () => {} // ignore scan failures
  );
}

async function handleBarcode(code, statusEl, onProductFound) {
  if (statusEl) statusEl.textContent = `Barcode ${code} gevonden, product opzoeken\u2026`;

  try {
    const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`);
    if (!response.ok) throw new Error('API fout');
    const data = await response.json();

    if (data.status !== 1 || !data.product) {
      if (statusEl) statusEl.textContent = `Product niet gevonden voor barcode ${code}`;
      return;
    }

    const mapped = mapOffApiProduct(data.product);
    if (!mapped) {
      if (statusEl) statusEl.textContent = 'Product gevonden maar geen voedingsdata beschikbaar';
      return;
    }

    if (statusEl) statusEl.textContent = `Gevonden: ${mapped.n}`;
    closeBarcodeScanner();

    if (onProductFound) onProductFound(mapped);
  } catch (err) {
    if (statusEl) statusEl.textContent = 'Fout bij opzoeken: ' + (err.message || 'Onbekende fout');
  }
}

export function stopScanner() {
  if (scannerInstance) {
    scannerInstance.stop();
    scannerInstance = null;
  }
}

export function closeBarcodeScanner() {
  stopScanner();
  const modal = document.getElementById('barcode-modal');
  if (modal) modal.classList.remove('open');
}

export function initBarcodeScanner(onProductFound) {
  document.getElementById('scan-btn')?.addEventListener('click', () => openBarcodeScanner(onProductFound));
  document.getElementById('barcode-close-btn')?.addEventListener('click', closeBarcodeScanner);
  document.getElementById('barcode-modal')?.addEventListener('click', e => {
    if (e.target.id === 'barcode-modal') closeBarcodeScanner();
  });
}
