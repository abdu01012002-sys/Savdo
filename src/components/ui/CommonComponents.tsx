import React from 'react';
import { cn } from '../../lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'outline';
}

export const Button = ({ className, variant = 'primary', ...props }: ButtonProps) => {
  const baseClass = "px-4 py-2 rounded-xl font-semibold transition-all duration-200 active:scale-95 disabled:opacity-50";
  const variants = {
    primary: "bg-rose-500 text-white hover:bg-rose-600",
    secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200",
    danger: "bg-red-500 text-white hover:bg-red-600",
    outline: "border border-gray-300 text-gray-700 hover:bg-gray-50"
  };
  
  return <button className={cn(baseClass, variants[variant], className)} {...props} />;
};

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = ({ className, ...props }: InputProps) => {
  return (
    <input 
      className={cn("w-full px-3 py-2 rounded-xl border border-gray-300 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 outline-none transition-all", className)} 
      {...props} 
    />
  );
};

export { Modal } from './Modal';
export type { ModalProps } from './Modal';
export { BottomSheet, BottomSheetHandle } from './BottomSheet';
export type { BottomSheetProps } from './BottomSheet';

