import { useEffect, useRef } from 'react';
import { useMotionValue, useSpring, useTransform, motion } from 'framer-motion';

interface AnimatedCounterProps {
  value: number;
  className?: string;
  duration?: number;
  formatFn?: (n: number) => string;
}

export default function AnimatedCounter({
  value,
  className = '',
  duration = 1.5,
  formatFn,
}: AnimatedCounterProps) {
  const motionValue = useMotionValue(0);
  const springValue = useSpring(motionValue, {
    stiffness: 100,
    damping: 30,
    duration: duration * 1000,
  });
  const displayValue = useTransform(springValue, (latest) => {
    const rounded = Math.round(latest);
    return formatFn ? formatFn(rounded) : rounded.toLocaleString('fr-FR');
  });

  const prevRef = useRef(0);

  useEffect(() => {
    // Only animate if value actually changed
    if (value !== prevRef.current) {
      motionValue.set(value);
      prevRef.current = value;
    }
  }, [value, motionValue]);

  return <motion.span className={className}>{displayValue}</motion.span>;
}
