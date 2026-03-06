import { ButtonHTMLAttributes, forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'gradient-btn text-white shadow-md shadow-primary-500/20 hover:shadow-lg hover:scale-[1.02] active:scale-[0.97]',
  secondary: 'bg-white border-[1.5px] border-neutral-100 text-neutral-700 hover:bg-neutral-50 hover:border-neutral-300 active:scale-[0.97]',
  ghost: 'text-primary-500 hover:bg-primary-50 active:scale-[0.97]',
  danger: 'bg-error-100 text-error hover:bg-[#FEE2E2] active:scale-[0.97]',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-2.5 text-base',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className = '', children, disabled, loading, ...props }, ref) => {
    const isDisabled = disabled || loading;
    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${variantStyles[variant]} ${sizeStyles[size]} ${loading ? 'opacity-80 cursor-not-allowed' : ''} ${className}`}
        disabled={isDisabled}
        {...props}
      >
        {loading && <Loader2 size={16} className="animate-spin" />}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
export default Button;
