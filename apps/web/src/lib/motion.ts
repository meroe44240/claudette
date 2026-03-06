import type { Variants, Transition } from 'framer-motion';

// Spring configurations
export const springs = {
  gentle: { type: 'spring' as const, stiffness: 150, damping: 20 },
  snappy: { type: 'spring' as const, stiffness: 300, damping: 25 },
  bouncy: { type: 'spring' as const, stiffness: 400, damping: 15 },
  smooth: { type: 'spring' as const, stiffness: 200, damping: 30 },
};

// Page transition variants
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 8, filter: 'blur(4px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  exit: { opacity: 0, y: -4, filter: 'blur(2px)' },
};

export const pageTransition: Transition = {
  type: 'spring',
  stiffness: 260,
  damping: 30,
};

// Staggered children container
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.02,
    },
  },
};

// Individual stagger item
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 300, damping: 24 },
  },
};

// Fade in from below
export const fadeInUp: Variants = {
  initial: { opacity: 0, y: 16 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 260, damping: 25 },
  },
};

// Scale entrance (modals, dropdowns)
export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.97 },
};

// Slide from right
export const slideInRight: Variants = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 12 },
};

// Sidebar collapse
export const sidebarVariants: Variants = {
  expanded: { width: 240, transition: springs.smooth },
  collapsed: { width: 72, transition: springs.smooth },
};

// Tooltip
export const tooltipVariants: Variants = {
  hidden: { opacity: 0, y: 4, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1 },
};

// Dropdown/select panel
export const dropdownVariants: Variants = {
  hidden: { opacity: 0, y: -4, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -4, scale: 0.98 },
};
