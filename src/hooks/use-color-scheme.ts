import { useThemeContext } from '@/context/theme-context';

export function useColorScheme(): 'light' | 'dark' {
  const { isDark } = useThemeContext();
  return isDark ? 'dark' : 'light';
}
