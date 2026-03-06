interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
  hover?: boolean;
}

export default function Card({ children, className = '', padding = true, hover = false }: CardProps) {
  return (
    <div
      className={`rounded-2xl bg-white border border-black/[0.06] shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.06)] overflow-hidden ${hover ? 'transition-all duration-300 ease-out hover:shadow-[0_10px_40px_rgba(0,0,0,0.08)] hover:-translate-y-1 cursor-pointer' : ''} ${padding ? 'p-6' : ''} ${className}`}
    >
      {children}
    </div>
  );
}
