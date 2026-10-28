import React, { useRef, useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | 'full';
  className?: string;
  bodyClassName?: string;
  headerClassName?: string;
  footerClassName?: string;
  hideCloseButton?: boolean;
  closeOnBackdropClick?: boolean;
}

const maxWidthMap = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  full: 'max-w-[98vw]'
};

export const BottomSheetHandle: React.FC<{ className?: string }> = ({ className }) => (
  <div 
    className={cn(
      "w-12 h-1.5 bg-[var(--text3)]/30 hover:bg-[var(--text3)]/50 rounded-full mx-auto my-2.5 sm:hidden shrink-0 cursor-grab active:cursor-grabbing transition-colors",
      className
    )} 
    aria-hidden="true"
  />
);

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  maxWidth = 'lg',
  className,
  bodyClassName,
  headerClassName,
  footerClassName,
  hideCloseButton = false,
  closeOnBackdropClick = true
}) => {
  const touchStartY = useRef<number | null>(null);
  const touchStartX = useRef<number | null>(null);
  const [translateY, setTranslateY] = useState(0);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartY.current = touch.clientY;
    touchStartX.current = touch.clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current === null || touchStartX.current === null) return;
    const currentY = e.touches[0].clientY;
    const currentX = e.touches[0].clientX;
    const diffY = currentY - touchStartY.current;
    const diffX = Math.abs(currentX - touchStartX.current);

    // Only drag down if predominantly moving downward
    if (diffY > 0 && diffY > diffX) {
      setTranslateY(diffY);
    }
  };

  const handleTouchEnd = () => {
    if (translateY > 75) {
      onClose();
    }
    setTranslateY(0);
    touchStartY.current = null;
    touchStartX.current = null;
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 md:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto"
      onClick={(e) => {
        if (closeOnBackdropClick && e.target === e.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
    >
      <div 
        className={cn(
          "w-full bg-[var(--bg2)] border-t sm:border border-[var(--border)] rounded-t-[28px] sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden max-h-[92vh] sm:max-h-[85vh] mt-auto sm:my-auto animate-in slide-in-from-bottom-8 sm:zoom-in-95 duration-200 transition-transform",
          maxWidthMap[maxWidth] || 'max-w-lg',
          className
        )}
        style={translateY > 0 ? {
          transform: `translateY(${translateY}px)`,
          transition: 'none'
        } : {
          transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Swipe Handle for Mobile Drag-to-Dismiss */}
        <div 
          className="w-full pt-1 sm:hidden select-none touch-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <BottomSheetHandle />
        </div>

        {/* HEADER */}
        {(title || !hideCloseButton) && (
          <div 
            className={cn(
              "px-5 py-3.5 sm:px-6 sm:py-4 border-b border-[var(--border)] flex items-center justify-between gap-3 shrink-0 bg-[var(--bg2)] select-none",
              headerClassName
            )}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div className="flex items-center gap-3 min-w-0">
              {icon && (
                <div className="shrink-0">
                  {icon}
                </div>
              )}
              <div className="min-w-0">
                {title && (
                  <h3 className="text-base sm:text-lg font-black text-[var(--text)] truncate leading-tight">
                    {title}
                  </h3>
                )}
                {subtitle && (
                  <p className="text-xs text-[var(--text3)] truncate mt-0.5 font-medium">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>

            {!hideCloseButton && (
              <button
                type="button"
                onClick={onClose}
                className="p-2 -mr-1 rounded-xl text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--bg3)] active:scale-95 transition-all cursor-pointer shrink-0"
                title="Yopish"
                aria-label="Yopish"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* BODY */}
        <div className={cn(
          "p-4 sm:p-6 overflow-y-auto flex-1 overscroll-contain text-[var(--text)] pb-safe",
          bodyClassName
        )}>
          {children}
        </div>

        {/* FOOTER */}
        {footer && (
          <div className={cn(
            "px-5 py-3.5 sm:px-6 sm:py-4 border-t border-[var(--border)] bg-[var(--bg2)] shrink-0 pb-safe",
            footerClassName
          )}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
