type BadgeVariant =
  | 'default'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'primary'
  | 'teal'
  | 'indigo'
  | 'neutral'
  | 'sourcing'
  | 'contacte'
  | 'entretien1'
  | 'envoyeClient'
  | 'entretienClient'
  | 'offre'
  | 'place'
  | 'refuse';

type BadgeSize = 'sm' | 'md';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-[#f6f5fa] text-[#6e6a85] border border-[#eceaf2]',
  success: 'bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0]',
  warning: 'bg-[#FFF7ED] text-[#D97706] border border-[#FDE68A]',
  error: 'bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA]',
  info: 'bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]',
  primary: 'bg-[#f6f5fa] text-[#7C3AED] border border-[#DDD6FE]',
  teal: 'bg-[#F0FDFA] text-[#0D9488] border border-[#99F6E4]',
  indigo: 'bg-[#EEF2FF] text-[#4338CA] border border-[#C7D2FE]',
  neutral: 'bg-[#f6f5fa] text-[#6e6a85] border border-[#eceaf2]',
  sourcing: 'bg-stage-sourcing text-[#7C3AED] border border-[#DDD6FE]',
  contacte: 'bg-stage-contacte text-[#4b3fb0] border border-[#C4B5FD]',
  entretien1: 'bg-stage-entretien1 text-[#4338CA] border border-[#C7D2FE]',
  envoyeClient: 'bg-[#FFEDD5] text-[#C2410C] border border-[#FED7AA]',
  entretienClient: 'bg-stage-entretien-client text-[#D97706] border border-[#FDE68A]',
  offre: 'bg-stage-offre text-[#059669] border border-[#A7F3D0]',
  place: 'bg-stage-place text-white border border-[#059669]',
  refuse: 'bg-stage-refuse text-[#DC2626] border border-[#FECACA]',
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-[11px]',
  md: 'px-2.5 py-0.5 text-xs',
};

export default function Badge({ children, variant = 'default', size = 'md', className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}>
      {children}
    </span>
  );
}
