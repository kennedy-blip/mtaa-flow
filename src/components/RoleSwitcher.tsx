import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, UserCheck, Lock, X, KeyRound } from 'lucide-react';
import type { UserRole } from '../db/db';
import { SPRING_PHYSICS } from '../utils/motion';

interface RoleSwitcherProps {
  role: UserRole;
  onChangeRole: (nextRole: UserRole) => void;
  requirePinForOwner?: boolean;
  ownerPin?: string;
  compact?: boolean;
}

export const RoleSwitcher: React.FC<RoleSwitcherProps> = ({
  role,
  onChangeRole,
  requirePinForOwner = false,
  ownerPin = '2580',
  compact = false,
}) => {
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState('');

  const handleSelectRole = (target: UserRole) => {
    if (target === role) return;
    if (target === 'owner' && requirePinForOwner) {
      setEnteredPin('');
      setPinError('');
      setPinModalOpen(true);
      return;
    }
    onChangeRole(target);
  };

  const handleVerifyPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (enteredPin.trim() === ownerPin.trim()) {
      setPinModalOpen(false);
      setEnteredPin('');
      setPinError('');
      onChangeRole('owner');
    } else {
      setPinError('Incorrect Owner PIN. Default PIN is 2580 unless changed.');
    }
  };

  return (
    <>
      <div
        role="group"
        aria-label="Active User Privilege Role"
        className="inline-flex items-center p-1 rounded-xl mtaa-surface-subtle backdrop-blur-xl"
      >
        <button
          type="button"
          onClick={() => handleSelectRole('owner')}
          className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors"
          style={{
            color: role === 'owner' ? 'var(--accent-on-primary)' : 'var(--text-secondary)',
          }}
          title="Merchant Owner (Admin): Full profit visibility, pricing edits, record deletion & backups"
        >
          {role === 'owner' && (
            <motion.span
              layoutId={compact ? 'rolePillCompact' : 'rolePillHeader'}
              transition={SPRING_PHYSICS}
              className="absolute inset-0 rounded-lg"
              style={{ backgroundColor: 'var(--accent-primary)' }}
            />
          )}
          <span className="relative z-10 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{compact ? 'Owner' : 'Owner (Admin)'}</span>
            {role !== 'owner' && requirePinForOwner && <Lock className="w-3 h-3 opacity-75" />}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleSelectRole('staff')}
          className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors"
          style={{
            color: role === 'staff' ? 'var(--accent-on-primary)' : 'var(--text-secondary)',
          }}
          title="Shop Attendant (Staff): Restricted to logging sales, checking credit balances & restocking"
        >
          {role === 'staff' && (
            <motion.span
              layoutId={compact ? 'rolePillCompact' : 'rolePillHeader'}
              transition={SPRING_PHYSICS}
              className="absolute inset-0 rounded-lg"
              style={{ backgroundColor: 'var(--accent-primary)' }}
            />
          )}
          <span className="relative z-10 flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5" />
            <span>{compact ? 'Staff' : 'Attendant (Staff)'}</span>
          </span>
        </button>
      </div>

      <AnimatePresence>
        {pinModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'var(--bg-modal-backdrop)' }}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 8 }}
              transition={SPRING_PHYSICS}
              className="w-full max-w-sm rounded-2xl p-5 mtaa-glass-elevated backdrop-blur-xl border border-white/20"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl mtaa-badge-accent flex items-center justify-center">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                      Owner Admin Unlock
                    </h3>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      Enter 4-digit PIN to view margins & admin controls
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPinModalOpen(false)}
                  className="p-1.5 rounded-lg mtaa-surface-subtle"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleVerifyPin} className="space-y-3 mt-4">
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  autoFocus
                  value={enteredPin}
                  onChange={(e) => {
                    setEnteredPin(e.target.value);
                    setPinError('');
                  }}
                  placeholder="Enter Owner PIN"
                  className="mtaa-input text-center text-lg tracking-[0.35em] font-mono tabular-ledger"
                />
                {pinError && (
                  <p className="text-xs font-medium" style={{ color: 'var(--danger-text)' }}>
                    {pinError}
                  </p>
                )}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setPinModalOpen(false)}
                    className="mtaa-btn-secondary text-xs"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="mtaa-btn-primary text-xs">
                    Unlock Owner Mode
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
