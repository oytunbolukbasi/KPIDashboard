import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { useColorScheme as useNativeColorScheme } from 'react-native';
import { AppTheme, type ThemeColors } from '@/constants/theme';
import { Storage } from '@/lib/storage';

type ThemeContextType = {
  isDark: boolean;
  toggleTheme: () => void;
  colors: ThemeColors;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useNativeColorScheme();
  const [isDark, setIsDark] = useState(systemColorScheme === 'dark');

  useEffect(() => {
    try {
      const saved = Storage.getItem('theme');
      if (saved === 'dark' || saved === 'light') {
        setIsDark(saved === 'dark');
      } else {
        setIsDark(systemColorScheme === 'dark');
      }
    } catch {
      setIsDark(systemColorScheme === 'dark');
    }
  }, []);

  const toggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev;
      Storage.setItem('theme', next ? 'dark' : 'light');
      return next;
    });
  };

  const colors = useMemo(() => (isDark ? AppTheme.dark : AppTheme.light), [isDark]);

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme, colors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useThemeContext = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useThemeContext must be used within a ThemeProvider');
  return context;
};
