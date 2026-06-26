"use server";

import {
  addMemory,
  forgetMemory,
  resolveConflict,
  saveEmail,
  type UiMemory,
} from "@/lib/store.server";

export async function forgetMemoryAction(id: string): Promise<void> {
  await forgetMemory(id);
}

/** Add a memory from the dashboard composer. Returns the stored row. */
export async function addMemoryAction(input: {
  content: string;
  project: string | null;
  tags: string[];
}): Promise<UiMemory> {
  return addMemory(input);
}

/** "Keep both": dismiss a flagged conflict without deleting either memory. */
export async function resolveConflictAction(idA: string, idB: string): Promise<void> {
  await resolveConflict(idA, idB);
}

export async function joinEarlyAccess(email: string): Promise<void> {
  const trimmed = email.trim();
  if (trimmed) await saveEmail(trimmed);
}
