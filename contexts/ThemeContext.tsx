// Copyright (c) 2026 Kunetz Szabolcs. All rights reserved.

import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface CustomColors {
  primary: string;
  secondary: string;
  accent: string;
  danger: string;
}

interface ParticipantColors {
  [participantId: string]: string;
}

interface ThemeContextType {
  customColors: CustomColors;
  setCustomColors: (colors: CustomColors) => void;
  resetColors: () => void;
  participantColors: ParticipantColors;
  setParticipantColor: (participantId: string, color: string) => void;
  getParticipantColor: (participantId: string) => string;
  resetParticipantColors: () => void;
}

const defaultColors: CustomColors = {
  primary: '#3B82F6',
  secondary: '#10B981',
  accent: '#F59E0B',
  danger: '#EF4444',
};

const defaultParticipantColors = [
  '#3B82F6', // Blue
  '#10B981', // Green
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#14B8A6', // Teal
  '#F97316', // Orange
];

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function CustomThemeProvider({ children }: { children: React.ReactNode }) {
  const [customColors, setCustomColorsState] = useState<CustomColors>(defaultColors);
  const [participantColors, setParticipantColorsState] = useState<ParticipantColors>({});

  useEffect(() => {
    // Load saved colors
    AsyncStorage.getItem('custom_colors').then((saved) => {
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setCustomColorsState(parsed);
        } catch (error) {
          console.error('Failed to parse saved colors:', error);
        }
      }
    });

    // Load saved participant colors
    AsyncStorage.getItem('participant_colors').then((saved) => {
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setParticipantColorsState(parsed);
        } catch (error) {
          console.error('Failed to parse saved participant colors:', error);
        }
      }
    });
  }, []);

  const setCustomColors = async (colors: CustomColors) => {
    setCustomColorsState(colors);
    await AsyncStorage.setItem('custom_colors', JSON.stringify(colors));
  };

  const resetColors = async () => {
    setCustomColorsState(defaultColors);
    await AsyncStorage.removeItem('custom_colors');
  };

  const setParticipantColor = async (participantId: string, color: string) => {
    const newColors = { ...participantColors, [participantId]: color };
    setParticipantColorsState(newColors);
    await AsyncStorage.setItem('participant_colors', JSON.stringify(newColors));
  };

  const getParticipantColor = (participantId: string): string => {
    if (participantColors[participantId]) {
      return participantColors[participantId];
    }
    
    // Assign a default color based on participant ID hash
    const colorIndex = participantId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % defaultParticipantColors.length;
    return defaultParticipantColors[colorIndex];
  };

  const resetParticipantColors = async () => {
    setParticipantColorsState({});
    await AsyncStorage.removeItem('participant_colors');
  };

  return (
    <ThemeContext.Provider value={{ 
      customColors, 
      setCustomColors, 
      resetColors,
      participantColors,
      setParticipantColor,
      getParticipantColor,
      resetParticipantColors,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useCustomTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useCustomTheme must be used within a CustomThemeProvider');
  }
  return context;
}
