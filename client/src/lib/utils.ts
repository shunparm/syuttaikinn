import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// admin相当の権限（owner=社長はadminの上位互換）
export function isAdminRole(role?: string | null): boolean {
  return role === "admin" || role === "owner";
}
