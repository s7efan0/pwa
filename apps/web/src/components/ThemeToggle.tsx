import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme, type Theme } from "@/lib/theme";

const ORDER: Theme[] = ["system", "light", "dark"];
const LABEL: Record<Theme, string> = {
  system: "Theme: follow system",
  light: "Theme: light",
  dark: "Theme: dark",
};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
  const Icon = theme === "system" ? Monitor : theme === "light" ? Sun : Moon;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(next)}
      // Announce current state and what activating will do — a bare icon
      // button is otherwise unlabelled for screen readers.
      aria-label={`${LABEL[theme]}. Activate for ${next}.`}
      title={LABEL[theme]}
      // 44px hit target on touch, tighter where there's a precise pointer.
      className="size-11 sm:size-9"
    >
      <Icon aria-hidden="true" />
    </Button>
  );
}
