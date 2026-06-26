"use server";

import { forgetMemory, resolveConflict, saveEmail } from "@/lib/store.server";

export async function forgetMemoryAction(id: string): Promise<void> {
  await forgetMemory(id);
}

/** "Keep both": dismiss a flagged conflict without deleting either memory. */
export async function resolveConflictAction(idA: string, idB: string): Promise<void> {
  await resolveConflict(idA, idB);
}

export async function joinEarlyAccess(email: string): Promise<void> {
  const trimmed = email.trim();
  if (trimmed) await saveEmail(trimmed);
}
