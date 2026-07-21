interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
  hover?: boolean;
}

export default function Card({ children, className = '', padding = true, hover = false }: CardProps) {
  return (
    <div
      className={`card-depth overflow-hidden ${hover ? 'cursor-pointer' : ''} ${padding ? 'p-6' : ''} ${className}`}
    >
      {children}
    </div>
  );
}
