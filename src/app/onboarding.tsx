import React, { useRef, useState } from 'react';
import { View, StyleSheet, FlatList, Dimensions, TouchableOpacity, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { useOnboarding } from '@/context/onboarding-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');

const SLIDES = [
  { id: '1', key: 'title1', desc: 'desc1', emoji: '📊', gradient: ['#6C5CE7', '#341f97'] as [string, string] },
  { id: '2', key: 'title2', desc: 'desc2', emoji: '📈', gradient: ['#00B894', '#006266'] as [string, string] },
  { id: '3', key: 'title3', desc: 'desc3', emoji: '🚀', gradient: ['#0984E3', '#0652DD'] as [string, string] },
];

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const { setOnboardingCompleted } = useOnboarding();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const handleNext = async () => {
    if (activeIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: activeIndex + 1 });
    } else {
      await setOnboardingCompleted(true);
      router.replace('/(tabs)');
    }
  };

  const renderItem = ({ item }: { item: typeof SLIDES[0] }) => (
    <View style={styles.slide}>
      <LinearGradient colors={item.gradient} style={StyleSheet.absoluteFill} />
      <View style={styles.slideContent}>
        <Text style={styles.emoji}>{item.emoji}</Text>
        <Text style={styles.title}>{t(`onboarding.${item.key}`)}</Text>
        <Text style={styles.description}>{t(`onboarding.${item.desc}`)}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / width);
          setActiveIndex(index);
        }}
        keyExtractor={(item) => item.id}
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.pagination}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: i === activeIndex ? '#fff' : 'rgba(255,255,255,0.35)', width: i === activeIndex ? 24 : 8 },
              ]}
            />
          ))}
        </View>

        <TouchableOpacity style={styles.button} onPress={handleNext} activeOpacity={0.85}>
          <Text style={styles.buttonText}>
            {activeIndex === SLIDES.length - 1 ? t('onboarding.getStarted') : t('onboarding.next')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  slide: { width, height, justifyContent: 'center', alignItems: 'center' },
  slideContent: { alignItems: 'center', paddingHorizontal: 40 },
  emoji: { fontSize: 80, marginBottom: 32 },
  title: { color: '#fff', fontSize: 30, fontWeight: '800', textAlign: 'center', marginBottom: 14 },
  description: { color: 'rgba(255,255,255,0.8)', fontSize: 17, textAlign: 'center' },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  pagination: { flexDirection: 'row', marginBottom: 28, gap: 6 },
  dot: { height: 8, borderRadius: 4 },
  button: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
    width: '100%',
    paddingVertical: 18,
    borderRadius: 18,
    alignItems: 'center',
  },
  buttonText: { fontSize: 18, fontWeight: '700', color: '#fff' },
});
