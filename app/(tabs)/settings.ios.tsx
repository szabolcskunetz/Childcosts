
import React from 'react';
import { Stack } from 'expo-router';
import SettingsScreen from './settings';

export default function SettingsScreenIOS() {
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Settings',
          headerLargeTitle: true,
        }}
      />
      <SettingsScreen />
    </>
  );
}
