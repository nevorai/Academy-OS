// Theme engine — unchanged storage key, now supports "system".
// Storage: "light" | "dark" | "system". Default = "light" (nothing stored yet).

export type ThemeMode = "light" | "dark" | "system";

export const THEME_KEY = "acadaos.theme";

function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
  } catch {
    return false;
  }
}

export function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") return systemPrefersDark() ? "dark" : "light";
  return mode;
}

export function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  const resolved = resolveTheme(mode);
  if (resolved === "dark") el.classList.add("dark");
  else el.classList.remove("dark");
}

export function readStoredThemeMode(): ThemeMode {
  try {
    const s = localStorage.getItem(THEME_KEY);
    if (s === "light" || s === "dark" || s === "system") return s;
  } catch {
    /* ignore */
  }
  return "light";
}

export function setStoredThemeMode(mode: ThemeMode) {
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch {
    /* ignore */
  }
  applyTheme(mode);
}
