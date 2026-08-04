import { ButtonHTMLAttributes, forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

// DA HumanUp : navy #22177A + chartreuse #E6E9AF. Boutons cohérents partout.
const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-[#22177A] text-[#E6E9AF] shadow-[0_10px_22px_-14px_rgba(34,23,122,0.7)] hover:-translate-y-0.5 hover:shadow-[0_14px_26px_-14px_rgba(34,23,122,0.6)] active:scale-[0.97]',
  secondary: 'bg-white border-[1.5px] border-[rgba(34,23,122,0.2)] text-[#22177A] hover:bg-[#FCFCF5] hover:border-[#22177A] active:scale-[0.97]',
  ghost: 'text-[#22177A] hover:bg-[#F2F3D8] active:scale-[0.97]',
  danger: 'bg-[#F7DEDB] text-[#B3261E] hover:bg-[#F3CFC9] active:scale-[0.97]',
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
