import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  iconColor?: string;
  iconBg?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | 'full';
  className?: string;
  bodyClassName?: string;
  headerClassName?: string;
  footerClassName?: string;
  hideCloseButton?: boolean;
  closeOnBackdropClick?: boolean;
  closeOnEscape?: boolean;
}

const maxWidthMap = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
  full: 'max-w-[96vw]'
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon: Icon,
  iconColor = 'text-blue-600 dark:text-blue-400',
  iconBg = 'bg-blue-500/10',
  children,
  footer,
  maxWidth = 'lg',
  className,
  bodyClassName,
  headerClassName,
  footerClassName,
  hideCloseButton = false,
  closeOnBackdropClick = true,
  closeOnEscape = true
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number | null>(null);
  const touchStartX = useRef<number | null>(null);
  const [translateY, setTranslateY] = useState(0);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (closeOnEscape && e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    // Lock body scroll when modal is open
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, closeOnEscape, onClose]);

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
        ref={modalRef}
        className={cn(
          "w-full bg-[var(--bg2)] border-t sm:border border-[var(--border)] rounded-t-[28px] sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[92vh] sm:max-h-[85vh] mt-auto sm:my-auto animate-in slide-in-from-bottom-8 sm:zoom-in-95 duration-200 transition-transform",
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
          <div className="w-12 h-1.5 bg-[var(--text3)]/30 rounded-full mx-auto my-2 shrink-0 cursor-grab active:cursor-grabbing" />
        </div>

        {/* MODAL HEADER (Fixed at top) */}
        {(title || !hideCloseButton) && (
          <div 
            className={cn(
              "px-5 py-3.5 sm:px-6 sm:py-4.5 border-b border-[var(--border)] flex items-center justify-between gap-3 shrink-0 bg-[var(--bg2)] select-none",
              headerClassName
            )}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div className="flex items-center gap-3 min-w-0">
              {Icon && (
                <div className={cn("w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 border border-current/10 shadow-2xs", iconBg, iconColor)}>
                  <Icon className="w-5 h-5" />
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
                title="Yopish (ESC)"
                aria-label="Yopish"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* MODAL BODY (Scrollable with max-h and custom scroll) */}
        <div className={cn(
          "p-5 sm:p-6 overflow-y-auto flex-1 overscroll-contain text-[var(--text)]",
          bodyClassName
        )}>
          {children}
        </div>

        {/* MODAL FOOTER (Pinned / Sticky at bottom) */}
        {footer && (
          <div className={cn(
            "px-5 py-3.5 sm:px-6 sm:py-4 border-t border-[var(--border)] bg-[var(--bg)] flex items-center justify-end gap-2.5 sm:gap-3 shrink-0 sticky bottom-0 z-10",
            footerClassName
          )}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
