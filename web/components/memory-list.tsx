"use client";

import { motion, useReducedMotion } from "motion/react";
import { MemoryCard, type Memory } from "@/components/memory-card";

export interface MemoryListProps {
  memories: Memory[];
  onEdit?: (id: string) => void;
  onForget?: (id: string) => void;
}

export function MemoryList({ memories, onEdit, onForget }: MemoryListProps) {
  const reduce = useReducedMotion();

  return (
    <ul className="space-y-3">
      {memories.map((memory, i) => (
        <motion.li
          key={memory.id}
          // memories surface up out of the well, then settle
          initial={reduce ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.45,
            delay: Math.min(i * 0.05, 0.4),
            ease: [0.16, 1, 0.3, 1],
          }}
        >
          <MemoryCard memory={memory} onEdit={onEdit} onForget={onForget} />
        </motion.li>
      ))}
    </ul>
  );
}
