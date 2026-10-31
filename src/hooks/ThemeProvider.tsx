import React, { useContext, useEffect, useState } from "react";

interface ThemeContextValue {
  isDark: boolean;
  setIsDark: (isDark: boolean) => void;
}

export const ThemeContext = React.createContext<ThemeContextValue>({
  isDark: false,
  setIsDark: () => {},
});

/**
 * Holds the light/dark preference for the whole app. The preference is local to
 * this browser (localStorage), not a server-side user preference, and is applied
 * by toggling the `dark` class Tailwind keys off of (see darkMode:'class' in
 * tailwind.config.js).
 *
 * This lives at the root rather than in a single component because the control
 * that sets it (Display preferences on your profile) and the effect that applies
 * it are in different parts of the tree.
 */
const ThemeProvider: React.FC = ({ children }) => {
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("theme");
      if (saved == "dark") return true;
      if (saved == "light") return false;
      return (
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
      );
    } catch (error) {
      return false;
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      root.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDark]);

  // ensure cross-tab dark mode consistency
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "theme") {
        setIsDark(e.newValue === "dark");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <ThemeContext.Provider value={{ isDark, setIsDark }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);

export default ThemeProvider;
