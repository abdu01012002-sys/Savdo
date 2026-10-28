/**
 * Universal Isolated IFrame Print Utility for Invoices, Receipts, and Reports
 * Ensures 100% accurate printing without browser UI interference, background bleed, or missing CSS.
 */

export interface PrintOptions {
  title?: string;
  pageSize?: 'A4' | 'A5' | 'thermal-80' | 'thermal-58' | 'auto';
  orientation?: 'portrait' | 'landscape';
  margin?: string;
  customStyles?: string;
}

export function printElementById(elementId: string, options: PrintOptions = {}): boolean {
  const targetEl = document.getElementById(elementId);
  if (!targetEl) {
    console.error(`[printElementById] Element with ID "${elementId}" not found.`);
    // Fallback to standard window print
    window.print();
    return false;
  }

  return printHtmlContent(targetEl.outerHTML, options);
}

export function printHtmlContent(htmlContent: string, options: PrintOptions = {}): boolean {
  const {
    title = "Yuk Xati & Hisob Faktura",
    pageSize = 'A4',
    orientation = 'portrait',
    margin = '8mm 10mm',
    customStyles = ''
  } = options;

  try {
    // 1. Collect all stylesheets from main document
    const headStyles: string[] = [];
    document.querySelectorAll('link[rel="stylesheet"], style').forEach(node => {
      headStyles.push(node.outerHTML);
    });

    // 2. Create isolated printing iframe
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.zIndex = '-99999';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      window.print();
      return false;
    }

    // 3. Page size definition
    const pageRule = pageSize === 'thermal-80'
      ? '@page { size: 80mm auto; margin: 3mm 4mm; }'
      : pageSize === 'thermal-58'
      ? '@page { size: 58mm auto; margin: 2mm 3mm; }'
      : pageSize === 'A5'
      ? `@page { size: A5 ${orientation}; margin: 6mm 8mm; }`
      : `@page { size: A4 ${orientation}; margin: ${margin}; }`;

    const printResetCss = `
      ${pageRule}
      * {
        box-sizing: border-box !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      html, body {
        background-color: #ffffff !important;
        background: #ffffff !important;
        color: #000000 !important;
        margin: 0 !important;
        padding: 0 !important;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif !important;
        -webkit-font-smoothing: antialiased;
      }
      body {
        padding: ${pageSize === 'thermal-80' || pageSize === 'thermal-58' ? '2mm' : '4mm'} !important;
        width: 100% !important;
      }
      .no-print, [data-sonner-toaster], button {
        display: none !important;
      }
      table {
        border-collapse: collapse !important;
        width: 100% !important;
      }
      tr, td, th {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      ${customStyles}
    `;

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html lang="uz">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>${title}</title>
          ${headStyles.join('\n')}
          <style>${printResetCss}</style>
        </head>
        <body>
          <div id="print-container">
            ${htmlContent}
          </div>
        </body>
      </html>
    `);
    doc.close();

    // 4. Trigger print with safety timeout
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        console.error('Error invoking iframe print:', err);
        window.print();
      } finally {
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 3000);
      }
    }, 400);

    return true;
  } catch (err) {
    console.error('[printHtmlContent] Exception:', err);
    window.print();
    return false;
  }
}
