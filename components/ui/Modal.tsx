// Copyright (c) 2026 Kunetz Szabolcs. All rights reserved.

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ScrollView,
} from 'react-native';
import RNModal from 'react-native-modal';
import { useTheme } from '@react-navigation/native';
import { BlurView } from 'expo-blur';

interface ModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  children?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  confirmColor?: string;
  type?: 'confirm' | 'alert' | 'custom';
}

export default function Modal({
  visible,
  onClose,
  title,
  message,
  children,
  confirmText = 'OK',
  cancelText = 'Cancel',
  onConfirm,
  confirmColor,
  type = 'alert',
}: ModalProps) {
  const theme = useTheme();

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm();
    }
    if (type !== 'custom') {
      onClose();
    }
  };

  return (
    <RNModal
      isVisible={visible}
      onBackdropPress={onClose}
      onBackButtonPress={onClose}
      animationIn="fadeIn"
      animationOut="fadeOut"
      backdropOpacity={0.5}
      useNativeDriver
      hideModalContentWhileAnimating
    >
      <View style={styles.centeredView}>
        {Platform.OS === 'ios' ? (
          <BlurView intensity={80} tint={theme.dark ? 'dark' : 'light'} style={styles.modalView}>
            <ModalContent
              theme={theme}
              title={title}
              message={message}
              type={type}
              confirmText={confirmText}
              cancelText={cancelText}
              onConfirm={handleConfirm}
              onClose={onClose}
              confirmColor={confirmColor}
            >
              {children}
            </ModalContent>
          </BlurView>
        ) : (
          <View style={[styles.modalView, { backgroundColor: theme.dark ? '#1c1c1e' : '#ffffff' }]}>
            <ModalContent
              theme={theme}
              title={title}
              message={message}
              type={type}
              confirmText={confirmText}
              cancelText={cancelText}
              onConfirm={handleConfirm}
              onClose={onClose}
              confirmColor={confirmColor}
            >
              {children}
            </ModalContent>
          </View>
        )}
      </View>
    </RNModal>
  );
}

function ModalContent({
  theme,
  title,
  message,
  children,
  type,
  confirmText,
  cancelText,
  onConfirm,
  onClose,
  confirmColor,
}: any) {
  // Check if message is long (more than 200 characters) to enable scrolling
  const isLongMessage = message && message.length > 200;
  
  // Use high contrast colors for text readability
  // Ensure text is always readable regardless of theme
  const titleColor = theme.dark ? '#FFFFFF' : '#000000';
  const messageColor = theme.dark ? '#FFFFFF' : '#000000'; // Changed from #E5E5EA to #FFFFFF for better contrast
  
  return (
    <>
      <Text style={[styles.modalTitle, { color: titleColor }]}>{title}</Text>
      
      {message && (
        <ScrollView 
          style={[styles.messageScrollView, isLongMessage && styles.messageScrollViewLong]}
          showsVerticalScrollIndicator={isLongMessage}
        >
          <Text style={[styles.modalMessage, { color: messageColor }]}>
            {message}
          </Text>
        </ScrollView>
      )}
      
      {children}
      
      <View style={styles.buttonContainer}>
        {(type === 'confirm' || type === 'custom') && (
          <TouchableOpacity
            style={[styles.button, styles.cancelButton, { borderColor: theme.colors.border }]}
            onPress={onClose}
          >
            <Text style={[styles.buttonText, { color: theme.dark ? '#FFFFFF' : '#000000' }]}>{cancelText}</Text>
          </TouchableOpacity>
        )}
        
        <TouchableOpacity
          style={[
            styles.button,
            styles.confirmButton,
            { backgroundColor: confirmColor || theme.colors.primary },
          ]}
          onPress={onConfirm}
        >
          <Text style={[styles.buttonText, { color: '#fff' }]}>{confirmText}</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalView: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    overflow: 'hidden',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  messageScrollView: {
    marginBottom: 20,
  },
  messageScrollViewLong: {
    maxHeight: 300,
  },
  modalMessage: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelButton: {
    borderWidth: 1,
  },
  confirmButton: {
    // backgroundColor set dynamically
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
