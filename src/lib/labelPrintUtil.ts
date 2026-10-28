import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { formatUzs, getCat } from './utils';

export interface PrintLabelConfig {
  model: string;
  labelType: 'series' | 'single' | 'barcode';
  size?: string;
  sizesObject?: Record<string, number>;
  price?: number;
  showPrice?: boolean;
  showDate?: boolean;
  orgName?: string;
  paperFormat?: 'thermal-80' | 'thermal-58' | 'thermal-82x20' | 'a4-sheet';
  copies?: number;
  qrDataUrl?: string;
  barcodeDataUrl?: string;
}

export async function generateQrDataUrl(payload: any): Promise<string> {
  const str = typeof payload === 'object' ? JSON.stringify(payload) : String(payload);
  return QRCode.toDataURL(str, {
    width: 300,
    margin: 1,
    color: {
      dark: '#000000',
      light: '#FFFFFF'
    },
    errorCorrectionLevel: 'M'
  });
}

/**
 * Generate 1D Code128 Linear Barcode Data URL via an offscreen HTML5 Canvas
 */
export function generateBarcodeDataUrl(
  text: string, 
  options?: { height?: number; fontSize?: number; width?: number }
): string {
  try {
    if (typeof document === 'undefined') return '';
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, text, {
      format: "CODE128",
      displayValue: true,
      fontSize: options?.fontSize || 13,
      font: "monospace",
      fontOptions: "bold",
      height: options?.height || 45,
      width: options?.width || 1.8,
      margin: 4,
      textMargin: 3,
      background: "#ffffff",
      lineColor: "#000000"
    });
    return canvas.toDataURL("image/png");
  } catch (err) {
    console.error("Barcode generation error:", err);
    return "";
  }
}

function buildSingleLabelHtml(
  cfg: PrintLabelConfig,
  codeUrl: string
): string {
  const org = cfg.orgName || 'FALAK SHOES';
  const is58 = cfg.paperFormat === 'thermal-58';
  const is82x20 = cfg.paperFormat === 'thermal-82x20';
  const isA4 = cfg.paperFormat === 'a4-sheet';
  const cat = getCat(cfg.model);
  const catBadge = cat === 'qishki' ? '❄️ Qishki' : cat === 'yozgi' ? '☀️ Yozgi' : '';

  const dateStr = cfg.showDate !== false ? new Date().toISOString().slice(0, 10) : '';
  const priceStr = (cfg.showPrice && cfg.price && cfg.price > 0)
    ? `<span style="font-size: ${is82x20 ? '9.5px' : is58 ? '11px' : '13px'}; font-weight: 900;">${formatUzs(cfg.price)} <small style="font-size: ${is82x20 ? '7px' : '8px'};">UZS</small></span>`
    : `<span style="font-size: ${is82x20 ? '8px' : '9px'}; color: #666;">Standart Mahsulot</span>`;

  // SPECIAL HORIZONTAL COMPACT STRIP LAYOUT FOR 82x20mm (20-82 mm)
  if (is82x20) {
    let body82Html = '';

    if (cfg.labelType === 'barcode') {
      body82Html = `
        <div class="label-82x20-row">
          <div class="label-82x20-left">
            <div class="label-82x20-brand">${org}</div>
            <div class="label-82x20-model" title="${cfg.model}">${cfg.model}</div>
            <div class="label-82x20-meta">
              <span>O'lcham: <b>${cfg.size || '41'}°</b></span>
              ${catBadge ? `<span class="label-82x20-badge">${catBadge}</span>` : ''}
            </div>
          </div>
          <div class="label-82x20-barcode">
            <img src="${codeUrl}" alt="Barcode" class="label-barcode-img-82x20" />
          </div>
          <div class="label-82x20-right">
            <div class="label-82x20-price">${priceStr}</div>
            ${dateStr ? `<div class="label-82x20-date">${dateStr}</div>` : ''}
          </div>
        </div>
      `;
    } else if (cfg.labelType === 'series' && cfg.sizesObject) {
      const activeSizes = Object.entries(cfg.sizesObject).filter(([, q]) => Number(q) > 0);
      const totalQty = activeSizes.reduce((a, b) => a + Number(b[1]), 0);
      const matrixShort = activeSizes.map(([s, q]) => `${s}:${q}`).join(' ');

      body82Html = `
        <div class="label-82x20-row">
          <div class="label-82x20-left">
            <div class="label-82x20-brand">${org} • Seriya (${totalQty}j)</div>
            <div class="label-82x20-model" title="${cfg.model}">${cfg.model}</div>
            <div class="label-82x20-matrix">${matrixShort}</div>
          </div>
          <div class="label-82x20-right-qr">
            <div class="label-82x20-price-col">
              <div>${priceStr}</div>
              ${dateStr ? `<div class="label-82x20-date">${dateStr}</div>` : ''}
            </div>
            <div class="label-qr-82x20">
              <img src="${codeUrl}" alt="QR" />
            </div>
          </div>
        </div>
      `;
    } else {
      // Single QR
      body82Html = `
        <div class="label-82x20-row">
          <div class="label-82x20-left">
            <div class="label-82x20-brand">${org}</div>
            <div class="label-82x20-model" title="${cfg.model}">${cfg.model}</div>
            <div class="label-82x20-meta">
              <span>O'lcham: <b>${cfg.size || '41'}°</b> (1 Juft)</span>
              ${catBadge ? `<span class="label-82x20-badge">${catBadge}</span>` : ''}
            </div>
          </div>
          <div class="label-82x20-right-qr">
            <div class="label-82x20-price-col">
              <div>${priceStr}</div>
              ${dateStr ? `<div class="label-82x20-date">${dateStr}</div>` : ''}
            </div>
            <div class="label-qr-82x20">
              <img src="${codeUrl}" alt="QR" />
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="label-wrapper thermal-82x20">
        <div class="label-box">
          ${body82Html}
        </div>
      </div>
    `;
  }

  let bodyHtml = '';

  if (cfg.labelType === 'barcode') {
    // Linear Barcode layout: Horizontal barcode stripes across label
    bodyHtml = `
      <div class="label-barcode-body">
        <div class="label-size-row">
          <span class="label-size-badge">O'lcham: <b>${cfg.size || '41'}°</b></span>
          <span class="label-qty-badge">1 Juft</span>
        </div>
        <div class="label-barcode-img-wrapper">
          <img src="${codeUrl}" alt="Barcode" class="label-barcode-img" />
        </div>
      </div>
    `;
  } else if (cfg.labelType === 'series' && cfg.sizesObject) {
    const activeSizes = Object.entries(cfg.sizesObject).filter(([, q]) => Number(q) > 0);
    const totalQty = activeSizes.reduce((a, b) => a + Number(b[1]), 0);
    const matrixHtml = activeSizes
      .map(([s, q]) => `<span style="padding: 1px 3px; background: #eee; border: 1px solid #ccc; border-radius: 2px;">${s}°:<b>${q}</b></span>`)
      .join(' ');

    bodyHtml = `
      <div class="label-body">
        <div style="flex: 1; min-width: 0; padding-right: 6px;">
          <div style="font-size: ${is58 ? '9px' : '10px'}; font-weight: 700; color: #555; text-transform: uppercase;">Seriya Qutisi:</div>
          <div style="font-size: ${is58 ? '13px' : '16px'}; font-weight: 900; color: #000; margin: 1px 0;">${totalQty} juft</div>
          <div style="display: flex; flex-wrap: wrap; gap: 2px; font-size: ${is58 ? '8px' : '9px'}; font-family: monospace; margin-top: 3px;">
            ${matrixHtml}
          </div>
        </div>
        <div class="label-qr">
          <img src="${codeUrl}" alt="QR" />
        </div>
      </div>
    `;
  } else {
    // Single QR
    bodyHtml = `
      <div class="label-body">
        <div style="flex: 1; min-width: 0; padding-right: 6px;">
          <div style="font-size: ${is58 ? '9px' : '10px'}; font-weight: 700; color: #555; text-transform: uppercase;">O'lchami:</div>
          <div style="font-size: ${is58 ? '22px' : '28px'}; font-weight: 900; color: #000; line-height: 1;">${cfg.size || '41'}°</div>
          <div style="font-size: ${is58 ? '9px' : '10px'}; font-weight: 800; color: #666; margin-top: 2px;">1 Juft</div>
        </div>
        <div class="label-qr">
          <img src="${codeUrl}" alt="QR" />
        </div>
      </div>
    `;
  }

  return `
    <div class="label-wrapper ${is58 ? 'thermal-58' : isA4 ? 'a4-item' : 'thermal-80'}">
      <div class="label-box">
        <!-- Header -->
        <div class="label-header">
          <div class="label-brand">${org}</div>
          <div class="label-model">${cfg.model}</div>
          ${catBadge ? `<div class="label-badge">${catBadge}</div>` : ''}
        </div>

        <!-- Body -->
        ${bodyHtml}

        <!-- Footer -->
        <div class="label-footer">
          <div>${priceStr}</div>
          ${dateStr ? `<div style="font-family: monospace; font-size: ${is58 ? '8px' : '9px'}; color: #666;">${dateStr}</div>` : ''}
        </div>
      </div>
    </div>
  `;
}

export async function printLabels(configs: PrintLabelConfig | PrintLabelConfig[]): Promise<void> {
  const items = Array.isArray(configs) ? configs : [configs];
  if (items.length === 0) return;

  const renderedLabelsHtml: string[] = [];

  for (const item of items) {
    const copies = Math.max(1, item.copies || 1);
    
    let codeUrl = item.labelType === 'barcode' ? item.barcodeDataUrl : item.qrDataUrl;
    
    if (!codeUrl) {
      if (item.labelType === 'barcode') {
        const barcodeText = `${item.model}-${item.size || '41'}`.replace(/\s+/g, '-').toUpperCase();
        codeUrl = generateBarcodeDataUrl(barcodeText, {
          height: item.paperFormat === 'thermal-82x20' ? 32 : item.paperFormat === 'thermal-58' ? 38 : 48,
          fontSize: item.paperFormat === 'thermal-82x20' ? 10 : item.paperFormat === 'thermal-58' ? 11 : 13,
          width: item.paperFormat === 'thermal-82x20' ? 1.4 : 1.8
        });
      } else if (item.labelType === 'series') {
        const activeSizes = Object.fromEntries(
          Object.entries(item.sizesObject || {}).filter(([, q]) => Number(q) > 0)
        );
        const total = Object.values(activeSizes).reduce((a, b) => a + Number(b), 0);
        codeUrl = await generateQrDataUrl({
          type: 'series',
          model: item.model,
          sizes: activeSizes,
          total,
          price: item.showPrice && item.price ? item.price : undefined,
          org: item.orgName,
          date: item.showDate !== false ? new Date().toISOString().slice(0, 10) : undefined
        });
      } else {
        codeUrl = await generateQrDataUrl({
          type: 'single',
          model: item.model,
          size: item.size || '41',
          quantity: 1,
          price: item.showPrice && item.price ? item.price : undefined,
          org: item.orgName
        });
      }
    }

    const singleHtml = buildSingleLabelHtml(item, codeUrl);
    for (let c = 0; c < copies; c++) {
      renderedLabelsHtml.push(singleHtml);
    }
  }

  const paper = items[0]?.paperFormat || 'thermal-80';
  const isA4 = paper === 'a4-sheet';

  // Create hidden iframe for printing
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.zIndex = '-9999';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    window.print();
    return;
  }

  const styles = `
    @page {
      margin: 0;
      size: ${isA4 ? 'A4 portrait' : paper === 'thermal-82x20' ? '82mm 20mm' : paper === 'thermal-58' ? '58mm auto' : '80mm auto'};
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      background: #fff;
      color: #000;
      ${isA4 ? 'padding: 8mm; display: flex; flex-wrap: wrap; gap: 4mm; justify-content: flex-start;' : 'display: flex; flex-direction: column; align-items: center;'}
    }
    .label-wrapper {
      ${isA4 ? 'width: calc(50% - 2mm); page-break-inside: avoid; break-inside: avoid; margin-bottom: 4mm;' : 'width: 100%; page-break-after: always; break-after: page; display: flex; justify-content: center; padding: 2mm 0;'}
    }
    .label-wrapper:last-child {
      page-break-after: avoid;
      break-after: avoid;
    }
    .label-box {
      border: 2px solid #000;
      border-radius: 8px;
      padding: 8px 10px;
      background: #fff;
      color: #000;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .thermal-80 .label-box {
      width: 74mm;
      min-height: 52mm;
    }
    .thermal-58 .label-box {
      width: 52mm;
      min-height: 38mm;
      padding: 5px 6px;
      border-radius: 6px;
    }
    .thermal-82x20 .label-box {
      width: 80mm;
      height: 18.5mm;
      min-height: 18.5mm;
      max-height: 18.5mm;
      padding: 1.5mm 2.5mm;
      border: 1.5px solid #000;
      border-radius: 4px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .a4-item .label-box {
      width: 100%;
      min-height: 48mm;
    }

    /* 82x20mm (20-82 mm) Horizontal Layout Classes */
    .label-82x20-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      height: 100%;
      gap: 2mm;
    }
    .label-82x20-left {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      justify-content: center;
      line-height: 1.15;
    }
    .label-82x20-brand {
      font-size: 7.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #555;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .label-82x20-model {
      font-size: 11px;
      font-weight: 900;
      text-transform: uppercase;
      color: #000;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin: 0.5px 0;
    }
    .label-82x20-meta {
      font-size: 8.5px;
      font-weight: 700;
      color: #222;
      display: flex;
      align-items: center;
      gap: 1.5mm;
      white-space: nowrap;
    }
    .label-82x20-badge {
      font-size: 7px;
      font-weight: 800;
      background: #eee;
      border: 0.8px solid #999;
      padding: 0.5px 3px;
      border-radius: 2px;
      text-transform: uppercase;
    }
    .label-82x20-matrix {
      font-size: 7.5px;
      font-family: monospace;
      font-weight: 700;
      color: #222;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .label-82x20-barcode {
      width: 44mm;
      height: 15mm;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .label-barcode-img-82x20 {
      max-width: 100%;
      max-height: 15mm;
      object-fit: contain;
    }
    .label-82x20-right {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      justify-content: center;
      flex-shrink: 0;
      line-height: 1.1;
    }
    .label-82x20-right-qr {
      display: flex;
      align-items: center;
      gap: 2mm;
      flex-shrink: 0;
    }
    .label-82x20-price-col {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      justify-content: center;
      line-height: 1.1;
    }
    .label-82x20-price {
      font-size: 8.5px;
      font-weight: 900;
      text-align: right;
      color: #000;
      white-space: nowrap;
    }
    .label-82x20-date {
      font-family: monospace;
      font-size: 7.5px;
      color: #666;
      margin-top: 1px;
    }
    .label-qr-82x20 {
      width: 15.5mm;
      height: 15.5mm;
      flex-shrink: 0;
      border: 0.8px solid #ccc;
      border-radius: 2px;
      padding: 0.5px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .label-qr-82x20 img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .label-header {
      border-bottom: 2px solid #000;
      padding-bottom: 3px;
      text-align: center;
    }
    .label-brand {
      font-size: 9px;
      font-weight: 900;
      letter-spacing: 1.5px;
      color: #555;
      text-transform: uppercase;
    }
    .label-model {
      font-size: 16px;
      font-weight: 900;
      text-transform: uppercase;
      line-height: 1.15;
      margin-top: 1px;
    }
    .thermal-58 .label-model {
      font-size: 13px;
    }
    .label-badge {
      display: inline-block;
      font-size: 8px;
      font-weight: 800;
      background: #eee;
      border: 1px solid #999;
      padding: 1px 4px;
      border-radius: 3px;
      margin-top: 2px;
      text-transform: uppercase;
    }
    .label-body {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 5px 0;
    }
    .label-qr {
      width: 68px;
      height: 68px;
      flex-shrink: 0;
      border: 1px solid #ccc;
      padding: 2px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .thermal-58 .label-qr {
      width: 52px;
      height: 52px;
    }
    .label-qr img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .label-barcode-body {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 4px 0;
      gap: 3px;
      width: 100%;
    }
    .label-size-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      padding: 0 4px;
    }
    .label-size-badge {
      font-size: 13px;
      font-weight: 800;
      color: #000;
    }
    .thermal-58 .label-size-badge {
      font-size: 11px;
    }
    .label-qty-badge {
      font-size: 10px;
      font-weight: 700;
      color: #666;
      background: #f0f0f0;
      padding: 1px 5px;
      border-radius: 3px;
    }
    .label-barcode-img-wrapper {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2px 0;
    }
    .label-barcode-img {
      max-width: 96%;
      height: 44px;
      object-fit: contain;
    }
    .thermal-58 .label-barcode-img {
      height: 34px;
    }
    .label-footer {
      border-top: 2px solid #000;
      padding-top: 3px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 9px;
      font-weight: 800;
    }
  `;

  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Yorliqlar Chop Etish</title>
        <style>${styles}</style>
      </head>
      <body>
        ${renderedLabelsHtml.join('')}
      </body>
    </html>
  `);
  doc.close();

  // Trigger print after resources load
  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      console.error('Print iframe error:', e);
    } finally {
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 2500);
    }
  }, 350);
}
