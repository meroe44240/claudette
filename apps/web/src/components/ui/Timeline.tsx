interface TimelineProps {
  children: React.ReactNode;
}

export default function Timeline({ children }: TimelineProps) {
  return <div className="space-y-0">{children}</div>;
}
