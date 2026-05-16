// Copyright (c) 2026 Kunetz Szabolcs. All rights reserved.

import { StyleSheet } from 'react-native';

// ChildCosts Color Theme - Clean and professional for expense tracking
export const colors = {
  // Light theme
  background: '#F8F9FA',
  card: '#FFFFFF',
  text: '#1A1A1A',
  textSecondary: '#6B7280',
  primary: '#3B82F6', // Blue for primary actions
  secondary: '#10B981', // Green for positive balance
  accent: '#F59E0B', // Amber for warnings/highlights
  danger: '#EF4444', // Red for negative balance/delete
  border: '#E5E7EB',
  highlight: '#EFF6FF',
  
  // Dark theme
  backgroundDark: '#111827',
  cardDark: '#1F2937',
  textDark: '#F9FAFB',
  textSecondaryDark: '#9CA3AF',
  borderDark: '#374151',
  highlightDark: '#1E3A8A',
};

export const commonStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  spaceBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  wrapper: {
    backgroundColor: colors.background,
    width: '100%',
    height: '100%',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 800,
    width: '100%',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    color: colors.text,
    marginBottom: 10
  },
  text: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 8,
    lineHeight: 24,
    textAlign: 'center',
  },
  section: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  buttonContainer: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  icon: {
    width: 60,
    height: 60,
    tintColor: "white",
  },
});

export const buttonStyles = StyleSheet.create({
  instructionsButton: {
    backgroundColor: colors.primary,
    alignSelf: 'center',
    width: '100%',
  },
  backButton: {
    backgroundColor: colors.backgroundDark,
    alignSelf: 'center',
    width: '100%',
  },
});
