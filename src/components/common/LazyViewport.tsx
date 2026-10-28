import React, { useState, useEffect, useRef, ReactNode } from 'react';
import { BarChart3 } from 'lucide-react';
import { cn } from '../../lib/utils';

interface LazyViewportProps {
  children?: ReactNode;
  fallback?: ReactNode;
  fallbackHeight?: string | number;
  rootMargin?: string;
  threshold?: number;
  placeholderLabel?: string;
  className?: string;
  showSkeletonIcon?: boolean;
}

/**
 * High-performance Intersection Observer wrapper for heavy charts, widgets, and lists.
 * Only renders its children when the element enters (or is close to entering) the viewport.
 * Once mounted into view, it stays rendered to prevent costly re-initializations during scrolling.
 */
export const LazyViewport: React.FC<LazyViewportProps> = ({
  children,
  fallback,
  fallbackHeight = '280px',
  rootMargin = '250px 0px', // Pre-fetches 250px before entering viewport for instant perception
  threshold = 0.01,
  placeholderLabel = 'Grafik yuklanmoqda...',
  className = '',
  showSkeletonIcon = true
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // If IntersectionObserver is not available (e.g. older environments), show immediately
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          setIsVisible(true);
          // Once rendered, disconnect observer to save CPU & memory cycles
          if (containerRef.current) {
            observer.unobserve(containerRef.current);
          }
          observer.disconnect();
        }
      },
      {
        root: null, // viewport
        rootMargin,
        threshold
      }
    );

    const currentEl = containerRef.current;
    if (currentEl) {
      observer.observe(currentEl);
    }

    return () => {
      if (currentEl) {
        observer.unobserve(currentEl);
      }
      observer.disconnect();
    };
  }, [rootMargin, threshold]);

  const heightStyle = typeof fallbackHeight === 'number' ? `${fallbackHeight}px` : fallbackHeight;

  return (
    <div
      ref={containerRef}
      className={cn('relative w-full transition-opacity duration-300', className)}
      style={!isVisible ? { minHeight: heightStyle } : undefined}
    >
      {isVisible ? (
        children
      ) : fallback ? (
        fallback
      ) : (
        <div
          style={{ minHeight: heightStyle, height: heightStyle }}
          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg2)]/60 p-6 flex flex-col items-center justify-center gap-3 animate-pulse select-none text-[var(--text3)]"
        >
          {showSkeletonIcon && (
            <div className="w-12 h-12 rounded-xl bg-[var(--bg3)]/60 flex items-center justify-center text-[var(--text3)] border border-[var(--border)]">
              <BarChart3 className="w-6 h-6 animate-pulse opacity-60" />
            </div>
          )}
          <span className="text-xs font-semibold tracking-wide text-[var(--text3)]">
            {placeholderLabel}
          </span>
        </div>
      )}
    </div>
  );
};
