import type { GlobalProvider } from "@ladle/react";
import "../src/app/globals.css";

// Same document settings as src/app/layout.tsx: French content and the dark theme.
document.documentElement.lang = "fr";
document.documentElement.classList.add("dark");

/** Same frame as the application: dark surface and design tokens from globals.css. */
export const Provider: GlobalProvider = ({ children }) =>
  <div className="min-h-screen bg-background p-6 text-foreground antialiased">{children}</div>;
