// Copyright (c) 2026 Kunetz Szabolcs. All rights reserved.

import React from 'react';
import { Stack } from 'expo-router';
import FloatingTabBar, { TabBarItem } from '@/components/FloatingTabBar';

export default function TabLayout() {
  const tabs: TabBarItem[] = [
    {
      name: 'projects',
      route: '/(tabs)/projects',
      icon: 'folder',
      label: 'Projects',
    },
    {
      name: '(home)',
      route: '/(tabs)/(home)/',
      icon: 'receipt',
      label: 'Expenses',
    },
    {
      name: 'profile',
      route: '/(tabs)/profile',
      icon: 'people',
      label: 'Balance',
    },
    {
      name: 'settings',
      route: '/(tabs)/settings',
      icon: 'settings',
      label: 'Settings',
    },
  ];

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'none',
        }}
      >
        <Stack.Screen key="projects" name="projects" />
        <Stack.Screen key="home" name="(home)" />
        <Stack.Screen key="profile" name="profile" />
        <Stack.Screen key="settings" name="settings" />
      </Stack>
      <FloatingTabBar tabs={tabs} />
    </>
  );
}
