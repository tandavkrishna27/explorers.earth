import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Maximize2, X } from 'lucide-react';
import DialogPanel from "../../../../components/ui/DialogPanel";

interface BentoCardProps {
  className?: string;
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}

export default function BentoCard({ className, children, title, subtitle }: BentoCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <motion.div
        whileHover={{ y: -3, boxShadow: '0 20px 56px -16px rgba(0,0,0,0.7)' }}
        transition={{ duration: 0.2 }}
        className={`relative overflow-hidden flex flex-col rounded-2xl border border-white/[0.06] bg-[#050507] shadow-xl group ${className || ''}`}
      >
        {/* ── In-card heading (top-left, matching SeaMaster style) ── */}
        {(title || subtitle) && (
          <div className="absolute top-0 left-0 right-0 z-10 px-4 pt-3.5 pb-3 pointer-events-none"
            style={{ background: 'linear-gradient(to bottom, rgba(5, 5, 7, 0.98) 70%, transparent)' }}>
            {title && (
              <h3 className="text-white text-sm font-bold leading-tight">{title}</h3>
            )}
            {subtitle && (
              <p className="text-gray-500 text-[10px] mt-0.5 leading-snug">{subtitle}</p>
            )}
          </div>
        )}

        {/* Content pushed down — pt-14 clears title + subtitle + padding stack */}
        <div className={`flex-1 flex flex-col overflow-hidden ${title ? (subtitle ? 'pt-14' : 'pt-11') : ''}`}>
          {children}
        </div>

        {/* Expand button — top-right corner */}
        <button
          onClick={() => setExpanded(true)}
          className="absolute top-3 right-3 z-30 w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-gray-500 opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-white/15 hover:text-white hover:border-white/25 hover:scale-110"
          title="Enlarge"
        >
          <Maximize2 size={11} strokeWidth={2} />
        </button>
      </motion.div>

      {/* ── Expanded modal overlay ── */}
      <AnimatePresence>
        {expanded && (
          <DialogPanel onClose={() => setExpanded(false)}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 md:p-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Backdrop */}
            <motion.div
              className="absolute inset-0 bg-black/85 backdrop-blur-lg"
              onClick={() => setExpanded(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />

            {/* Enlarged card */}
            <motion.div
              className="relative z-10 w-full max-w-xl rounded-2xl border border-white/10 bg-[#050507] shadow-2xl overflow-hidden flex flex-col"
              style={{ height: 'min(82vh, 700px)' }}
              initial={{ scale: 0.88, opacity: 0, y: 28 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.88, opacity: 0, y: 28 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            >
              {/* Modal header bar */}
              <div className="flex items-start justify-between px-5 py-4 shrink-0 border-b border-white/5 bg-[#050507]">
                <div>
                  {title && <h3 className="text-white text-sm font-bold">{title}</h3>}
                  {subtitle && <p className="text-gray-500 text-[10px] mt-0.5">{subtitle}</p>}
                </div>
                <button
                  onClick={() => setExpanded(false)}
                  className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:bg-white/15 hover:text-white transition-all ml-4 shrink-0 mt-0.5"
                >
                  <X size={12} />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-hidden flex flex-col">
                {children}
              </div>
            </motion.div>
          </DialogPanel>
        )}
      </AnimatePresence>
    </>
  );
}
