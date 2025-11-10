import { useEffect, useState } from "react";

export function getLocalStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function setLocalStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore write errors (quota, privacy, etc.)
  }
}

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() =>
    getLocalStorage<T>(key, initialValue)
  );

  useEffect(() => {
    setLocalStorage<T>(key, value);
  }, [key, value]);

  return [value, setValue] as const;
}
