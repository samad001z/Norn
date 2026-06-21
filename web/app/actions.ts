"use server";

import { forgetMemory, saveEmail } from "@/lib/store.server";

export async function forgetMemoryAction(id: string): Promise<void> {
  await forgetMemory(id);
}

export async function joinEarlyAccess(email: string): Promise<void> {
  const trimmed = email.trim();
  if (trimmed) await saveEmail(trimmed);
}
