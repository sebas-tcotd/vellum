import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

/** Props for a one-time viewport reveal. */
interface RevealProps {
  as?: 'div' | 'li';
  children: ReactNode;
  className?: string;
  delay?: number;
}

/** Reveals a section once as it enters the viewport, with a static reduced-motion fallback. */
export function Reveal({
  as = 'div',
  children,
  className,
  delay = 0,
}: RevealProps) {
  const reduceMotion = useReducedMotion();
  const motionProps = {
    className,
    initial: reduceMotion ? false : { opacity: 0, y: 20 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.2 },
    transition: {
      duration: 0.55,
      delay,
      ease: [0.16, 1, 0.3, 1] as const,
    },
  };

  if (as === 'li') {
    return <motion.li {...motionProps}>{children}</motion.li>;
  }

  return <motion.div {...motionProps}>{children}</motion.div>;
}
