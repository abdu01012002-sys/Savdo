import { useState, useCallback, useRef, useEffect } from 'react';

export interface UsePrintOptions {
  title?: string;
  pageSize?: 'A4' | 'A5' | 'thermal-80' | 'thermal-58' | 'auto';
  orientation?: 'portrait' | 'landscape';
  margin?: string;
  customStyles?: string;
  target?: 'iframe' | 'window';
  onBeforePrint?: () => void;
  onAfterPrint?: () => void;
  onError?: (error: Error) => void;
}

export interface UsePrintReturn {
  isPrinting: boolean;
  print: (target: HTMLElement | React.RefObject<HTMLElement | null> | string, options?: UsePrintOptions) => Promise<boolean>;
  printHtml: (htmlContent: string, options?: UsePrintOptions) => Promise<boolean>;
}

export function usePrint(defaultOptions: UsePrintOptions = {}): UsePrintReturn {
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const activeIframeRef = useRef<HTMLIFrameElement | null>(null);

  // Cleanup iframe on unmount
  useEffect(() => {
    return () => {
      if (activeIframeRef.current && document.body.contains(activeIframeRef.current)) {
        document.body.removeChild(activeIframeRef.current);
        activeIframeRef.current = null;
      }
    };
  }, []);

  const printHtml = useCallback(async (
    htmlContent: string,
    overrideOptions: UsePrintOptions = {}
  ): Promise<boolean> => {
    const opts: UsePrintOptions = {
      title: 'Hujjat va Faktura Chop Etish',
      pageSize: 'A4',
      orientation: 'portrait',
      margin: '8mm 10mm',
      target: 'iframe',
      ...defaultOptions,
      ...overrideOptions
    };

    setIsPrinting(true);
    opts.onBeforePrint?.();

    try {
      // 1. Collect all stylesheets, style tags, and CSS rules from main document
      const styleElements: string[] = [];
      
      // Grab <link rel="stylesheet"> elements
      document.querySelectorAll('link[rel="stylesheet"]').forEach(node => {
        styleElements.push(node.outerHTML);
      });

      // Grab existing <style> elements
      document.querySelectorAll('style').forEach(node => {
        styleElements.push(node.outerHTML);
      });

      // Extract rules from document.styleSheets (including Vite injected styles)
      try {
        const rulesList: string[] = [];
        for (let i = 0; i < document.styleSheets.length; i++) {
          const sheet = document.styleSheets[i];
          try {
            if (sheet.cssRules) {
              for (let j = 0; j < sheet.cssRules.length; j++) {
                rulesList.push(sheet.cssRules[j].cssText);
              }
            }
          } catch {
            // Cross-origin stylesheet security restrictions (safe to ignore)
          }
        }
        if (rulesList.length > 0) {
          styleElements.push(`<style type="text/css">\n${rulesList.join('\n')}\n</style>`);
        }
      } catch (sheetErr) {
        console.warn('[usePrint] Sheet rule extraction fallback:', sheetErr);
      }

      // 2. Define page format CSS
      const pageRule = opts.pageSize === 'thermal-80'
        ? '@page { size: 80mm auto; margin: 3mm 4mm; }'
        : opts.pageSize === 'thermal-58'
        ? '@page { size: 58mm auto; margin: 2mm 3mm; }'
        : opts.pageSize === 'A5'
        ? `@page { size: A5 ${opts.orientation}; margin: 6mm 8mm; }`
        : `@page { size: A4 ${opts.orientation}; margin: ${opts.margin}; }`;

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
          padding: ${opts.pageSize === 'thermal-80' || opts.pageSize === 'thermal-58' ? '2mm' : '0mm'} !important;
          width: 100% !important;
        }
        .no-print, [data-sonner-toaster], button:not(.print-keep) {
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
        #print-root {
          width: 100% !important;
          max-width: 100% !important;
        }
        ${opts.customStyles || ''}
      `;

      const fullHtmlDoc = `
        <!DOCTYPE html>
        <html lang="uz">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>${opts.title}</title>
            ${styleElements.join('\n')}
            <style>${printResetCss}</style>
          </head>
          <body>
            <div id="print-root">
              ${htmlContent}
            </div>
          </body>
        </html>
      `;

      if (opts.target === 'window') {
        try {
          // Open separate window for printing if allowed
          const win = window.open('', '_blank', 'width=850,height=900');
          if (win) {
            win.document.open();
            win.document.write(fullHtmlDoc);
            win.document.close();

            setTimeout(() => {
              win.focus();
              win.print();
              setIsPrinting(false);
              opts.onAfterPrint?.();
              win.close();
            }, 500);

            return true;
          }
        } catch (e) {
          console.warn("window.open blocked, falling back to hidden iframe:", e);
        }
      }
      
      {
        // Hidden isolated iframe method (default and reliable fallback)
        if (activeIframeRef.current && document.body.contains(activeIframeRef.current)) {
          document.body.removeChild(activeIframeRef.current);
          activeIframeRef.current = null;
        }

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
        activeIframeRef.current = iframe;

        const doc = iframe.contentWindow?.document;
        if (!doc) {
          throw new Error("Iframe hujjati yuklanmadi");
        }

        doc.open();
        doc.write(fullHtmlDoc);
        doc.close();

        return new Promise<boolean>((resolve) => {
          setTimeout(() => {
            try {
              iframe.contentWindow?.focus();
              iframe.contentWindow?.print();
              setIsPrinting(false);
              opts.onAfterPrint?.();
              resolve(true);
            } catch (err: any) {
              console.error('[usePrint] Error triggering print:', err);
              opts.onError?.(err);
              setIsPrinting(false);
              resolve(false);
            } finally {
              setTimeout(() => {
                if (activeIframeRef.current && document.body.contains(activeIframeRef.current)) {
                  document.body.removeChild(activeIframeRef.current);
                  activeIframeRef.current = null;
                }
              }, 2500);
            }
          }, 350);
        });
      }
    } catch (err: any) {
      console.error('[usePrint] Exception:', err);
      setIsPrinting(false);
      opts.onError?.(err);
      // Fallback
      window.print();
      return false;
    }
  }, [defaultOptions]);

  const print = useCallback(async (
    target: HTMLElement | React.RefObject<HTMLElement | null> | string,
    overrideOptions: UsePrintOptions = {}
  ): Promise<boolean> => {
    let element: HTMLElement | null = null;

    if (typeof target === 'string') {
      element = document.getElementById(target);
    } else if (target && 'current' in target) {
      element = target.current;
    } else if (target instanceof HTMLElement) {
      element = target;
    }

    if (!element) {
      console.error('[usePrint] Element topilmadi:', target);
      return false;
    }

    return printHtml(element.outerHTML, overrideOptions);
  }, [printHtml]);

  return {
    isPrinting,
    print,
    printHtml
  };
}
