import { useEffect, useRef } from 'react';
import { ScanResult } from '../components/BarcodeScannerModal';
import { playScanBeep } from '../utils/audioFeedback';

interface UseBarcodeScannerOptions {
  onScan: (result: ScanResult) => void;
  enabled?: boolean;
  availableModels?: string[];
  maxIntervalMs?: number; // threshold between keystrokes to detect hardware scanners (usually 20-50ms)
}

export function useBarcodeScanner({
  onScan,
  enabled = true,
  availableModels = [],
  maxIntervalMs = 50
}: UseBarcodeScannerOptions) {
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when user is actively typing in input or textarea elements
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }

      const now = Date.now();
      const timeDiff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // If time between keystrokes is too long, reset the buffer
      if (timeDiff > maxIntervalMs && bufferRef.current.length > 0) {
        bufferRef.current = '';
      }

      // Enter key marks the end of scanner transmission
      if (e.key === 'Enter') {
        if (bufferRef.current.length >= 2) {
          const raw = bufferRef.current.trim();
          bufferRef.current = '';
          
          playScanBeep('success');

          // Parse raw text
          let parsedResult: ScanResult = {
            model: raw,
            quantity: 1,
            rawCode: raw,
            source: 'barcode'
          };

          if (raw.startsWith('{') && raw.endsWith('}')) {
            try {
              const json = JSON.parse(raw);
              if (json.model) {
                parsedResult = {
                  model: String(json.model).trim(),
                  size: json.size ? String(json.size).trim() : undefined,
                  quantity: json.quantity ? Number(json.quantity) : 1,
                  sizesObject: json.sizes && typeof json.sizes === 'object' ? json.sizes : undefined,
                  rawCode: raw,
                  source: 'qr'
                };
              }
            } catch (err) {}
          } else if (raw.includes('|') || raw.includes(':') || raw.includes('*')) {
            const del = raw.includes('|') ? '|' : raw.includes(':') ? ':' : '*';
            const parts = raw.split(del);
            const m = parts[0]?.trim();
            const s = parts[1]?.trim();
            const q = parts[2] ? parseInt(parts[2], 10) : 1;
            parsedResult = {
              model: availableModels.find(x => x.toLowerCase() === m.toLowerCase()) || m,
              size: s || undefined,
              quantity: !isNaN(q) && q > 0 ? q : 1,
              rawCode: raw,
              source: 'barcode'
            };
          } else {
            const matched = availableModels.find(x => x.toLowerCase() === raw.toLowerCase()) || raw;
            parsedResult = {
              model: matched,
              quantity: 1,
              rawCode: raw,
              source: 'barcode'
            };
          }

          onScan(parsedResult);
          e.preventDefault();
        }
        return;
      }

      // Collect printable characters
      if (e.key.length === 1) {
        bufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, onScan, availableModels, maxIntervalMs]);
}
