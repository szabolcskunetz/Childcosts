// Copyright (c) 2026 Kunetz Szabolcs. All rights reserved.

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Dimensions,
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { useTheme } from '@react-navigation/native';
import { Href } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  interpolate,
} from 'react-native-reanimated';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLanguage } from '@/contexts/LanguageContext';

export interface TabBarItem {
  name: string;
  route: Href;
  icon: string;
  label: string;
}

interface FloatingTabBarProps {
  tabs: TabBarItem[];
  containerWidth?: number;
  borderRadius?: number;
  bottomMargin?: number;
}

export default function FloatingTabBar({
  tabs,
  containerWidth = Dimensions.get('window').width - 40,
  borderRadius = 25,
  bottomMargin = 20,
}: FloatingTabBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const theme = useTheme();
  const { t } = useLanguage();
  
  const activeIndex = tabs.findIndex((tab) => {
    if (tab.name === '(home)') {
      return pathname.startsWith('/(tabs)/(home)');
    }
    return pathname === tab.route || pathname.startsWith(`/(tabs)/${tab.name}`);
  });

  const translateX = useSharedValue(activeIndex >= 0 ? activeIndex : 0);

  React.useEffect(() => {
    if (activeIndex >= 0) {
      translateX.value = withSpring(activeIndex, {
        damping: 15,
        stiffness: 150,
      });
    }
  }, [activeIndex, translateX]);

  const animatedStyle = useAnimatedStyle(() => {
    const tabWidth = containerWidth / tabs.length;
    return {
      transform: [{ translateX: translateX.value * tabWidth }],
      width: tabWidth,
    };
  });

  const handleTabPress = (route: Href, index: number) => {
    console.log('Tab pressed:', route);
    translateX.value = withSpring(index, {
      damping: 15,
      stiffness: 150,
    });
    router.push(route);
  };

  const getTranslatedLabel = (label: string): string => {
    const labelMap: Record<string, string> = {
      'Projects': t('projects') || 'Projects',
      'Expenses': t('expenses'),
      'Balance': t('balance'),
      'Settings': t('settings'),
    };
    return labelMap[label] || label;
  };

  return (
    <SafeAreaView
      style={[styles.safeArea, { bottom: bottomMargin }]}
      edges={['bottom']}
    >
      <BlurView
        intensity={Platform.OS === 'ios' ? 80 : 100}
        tint={theme.dark ? 'dark' : 'light'}
        style={[
          styles.container,
          {
            width: containerWidth,
            borderRadius,
            backgroundColor: Platform.OS === 'ios'
              ? 'transparent'
              : theme.dark
              ? 'rgba(28, 28, 30, 0.9)'
              : 'rgba(255, 255, 255, 0.9)',
          },
        ]}
      >
        <Animated.View
          style={[
            styles.activeIndicator,
            {
              backgroundColor: theme.colors.primary,
              borderRadius: borderRadius - 5,
            },
            animatedStyle,
          ]}
        />

        {tabs.map((tab, index) => {
          const isActive = index === activeIndex;
          const translatedLabel = getTranslatedLabel(tab.label);

          return (
            <TouchableOpacity
              key={tab.name}
              style={styles.tab}
              onPress={() => handleTabPress(tab.route, index)}
              activeOpacity={0.7}
            >
              <IconSymbol
                ios_icon_name={tab.icon}
                android_material_icon_name={tab.icon}
                size={24}
                color={isActive ? '#fff' : theme.colors.text}
              />
              <Text
                style={[
                  styles.label,
                  {
                    color: isActive ? '#fff' : theme.colors.text,
                  },
                ]}
              >
                {translatedLabel}
              </Text>
            </TouchableOpacity>
          );
        })}
      </BlurView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1000,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 65,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    overflow: 'hidden',
  },
  activeIndicator: {
    position: 'absolute',
    height: 55,
    margin: 5,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    zIndex: 1,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
  },
});
