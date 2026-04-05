import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useEffect, useState, useRef } from 'react';
import * as SplashScreen from 'expo-splash-screen';

import { ThemeProvider, useThemeContext } from '@/context/theme-context';
import { KPIProvider } from '@/context/kpi-context';
import { ScrollToTopProvider } from '@/context/scroll-to-top-context';
import '@/lib/i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

SplashScreen.preventAutoHideAsync();

function AppContent() {
  const { isDark, colors } = useThemeContext();
  const segments = useSegments();
  const [hasCheckedSplash, setHasCheckedSplash] = useState(false);
  const [needsSplash, setNeedsSplash] = useState(false);

  useEffect(() => {
    async function checkFirstLaunch() {
      if (Platform.OS === 'web') {
        setNeedsSplash(false);
        setHasCheckedSplash(true);
        return;
      }
      try {
        const val = await AsyncStorage.getItem('@has_seen_splash');
        if (!val) {
          setNeedsSplash(true);
        }
      } catch (e) {}

      setHasCheckedSplash(true);
    }
    checkFirstLaunch();
  }, []);

  const splashHidden = useRef(false);

  useEffect(() => {
    if (!hasCheckedSplash) return;
    
    // Eğer splash'a gitmeliyse ve şu an splash'te değilsek
    const inSplash = segments[0] === 'splash';
    if (needsSplash && !inSplash) {
      setNeedsSplash(false); // Yönlendirip kilidi kır
      router.replace('/splash');
    }
    
    if (!splashHidden.current) {
      splashHidden.current = true;
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [hasCheckedSplash, needsSplash, segments]);

  const navTheme = isDark
    ? { ...DarkTheme, colors: { ...DarkTheme.colors, background: colors.background, card: colors.surface, text: colors.text, border: colors.border, primary: colors.accent } }
    : { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.background, card: colors.surface, text: colors.text, border: colors.border, primary: colors.accent } };

  return (
    <NavigationThemeProvider value={navTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="splash" options={{ gestureEnabled: false, animation: 'fade' }} />
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="entry-form" options={{ presentation: 'modal', headerShown: false }} />
      </Stack>
      <StatusBar style={colors.statusBar} />
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <KPIProvider>
        <ScrollToTopProvider>
          <AppContent />
        </ScrollToTopProvider>
      </KPIProvider>
    </ThemeProvider>
  );
}
