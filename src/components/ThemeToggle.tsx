import React from 'react';
import { motion } from 'framer-motion';
import { Sun, Moon, Terminal, Check } from 'lucide-react';
import type { ThemeMode } from '../db/db';
import { SPRING_PHYSICS } from '../utils/motion';

interface ThemeToggleProps {
  theme: ThemeMode;
  onChange: (next: ThemeMode) => void;
  variant?: 'compact' | 'cards';
}

export const THEME_OPTIONS: {
  id: ThemeMode;
  name: string;
  shortLabel: string;
  tagline: string;
  icon: React.FC<{ className?: string }>;
  previewBg: string;
  previewAccent: string;
}[] = [
  {
    id: 'savannah',
    name: 'Savannah Glass',
    shortLabel: 'Savannah',
    tagline: 'Clean frosted milk glass, slate shadows & vibrant emerald profit cues.',
    icon: Sun,
    previewBg: 'linear-gradient(135deg, #f8fafc 0%, #d1fae5 100%)',
    previewAccent: '#059669',
  },
  {
    id: 'midnight',
    name: 'Midnight Nairobi',
    shortLabel: 'Midnight',
    tagline: 'Deep obsidian (#0d0d12), neon teal accents & translucent acrylic cards.',
    icon: Moon,
    previewBg: 'linear-gradient(135deg, #0d0d12 0%, #134e4a 100%)',
    previewAccent: '#2dd4bf',
  },
  {
    id: 'amber',
    name: 'Terminal Amber',
    shortLabel: 'Amber',
    tagline: 'High-contrast retro ledger engineered for bright outdoor market sunlight.',
    icon: Terminal,
    previewBg: 'linear-gradient(135deg, #070500 0%, #451a03 100%)',
    previewAccent: '#ffb703',
  },
];

export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  theme,
  onChange,
  variant = 'compact',
}) => {
  if (variant === 'compact') {
    return (
      <div
        role="radiogroup"
        aria-label="Theme Mode"
        className="inline-flex items-center p-1 rounded-xl mtaa-surface-subtle backdrop-blur-xl"
      >
        {THEME_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = theme === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={active}
              title={`${opt.name} — ${opt.tagline}`}
              onClick={() => onChange(opt.id)}
              className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors"
              style={{
                color: active ? 'var(--accent-on-primary)' : 'var(--text-secondary)',
              }}
            >
              {active && (
                <motion.span
                  layoutId="mtaaThemeActivePill"
                  transition={SPRING_PHYSICS}
                  className="absolute inset-0 rounded-lg"
                  style={{
                    backgroundColor: 'var(--accent-primary)',
                  }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{opt.shortLabel}</span>
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
      {THEME_OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const active = theme === opt.id;
        return (
          <motion.button
            key={opt.id}
            type="button"
            whileTap={{ scale: 0.985 }}
            transition={SPRING_PHYSICS}
            onClick={() => onChange(opt.id)}
            className={`text-left p-4 rounded-2xl mtaa-glow-card backdrop-blur-xl transition-all ${
              active ? 'ring-2' : ''
            }`}
            style={{
              borderColor: active ? 'var(--accent-primary)' : 'var(--border-glass)',
              boxShadow: active ? '0 0 0 2px var(--accent-primary)' : undefined,
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center border border-white/20 shadow-inner"
                style={{ background: opt.previewBg }}
              >
                <span style={{ color: opt.previewAccent }}>
                  <Icon className="w-5 h-5" />
                </span>
              </div>

              {active ? (
                <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full mtaa-badge-accent">
                  <Check className="w-3.5 h-3.5" />
                  Active
                </span>
              ) : (
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded-full mtaa-surface-subtle"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Apply
                </span>
              )}
            </div>

            <div className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
              {opt.name}
            </div>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {opt.tagline}
            </p>
          </motion.button>
        );
      })}
    </div>
  );
};
