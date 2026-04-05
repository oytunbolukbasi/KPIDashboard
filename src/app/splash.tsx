import React, { useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { router } from 'expo-router';
import { useThemeContext } from '@/context/theme-context';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function SplashScreen() {
  const { colors } = useThemeContext();

  useEffect(() => {
    const timer = setTimeout(async () => {
      // Appin splashini gosterdigini isaretle
      await AsyncStorage.setItem('@has_seen_splash', 'true');
      router.replace('/(tabs)');
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Image
        source={require('../../assets/images/icon.png')}
        style={styles.logo}
        contentFit="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 200,
    height: 200,
    borderRadius: 40,
  },
});
