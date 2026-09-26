import { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyTheme,
  readStoredTheme,
  resolveTheme,
  THEME_STORAGE_KEY,
  ThemeContext,
  type Theme,
} from "@/lib/theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Read synchronously during init — an effect would render one frame with
  // the wrong theme. The inline script in index.html has already set the
  // class before paint; this keeps React's state agreeing with the DOM.
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme());
  const [resolved, setResolved] = useState(() => resolveTheme(theme));

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private mode — the theme just won't persist.
    }
    const r = resolveTheme(next);
    setResolved(r);
    applyTheme(r);
  }, []);

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const r = mq.matches ? "dark" : "light";
      setResolved(r);
      applyTheme(r);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const value = useMemo(
    () => ({ theme, resolved, setTheme }),
    [theme, resolved, setTheme],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}
