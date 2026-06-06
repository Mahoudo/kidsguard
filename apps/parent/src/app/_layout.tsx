import { DarkTheme, DefaultTheme, ThemeProvider, type ErrorBoundaryProps } from 'expo-router';
import { ScrollView, Text, TouchableOpacity, useColorScheme, View } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';

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
        style={{ backgroundColor: '#6B4EE6', padding: 14, borderRadius: 999, alignItems: 'center' }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>Réessayer</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <AppTabs />
    </ThemeProvider>
  );
}
