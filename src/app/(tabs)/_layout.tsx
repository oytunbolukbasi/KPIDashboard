import { StyleSheet } from 'react-native';
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';
import { useTranslation } from 'react-i18next';
import { usePathname } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef } from 'react';
import { useScrollToTopEmitter } from '@/context/scroll-to-top-context';

export default function TabLayout() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const prevPathname = useRef(pathname);
  const emit = useScrollToTopEmitter();
  const initialMount = useRef(true);

  useEffect(() => {
    if (initialMount.current) {
      initialMount.current = false;
      prevPathname.current = pathname;
      return;
    }

    if (pathname === prevPathname.current) {
      // Same tab tapped again → scroll to top
      const screenName = pathname === '/' ? 'index' : pathname.replace('/', '');
      emit(screenName);
    } else {
      Haptics.selectionAsync();
      prevPathname.current = pathname;
    }
  }, [pathname, emit]);

  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Label>{t('tabs.home')}</Label>
        <Icon sf="house" drawable="home" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="data">
        <Label>{t('tabs.data')}</Label>
        <Icon sf="list.dash" drawable="list" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <Label>{t('tabs.settings')}</Label>
        <Icon sf="gear" drawable="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

const styles = StyleSheet.create({});

