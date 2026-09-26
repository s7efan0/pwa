import { useEffect, useState } from "react";
import { useTheme } from "@/lib/theme";

export type ChartTheme = {
  data: string;
  grid: string;
  ink: string;
  surface: string;
  border: string;
  text: string;
};

function readVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}

/**
 * Recharts takes colours as props, not classes, so it can't participate in
 * Tailwind's theming. Reading the same CSS custom properties keeps one source
 * of truth instead of a second hardcoded palette that silently drifts.
 */
export function useChartTheme(): ChartTheme {
  const { resolved } = useTheme();
  const [theme, setTheme] = useState<ChartTheme>(() => read());

  function read(): ChartTheme {
    return {
      data: readVar("--chart-1", "#2a78d6"),
      grid: readVar("--border", "#e4e4e7"),
      ink: readVar("--muted-foreground", "#5c5c5c"),
      surface: readVar("--popover", "#ffffff"),
      border: readVar("--border", "#e4e4e7"),
      text: readVar("--popover-foreground", "#0a0a0a"),
    };
  }

  useEffect(() => {
    // The class flip and the custom-property recalculation happen in the same
    // frame, so re-reading on the next tick gets the new values.
    const id = requestAnimationFrame(() => setTheme(read()));
    return () => cancelAnimationFrame(id);
  }, [resolved]);

  return theme;
}
