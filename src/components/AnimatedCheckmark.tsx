import React from 'react';
import { motion } from 'framer-motion';
import { SPRING_PHYSICS } from '../utils/motion';

interface AnimatedCheckmarkProps {
  size?: number;
  label?: string;
  sublabel?: string;
}

export const AnimatedCheckmark: React.FC<AnimatedCheckmarkProps> = ({
  size = 64,
  label,
  sublabel,
}) => {
  return (
    <div className="flex flex-col items-center justify-center text-center py-3">
      <motion.div
        initial={{ scale: 0.35, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={SPRING_PHYSICS}
        style={{ width: size, height: size }}
        className="rounded-full mtaa-badge-profit flex items-center justify-center shadow-lg"
      >
        <svg
          width={size * 0.56}
          height={size * 0.56}
          viewBox="0 0 28 28"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <motion.path
            d="M6 14.5L11.5 20L22 8.5"
            stroke="currentColor"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="26"
            initial={{ strokeDashoffset: 26, opacity: 0 }}
            animate={{ strokeDashoffset: 0, opacity: 1 }}
            transition={{
              ...SPRING_PHYSICS,
              delay: 0.08,
            }}
          />
        </svg>
      </motion.div>

      {label && (
        <motion.h4
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING_PHYSICS, delay: 0.12 }}
          className="mt-3 text-base font-bold"
          style={{ color: 'var(--text-primary)' }}
        >
          {label}
        </motion.h4>
      )}
      {sublabel && (
        <motion.p
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING_PHYSICS, delay: 0.16 }}
          className="mt-1 text-xs max-w-xs"
          style={{ color: 'var(--text-secondary)' }}
        >
          {sublabel}
        </motion.p>
      )}
    </div>
  );
};
