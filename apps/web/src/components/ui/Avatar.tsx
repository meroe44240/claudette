interface AvatarProps {
  src?: string | null;
  nom: string;
  prenom?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  ring?: boolean;
  status?: 'online' | 'away' | 'offline';
}

const sizeStyles = {
  xs: 'h-7 w-7 text-[11px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-xl',
};

const AVATAR_COLORS = [
  '#7C5CFC',
  '#10B981',
  '#F59E0B',
  '#3B82F6',
  '#EC4899',
  '#14B8A6',
  '#8B5CF6',
  '#EF4444',
];

function getColorFromName(nom: string, prenom?: string | null): string {
  const str = `${prenom || ''}${nom}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const statusColors: Record<string, string> = {
  online: '#10B981',
  away: '#F59E0B',
  offline: '#6B7194',
};

export default function Avatar({ src, nom, prenom, size = 'md', className = '', ring, status }: AvatarProps) {
  const initials = `${prenom?.[0] || ''}${nom[0]}`.toUpperCase();
  const bgColor = getColorFromName(nom, prenom);
  const ringClass = ring ? 'ring-2 ring-primary-500 ring-offset-2' : '';

  const statusDot = status ? (
    <span
      className="absolute bottom-0 right-0 block rounded-full border-2 border-white"
      style={{
        backgroundColor: statusColors[status],
        width: size === 'xs' || size === 'sm' ? 8 : size === 'md' ? 10 : 12,
        height: size === 'xs' || size === 'sm' ? 8 : size === 'md' ? 10 : 12,
      }}
    />
  ) : null;

  if (src) {
    return (
      <div className="relative inline-flex">
        <img src={src} alt={`${prenom || ''} ${nom}`} className={`rounded-full object-cover ${sizeStyles[size]} ${ringClass} ${className}`} />
        {statusDot}
      </div>
    );
  }

  return (
    <div className="relative inline-flex">
      <div
        className={`inline-flex items-center justify-center rounded-full font-semibold text-white ${sizeStyles[size]} ${ringClass} ${className}`}
        style={{ backgroundColor: bgColor }}
      >
        {initials}
      </div>
      {statusDot}
    </div>
  );
}
