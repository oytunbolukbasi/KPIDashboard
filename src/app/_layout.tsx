import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useEffect, useState, useRef } from 'react';
import * as SplashScreen from 'expo-splash-screen';

import { ThemeProvider, useThemeContext } from '@/context/theme-context';
import { OnboardingProvider, useOnboarding } from '@/context/onboarding-context';
import { KPIProvider } from '@/context/kpi-context';
import '@/lib/i18n';

SplashScreen.preventAutoHideAsync();

function AppContent() {
  const { onboardingCompleted } = useOnboarding();
  const { isDark, colors } = useThemeContext();
  const segments = useSegments();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setIsReady(true);
  }, []);

  const splashHidden = useRef(false);

  useEffect(() => {
    if (!isReady) return;
    const inOnboarding = segments[0] === 'onboarding';
    if (!onboardingCompleted && !inOnboarding) {
      router.replace('/onboarding');
    }
    if (!splashHidden.current) {
      splashHidden.current = true;
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [onboardingCompleted, segments, isReady]);

  const navTheme = isDark
    ? { ...DarkTheme, colors: { ...DarkTheme.colors, background: colors.background, card: colors.surface, text: colors.text, border: colors.border, primary: colors.accent } }
    : { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.background, card: colors.surface, text: colors.text, border: colors.border, primary: colors.accent } };

  return (
    <NavigationThemeProvider value={navTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
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
      <OnboardingProvider>
        <KPIProvider>
          <AppContent />
        </KPIProvider>
      </OnboardingProvider>
    </ThemeProvider>
  );
}
