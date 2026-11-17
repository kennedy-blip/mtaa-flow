import type { Transition } from 'framer-motion';

/**
 * Shared Framer Motion physics spring configuration specified by architecture:
 * stiffness: 300, damping: 25
 */
export const SPRING_PHYSICS: Transition = {
  type: 'spring',
  stiffness: 300,
  damping: 25,
};

export const SPRING_SNAPPY: Transition = {
  type: 'spring',
  stiffness: 360,
  damping: 28,
};
