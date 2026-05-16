// Copyright (c) 2026 Kunetz Szabolcs. All rights reserved.

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@react-navigation/native';
import { GlassView } from 'expo-glass-effect';
import { IconSymbol } from '@/components/IconSymbol';
import { useLanguage, Language } from '@/contexts/LanguageContext';
import { useCustomTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'expo-router';
import Modal from '@/components/ui/Modal';
import { participantsApi, authApi, Participant } from '@/utils/api';
import { useProject } from '@/contexts/ProjectContext';

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { language, setLanguage, t } = useLanguage();
  const { customColors, setCustomColors, resetColors, setParticipantColor, getParticipantColor, resetParticipantColors } = useCustomTheme();
  const { user, signOut } = useAuth();
  const { activeProjectId } = useProject();
  
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showColorModal, setShowColorModal] = useState(false);
  const [editingColor, setEditingColor] = useState<'primary' | 'secondary' | 'accent' | 'danger' | null>(null);
  const [editingParticipant, setEditingParticipant] = useState<Participant | null>(null);
  const [successModal, setSuccessModal] = useState({ visible: false, message: '' });
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);
  const [showDeleteAccountFinalConfirm, setShowDeleteAccountFinalConfirm] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [errorModal, setErrorModal] = useState({ visible: false, message: '' });
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loadingParticipants, setLoadingParticipants] = useState(true);

  useEffect(() => {
    loadParticipants();
  }, [activeProjectId]);

  const loadParticipants = async () => {
    if (!activeProjectId) {
      setParticipants([]);
      setLoadingParticipants(false);
      return;
    }
    try {
      const data = await participantsApi.getAll(activeProjectId);
      setParticipants(data);
    } catch (error) {
      console.error('Failed to load participants:', error);
    } finally {
      setLoadingParticipants(false);
    }
  };

  const languages: { code: Language; name: string; flag: string }[] = [
    { code: 'en', name: 'English', flag: '🇬🇧' },
    { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
    { code: 'es', name: 'Español', flag: '🇪🇸' },
    { code: 'hu', name: 'Magyar', flag: '🇭🇺' },
  ];

  const colorPresets = [
    '#3B82F6', // Blue
    '#10B981', // Green
    '#F59E0B', // Amber
    '#EF4444', // Red
    '#8B5CF6', // Purple
    '#EC4899', // Pink
    '#06B6D4', // Cyan
    '#F97316', // Orange
    '#14B8A6', // Teal
    '#6366F1', // Indigo
  ];

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang);
    setShowLanguageModal(false);
  };

  const handleColorChange = (color: string) => {
    if (editingColor) {
      setCustomColors({
        ...customColors,
        [editingColor]: color,
      });
      setEditingColor(null);
      setShowColorModal(false);
    } else if (editingParticipant) {
      setParticipantColor(editingParticipant.id, color);
      setEditingParticipant(null);
      setShowColorModal(false);
      setSuccessModal({ visible: true, message: t('colorUpdated') });
    }
  };

  const handleResetColors = () => {
    resetColors();
    setSuccessModal({ visible: true, message: t('colorsReset') });
  };

  const handleLogout = async () => {
    try {
      console.log('User logging out');
      await signOut();
      setShowLogoutConfirm(false);
      setSuccessModal({ visible: true, message: t('logoutSuccess') });
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      console.log('User deleting account');
      await authApi.deleteAccount();
      // Clear local session after server-side deletion succeeds
      await signOut();
      setShowDeleteAccountFinalConfirm(false);
      setSuccessModal({ visible: true, message: t('accountDeleted') || 'Your account has been deleted.' });
    } catch (error: any) {
      console.error('Account deletion failed:', error);
      setShowDeleteAccountFinalConfirm(false);
      setErrorModal({ visible: true, message: error?.message || t('error') });
    } finally {
      setDeletingAccount(false);
    }
  };

  const currentLanguage = languages.find((l) => l.code === language);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>{t('settings')}</Text>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        {/* Authentication Section */}
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{t('account')}</Text>
        <Text style={[styles.sectionNote, { color: theme.dark ? '#98989D' : '#666' }]}>
          Authentication is optional. You can use the app without logging in.
        </Text>
        {user ? (
          <>
            <GlassView
              style={[styles.settingCard, Platform.OS !== 'ios' && { backgroundColor: theme.dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}
              glassEffectStyle="regular"
            >
              <View style={styles.settingRow}>
                <View style={styles.settingLeft}>
                  <IconSymbol ios_icon_name="person.circle.fill" android_material_icon_name="account-circle" size={24} color={customColors.primary} />
                  <View>
                    <Text style={[styles.settingLabel, { color: theme.colors.text }]}>{t('loggedInAs')}</Text>
                    <Text style={[styles.settingValue, { color: theme.dark ? '#98989D' : '#666' }]}>
                      {user.email || user.name}
                    </Text>
                  </View>
                </View>
              </View>
            </GlassView>
            <TouchableOpacity
              style={[styles.logoutButton, { backgroundColor: customColors.danger }]}
              onPress={() => setShowLogoutConfirm(true)}
            >
              <IconSymbol ios_icon_name="arrow.right.square" android_material_icon_name="logout" size={20} color="#fff" />
              <Text style={styles.logoutButtonText}>{t('logout')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.deleteAccountButton}
              onPress={() => setShowDeleteAccountConfirm(true)}
            >
              <IconSymbol ios_icon_name="trash" android_material_icon_name="delete-forever" size={18} color="#dc2626" />
              <Text style={styles.deleteAccountButtonText}>
                {t('deleteAccount') || 'Delete account'}
              </Text>
            </TouchableOpacity>
            <Text style={[styles.sectionNote, { color: theme.dark ? '#98989D' : '#666', marginTop: 4 }]}>
              {t('deleteAccountHint') ||
                'Permanently delete your account and all projects, participants, expenses, and settlements you created. This cannot be undone.'}
            </Text>
          </>
        ) : (
          <TouchableOpacity
            style={[styles.loginButton, { backgroundColor: customColors.primary }]}
            onPress={() => router.push('/auth')}
          >
            <IconSymbol ios_icon_name="person.badge.key" android_material_icon_name="login" size={20} color="#fff" />
            <Text style={styles.loginButtonText}>{t('login')}</Text>
          </TouchableOpacity>
        )}

        {/* Language Section */}
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{t('language')}</Text>
        <TouchableOpacity onPress={() => setShowLanguageModal(true)}>
          <GlassView
            style={[styles.settingCard, Platform.OS !== 'ios' && { backgroundColor: theme.dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}
            glassEffectStyle="regular"
          >
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <IconSymbol ios_icon_name="globe" android_material_icon_name="language" size={24} color={theme.colors.text} />
                <Text style={[styles.settingLabel, { color: theme.colors.text }]}>{t('language')}</Text>
              </View>
              <View style={styles.settingRight}>
                <Text style={[styles.settingValue, { color: theme.dark ? '#98989D' : '#666' }]}>
                  {currentLanguage?.flag} {currentLanguage?.name}
                </Text>
                <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={20} color={theme.dark ? '#98989D' : '#666'} />
              </View>
            </View>
          </GlassView>
        </TouchableOpacity>

        {/* Color Customization Section */}
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{t('colorCustomization')}</Text>
        
        <TouchableOpacity
          onPress={() => {
            setEditingColor('primary');
            setShowColorModal(true);
          }}
        >
          <GlassView
            style={[styles.settingCard, Platform.OS !== 'ios' && { backgroundColor: theme.dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}
            glassEffectStyle="regular"
          >
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <View style={[styles.colorPreview, { backgroundColor: customColors.primary }]} />
                <Text style={[styles.settingLabel, { color: theme.colors.text }]}>{t('primaryColor')}</Text>
              </View>
              <View style={styles.settingRight}>
                <Text style={[styles.settingValue, { color: theme.dark ? '#98989D' : '#666' }]}>
                  {customColors.primary}
                </Text>
                <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={20} color={theme.dark ? '#98989D' : '#666'} />
              </View>
            </View>
          </GlassView>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            setEditingColor('secondary');
            setShowColorModal(true);
          }}
        >
          <GlassView
            style={[styles.settingCard, Platform.OS !== 'ios' && { backgroundColor: theme.dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}
            glassEffectStyle="regular"
          >
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <View style={[styles.colorPreview, { backgroundColor: customColors.secondary }]} />
                <Text style={[styles.settingLabel, { color: theme.colors.text }]}>{t('secondaryColor')}</Text>
              </View>
              <View style={styles.settingRight}>
                <Text style={[styles.settingValue, { color: theme.dark ? '#98989D' : '#666' }]}>
                  {customColors.secondary}
                </Text>
                <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={20} color={theme.dark ? '#98989D' : '#666'} />
              </View>
            </View>
          </GlassView>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            setEditingColor('accent');
            setShowColorModal(true);
          }}
        >
          <GlassView
            style={[styles.settingCard, Platform.OS !== 'ios' && { backgroundColor: theme.dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}
            glassEffectStyle="regular"
          >
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <View style={[styles.colorPreview, { backgroundColor: customColors.accent }]} />
                <Text style={[styles.settingLabel, { color: theme.colors.text }]}>{t('accentColor')}</Text>
              </View>
              <View style={styles.settingRight}>
                <Text style={[styles.settingValue, { color: theme.dark ? '#98989D' : '#666' }]}>
                  {customColors.accent}
                </Text>
                <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={20} color={theme.dark ? '#98989D' : '#666'} />
              </View>
            </View>
          </GlassView>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            setEditingColor('danger');
            setShowColorModal(true);
          }}
        >
          <GlassView
            style={[styles.settingCard, Platform.OS !== 'ios' && { backgroundColor: theme.dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}
            glassEffectStyle="regular"
          >
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <View style={[styles.colorPreview, { backgroundColor: customColors.danger }]} />
                <Text style={[styles.settingLabel, { color: theme.colors.text }]}>{t('dangerColor')}</Text>
              </View>
              <View style={styles.settingRight}>
                <Text style={[styles.settingValue, { color: theme.dark ? '#98989D' : '#666' }]}>
                  {customColors.danger}
                </Text>
                <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={20} color={theme.dark ? '#98989D' : '#666'} />
              </View>
            </View>
          </GlassView>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.resetButton, { backgroundColor: theme.colors.notification }]}
          onPress={handleResetColors}
        >
          <IconSymbol ios_icon_name="arrow.counterclockwise" android_material_icon_name="refresh" size={20} color="#fff" />
          <Text style={styles.resetButtonText}>{t('resetColors')}</Text>
        </TouchableOpacity>

        {/* Participant Colors Section */}
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{t('participantColors')}</Text>
        {loadingParticipants ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={customColors.primary} />
          </View>
        ) : participants.length === 0 ? (
          <GlassView
            style={[styles.settingCard, Platform.OS !== 'ios' && { backgroundColor: theme.dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}
            glassEffectStyle="regular"
          >
            <Text style={[styles.emptyText, { color: theme.dark ? '#98989D' : '#666' }]}>
              {t('noParticipants')}
            </Text>
          </GlassView>
        ) : (
          <>
            {participants.map((participant) => {
              const participantColor = getParticipantColor(participant.id);
              return (
                <TouchableOpacity
                  key={participant.id}
                  onPress={() => {
                    setEditingParticipant(participant);
                    setShowColorModal(true);
                  }}
                >
                  <GlassView
                    style={[styles.settingCard, Platform.OS !== 'ios' && { backgroundColor: theme.dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}
                    glassEffectStyle="regular"
                  >
                    <View style={styles.settingRow}>
                      <View style={styles.settingLeft}>
                        <View style={[styles.colorPreview, { backgroundColor: participantColor }]} />
                        <Text style={[styles.settingLabel, { color: theme.colors.text }]}>
                          {participant.name}
                        </Text>
                      </View>
                      <View style={styles.settingRight}>
                        <Text style={[styles.settingValue, { color: theme.dark ? '#98989D' : '#666' }]}>
                          {participantColor}
                        </Text>
                        <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={20} color={theme.dark ? '#98989D' : '#666'} />
                      </View>
                    </View>
                  </GlassView>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={[styles.resetButton, { backgroundColor: theme.colors.notification }]}
              onPress={() => {
                resetParticipantColors();
                setSuccessModal({ visible: true, message: t('participantColorsReset') });
              }}
            >
              <IconSymbol ios_icon_name="arrow.counterclockwise" android_material_icon_name="refresh" size={20} color="#fff" />
              <Text style={styles.resetButtonText}>{t('resetParticipantColors')}</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* Language Selection Modal */}
      <Modal
        visible={showLanguageModal}
        onClose={() => setShowLanguageModal(false)}
        title={t('language')}
        type="custom"
      >
        <View style={styles.languageList}>
          {languages.map((lang) => (
            <TouchableOpacity
              key={lang.code}
              style={[
                styles.languageOption,
                { borderColor: theme.colors.border },
                language === lang.code && { backgroundColor: theme.colors.primary },
              ]}
              onPress={() => handleLanguageChange(lang.code)}
            >
              <Text style={styles.languageFlag}>{lang.flag}</Text>
              <Text
                style={[
                  styles.languageName,
                  { color: language === lang.code ? '#fff' : theme.colors.text },
                ]}
              >
                {lang.name}
              </Text>
              {language === lang.code && (
                <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={20} color="#fff" />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </Modal>

      {/* Color Picker Modal */}
      <Modal
        visible={showColorModal}
        onClose={() => {
          setShowColorModal(false);
          setEditingColor(null);
          setEditingParticipant(null);
        }}
        title={editingColor ? t(`${editingColor}Color`) : editingParticipant ? editingParticipant.name : ''}
        type="custom"
      >
        <View style={styles.colorGrid}>
          {colorPresets.map((color) => {
            const isSelected = editingColor 
              ? customColors[editingColor] === color 
              : editingParticipant 
                ? getParticipantColor(editingParticipant.id) === color
                : false;
            
            return (
              <TouchableOpacity
                key={color}
                style={[styles.colorOption, { backgroundColor: color }]}
                onPress={() => handleColorChange(color)}
              >
                {isSelected && (
                  <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={24} color="#fff" />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </Modal>

      {/* Logout Confirmation Modal */}
      <Modal
        visible={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        title={t('logout')}
        message={t('logoutConfirm')}
        type="confirm"
        confirmText={t('logout')}
        confirmColor={customColors.danger}
        onConfirm={handleLogout}
      />

      {/* Delete Account — first confirmation */}
      <Modal
        visible={showDeleteAccountConfirm}
        onClose={() => setShowDeleteAccountConfirm(false)}
        title={t('deleteAccount') || 'Delete account'}
        message={
          t('deleteAccountConfirm') ||
          'This will permanently delete your account and all data you created (projects, participants, expenses, settlements). This action cannot be undone. Continue?'
        }
        type="confirm"
        confirmText={t('continue') || 'Continue'}
        confirmColor="#dc2626"
        onConfirm={() => {
          setShowDeleteAccountConfirm(false);
          setShowDeleteAccountFinalConfirm(true);
        }}
      />

      {/* Delete Account — final confirmation */}
      <Modal
        visible={showDeleteAccountFinalConfirm}
        onClose={() => !deletingAccount && setShowDeleteAccountFinalConfirm(false)}
        title={t('deleteAccountFinalTitle') || 'Are you absolutely sure?'}
        message={
          t('deleteAccountFinalConfirm') ||
          'Your account and all associated data will be permanently deleted. This is irreversible.'
        }
        type="confirm"
        confirmText={deletingAccount ? (t('deleting') || 'Deleting…') : (t('deleteAccount') || 'Delete account')}
        confirmColor="#dc2626"
        onConfirm={handleDeleteAccount}
      />

      {/* Error Modal */}
      <Modal
        visible={errorModal.visible}
        onClose={() => setErrorModal({ visible: false, message: '' })}
        title={t('error')}
        message={errorModal.message}
        type="alert"
      />

      {/* Success Modal */}
      <Modal
        visible={successModal.visible}
        onClose={() => setSuccessModal({ visible: false, message: '' })}
        title={t('success')}
        message={successModal.message}
        confirmText={t('ok')}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 100,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
    marginTop: 8,
  },
  settingCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  settingValue: {
    fontSize: 14,
  },
  colorPreview: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 8,
  },
  resetButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    marginBottom: 16,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    marginBottom: 16,
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#dc2626',
    marginBottom: 6,
  },
  deleteAccountButtonText: {
    color: '#dc2626',
    fontSize: 15,
    fontWeight: '600',
  },
  languageList: {
    gap: 8,
  },
  languageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
  },
  languageFlag: {
    fontSize: 24,
  },
  languageName: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
  },
  colorOption: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
  sectionNote: {
    fontSize: 12,
    marginBottom: 8,
    fontStyle: 'italic',
  },
});
