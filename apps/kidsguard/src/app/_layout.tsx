import { DarkTheme, DefaultTheme, ThemeProvider, type ErrorBoundaryProps } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { ScrollView, StatusBar, Text, TouchableOpacity, useColorScheme, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SplashScreen from 'expo-splash-screen';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { RoleChooser } from '@/components/role-chooser';
import { ChildAgent } from '@/child-agent';

const ROLE_KEY = 'kg_role';

// Catches any render/effect error in the app and shows it instead of crashing.
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={{ flex: 1, backgroundColor: '#fff', padding: 24, justifyContent: 'center' }}>
      <Text style={{ fontSize: 22, fontWeight: '800', color: '#1f2440', marginBottom: 10 }}>
        Oups, une erreur
      </Text>
      <ScrollView style={{ maxHeight: 260, marginBottom: 20 }}>
        <Text style={{ color: '#b91c1c', fontSize: 13 }}>{error.message}</Text>
      </ScrollView>
      <TouchableOpacity
        onPress={retry}
        style={{ backgroundColor: '#5B4BE3', padding: 14, borderRadius: 999, alignItems: 'center' }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>Réessayer</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  // role: undefined = still loading, null = not chosen yet, "parent" | "child" = chosen
  const [role, setRole] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    AsyncStorage.getItem(ROLE_KEY)
      .then((r) => setRole(r ?? null))
      .catch(() => setRole(null))
      .finally(() => SplashScreen.hideAsync().catch(() => {}));
  }, []);

  const choose = (r: 'parent' | 'child') => {
    AsyncStorage.setItem(ROLE_KEY, r).catch(() => {});
    setRole(r);
  };

  // SafeAreaProvider must wrap everything so SafeAreaView edges (e.g. the
  // Activité tab's top inset) get real values — without it insets are 0 and
  // content renders under the status bar (the "cut off" header bug).
  let content: ReactNode;
  if (role === undefined) content = <View style={{ flex: 1, backgroundColor: '#FFF6F0' }} />;
  else if (role === null) content = <RoleChooser onChoose={choose} />;
  else if (role === 'child') content = <ChildAgent />;
  else
    content = (
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        <AppTabs />
      </ThemeProvider>
    );

  // The window/root background defaults to BLACK, which shows through the
  // status-bar inset above each screen (the "black band" at the top). Paint the
  // root with the theme background so any uncovered area matches the UI.
  const rootBg = colorScheme === 'dark' ? '#0D0E1A' : '#F1F1FB';
  return (
    <SafeAreaProvider>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'}
      />
      <View style={{ flex: 1, backgroundColor: rootBg }}>{content}</View>
    </SafeAreaProvider>
  );
}
