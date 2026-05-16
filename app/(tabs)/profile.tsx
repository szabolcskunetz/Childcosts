// Copyright (c) 2026 Kunetz Szabolcs. All rights reserved.

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@react-navigation/native";
import { GlassView } from "expo-glass-effect";
import { IconSymbol } from "@/components/IconSymbol";
import { participantsApi, settlementsApi, BalanceResponse, Settlement, Participant } from "@/utils/api";
import Modal from "@/components/ui/Modal";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCustomTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { useProject } from "@/contexts/ProjectContext";

export default function BalanceScreen() {
  const theme = useTheme();
  const { t } = useLanguage();
  const { customColors } = useCustomTheme();
  const { user } = useAuth();
  const { activeProjectId } = useProject();
  const [balance, setBalance] = useState<BalanceResponse | null>(null);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorModal, setErrorModal] = useState({ visible: false, message: "" });
  const [successModal, setSuccessModal] = useState({ visible: false, message: "" });
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteSettlementConfirm, setShowDeleteSettlementConfirm] = useState(false);
  const [showDeleteParticipantConfirm, setShowDeleteParticipantConfirm] = useState(false);
  const [editingParticipant, setEditingParticipant] = useState<Participant | null>(null);
  const [selectedSettlement, setSelectedSettlement] = useState<Settlement | null>(null);
  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null);
  const [editName, setEditName] = useState("");

  const loadData = useCallback(async () => {
    if (!activeProjectId) {
      setBalance(null);
      setSettlements([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const [balanceData, settlementsData] = await Promise.all([
        participantsApi.getBalance(activeProjectId),
        settlementsApi.getAll(activeProjectId),
      ]);
      
      console.log('[Balance] Balance data received:', balanceData);
      console.log('[Balance] Who owes whom:', balanceData.whoOwesWhom);
      console.log('[Balance] Participants:', balanceData.participants);
      setBalance(balanceData);
      setSettlements(settlementsData);
    } catch (error: any) {
      console.error('[Balance] Failed to load balance:', error);
      setErrorModal({ visible: true, message: error.message || t('error') });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t, activeProjectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const handleEditParticipant = (participant: Participant) => {
    console.log('[Participant] User tapped edit participant button');
    setEditingParticipant(participant);
    setEditName(participant.name);
    setShowEditModal(true);
  };

  const handleUpdateParticipant = async () => {
    if (!editingParticipant || !editName.trim()) {
      setErrorModal({ visible: true, message: t('fillAllFields') });
      return;
    }

    try {
      console.log('[Participant] Updating participant:', editingParticipant.id, editName);
      await participantsApi.update(editingParticipant.id, editName);
      setSuccessModal({ visible: true, message: t('participantUpdated') });
      setShowEditModal(false);
      setEditingParticipant(null);
      setEditName("");
      loadData();
    } catch (error: any) {
      console.error('[Participant] Failed to update participant:', error);
      setErrorModal({ visible: true, message: error.message || t('error') });
    }
  };

  const handleDeleteSettlement = async () => {
    if (!selectedSettlement) {
      return;
    }

    try {
      console.log('[Settlement] Deleting settlement:', selectedSettlement.id);
      await settlementsApi.delete(selectedSettlement.id);
      setSuccessModal({ visible: true, message: t('settlementDeleted') });
      setShowDeleteSettlementConfirm(false);
      setSelectedSettlement(null);
      loadData();
    } catch (error: any) {
      console.error('[Settlement] Failed to delete settlement:', error);
      setErrorModal({ visible: true, message: error.message || t('failedToDeleteSettlement') });
    }
  };

  const handleDeleteParticipant = async () => {
    if (!selectedParticipant) {
      return;
    }

    try {
      console.log('[Participant] User tapped delete participant button');
      console.log('[Participant] Deleting participant:', selectedParticipant.id);
      
      // Use current user's ID for ownership verification
      // If the participant has a createdBy field, only the creator can delete it
      // If createdBy is null (legacy participants), anyone can delete
      const currentUserId = user?.id;
      
      // Pass the current user's ID for ownership verification
      await participantsApi.delete(selectedParticipant.id, currentUserId);
      
      setSuccessModal({ visible: true, message: t('participantDeleted') });
      setShowDeleteParticipantConfirm(false);
      setSelectedParticipant(null);
      loadData();
    } catch (error: any) {
      console.error('[Participant] Failed to delete participant:', error);
      // Check if it's an authorization error
      if (error.message?.includes('403') || error.message?.includes('Unauthorized')) {
        setErrorModal({ 
          visible: true, 
          message: t('unauthorizedDeleteParticipant') || 'Only the creator can delete this participant' 
        });
      } else {
        setErrorModal({ visible: true, message: error.message || t('failedToDeleteParticipant') });
      }
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={customColors.primary} />
      </View>
    );
  }

  // Handle both array, single object, and null formats for whoOwesWhom
  // The backend now returns netted debts (only showing net amount owed between parties)
  // Returns null when there are no debts
  const debts = balance?.whoOwesWhom 
    ? (Array.isArray(balance.whoOwesWhom) ? balance.whoOwesWhom : [balance.whoOwesWhom])
    : [];
  
  const hasDebts = debts.length > 0;
  
  console.log('[Balance] Rendering with debts:', debts, 'hasDebts:', hasDebts);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>{t('balance')}</Text>
        <TouchableOpacity 
          onPress={onRefresh} 
          style={styles.headerButton}
          accessibilityLabel={t('refresh')}
        >
          <IconSymbol ios_icon_name="arrow.clockwise" android_material_icon_name="refresh" size={24} color={customColors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {hasDebts ? (
          <View>
            <Text style={[styles.sectionTitle, { color: theme.colors.text, marginBottom: 12 }]}>
              {t('whoOwesWhom') || 'Who Owes Whom'}
            </Text>
            {debts.map((debt, index) => {
              const fromText = debt.from;
              const toText = debt.to;
              // Ensure amount is properly formatted with 2 decimal places
              const amountValue = typeof debt.amount === 'number' ? debt.amount : parseFloat(debt.amount || '0');
              const amountText = amountValue.toFixed(2);
              const owesText = t('owes') || 'owes';
              
              console.log('[Balance] Rendering debt:', { from: fromText, to: toText, amount: amountText });
              
              return (
                <GlassView
                  key={index}
                  style={[styles.summaryCard, Platform.OS !== 'ios' && { backgroundColor: theme.dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}
                  glassEffectStyle="regular"
                >
                  <IconSymbol ios_icon_name="arrow.left.arrow.right" android_material_icon_name="swap-horiz" size={32} color={customColors.accent} />
                  <Text style={[styles.summaryText, { color: theme.colors.text }]}>
                    {fromText}
                  </Text>
                  <Text style={[styles.summaryText, { color: theme.colors.text }]}>
                    {owesText}
                  </Text>
                  <Text style={[styles.summaryText, { color: theme.colors.text }]}>
                    {toText}
                  </Text>
                  <Text style={[styles.summaryAmount, { color: customColors.danger }]}>
                    {amountText}
                  </Text>
                  <Text style={[styles.summaryAmount, { color: customColors.danger }]}>
                    HUF
                  </Text>
                </GlassView>
              );
            })}
          </View>
        ) : (
          <GlassView
            style={[styles.summaryCard, Platform.OS !== 'ios' && { backgroundColor: theme.dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}
            glassEffectStyle="regular"
          >
            <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check-circle" size={32} color={customColors.secondary} />
            <Text style={[styles.summaryText, { color: theme.colors.text }]}>
              {t('noBalance')}
            </Text>
          </GlassView>
        )}

        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Participants</Text>
        {balance?.participants && balance.participants.length > 0 ? (
          balance.participants.map((participant) => {
            const totalPaidValue = participant.totalPaid ?? 0;
            const totalOwedValue = participant.totalOwed ?? 0;
            const balanceValue = participant.balance ?? 0;
            
            const totalPaidText = `${t('totalPaid')}: ${totalPaidValue.toFixed(2)} HUF`;
            const totalOwedText = `${t('totalOwed')}: ${totalOwedValue.toFixed(2)} HUF`;
            const balanceAmount = balanceValue.toFixed(2);
            const balanceText = `${t('currentBalance')}: ${balanceAmount} HUF`;
            
            // Check if current user can delete this participant
            // If createdBy is null (legacy), anyone can delete
            // If createdBy is set, only the creator can delete
            // Handle both formats: createdBy as string (user ID) or as object with id
            const createdById = typeof participant.createdBy === 'string'
              ? participant.createdBy
              : (participant.createdBy as any)?.id || null;
            const canDelete = !createdById || createdById === user?.id;
            
            return (
              <GlassView
                key={participant.id}
                style={[styles.participantCard, Platform.OS !== 'ios' && { backgroundColor: theme.dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}
                glassEffectStyle="regular"
              >
                <View style={styles.participantHeader}>
                  <TouchableOpacity
                    style={styles.participantLeft}
                    onPress={() => handleEditParticipant(participant)}
                  >
                    <IconSymbol ios_icon_name="person.circle.fill" android_material_icon_name="account-circle" size={40} color={customColors.primary} />
                    <Text style={[styles.participantName, { color: theme.colors.text }]}>
                      {participant.name}
                    </Text>
                  </TouchableOpacity>
                  <View style={styles.participantActions}>
                    <TouchableOpacity
                      onPress={() => handleEditParticipant(participant)}
                      style={styles.actionIcon}
                    >
                      <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={20} color={theme.dark ? '#98989D' : '#666'} />
                    </TouchableOpacity>
                    {canDelete && (
                      <TouchableOpacity
                        onPress={() => {
                          console.log('[Participant] User tapped delete participant button');
                          setSelectedParticipant(participant);
                          setShowDeleteParticipantConfirm(true);
                        }}
                        style={styles.actionIcon}
                      >
                        <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={20} color={customColors.danger} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                <View style={styles.participantDetails}>
                  <Text style={[styles.participantInfo, { color: theme.dark ? '#98989D' : '#666' }]}>
                    {totalPaidText}
                  </Text>
                  <Text style={[styles.participantInfo, { color: theme.dark ? '#98989D' : '#666' }]}>
                    {totalOwedText}
                  </Text>
                  <Text
                    style={[
                      styles.participantBalance,
                      {
                        color: balanceValue >= 0 ? customColors.secondary : customColors.danger,
                      },
                    ]}
                  >
                    {balanceText}
                  </Text>
                </View>
              </GlassView>
            );
          })
        ) : (
          <GlassView
            style={[styles.emptyState, Platform.OS !== 'ios' && { backgroundColor: theme.dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}
            glassEffectStyle="regular"
          >
            <IconSymbol ios_icon_name="person.2" android_material_icon_name="group" size={48} color={theme.dark ? '#98989D' : '#666'} />
            <Text style={[styles.emptyText, { color: theme.dark ? '#98989D' : '#666' }]}>
              {t('noParticipants')}
            </Text>
          </GlassView>
        )}

        {settlements.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Recent Settlements</Text>
            {settlements.map((settlement) => {
              const dateText = new Date(settlement.date).toLocaleDateString();
              const amountValue = settlement.amount ?? 0;
              const amountText = `${amountValue.toFixed(2)} HUF`;
              
              // FIX: Handle null participants (when participant is deleted)
              const fromName = settlement.fromParticipant?.name || t('deletedParticipant') || 'Deleted';
              const toName = settlement.toParticipant?.name || t('deletedParticipant') || 'Deleted';
              const fromToText = `${fromName} → ${toName}`;
              
              return (
                <GlassView
                  key={settlement.id}
                  style={[styles.settlementCard, Platform.OS !== 'ios' && { backgroundColor: theme.dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}
                  glassEffectStyle="regular"
                >
                  <View style={styles.settlementHeader}>
                    <View style={styles.settlementHeaderLeft}>
                      <IconSymbol ios_icon_name="checkmark.circle" android_material_icon_name="check-circle" size={24} color={customColors.secondary} />
                      <Text style={[styles.settlementDescription, { color: theme.colors.text }]}>
                        {settlement.description}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => {
                        console.log('[Settlement] User tapped delete settlement button');
                        setSelectedSettlement(settlement);
                        setShowDeleteSettlementConfirm(true);
                      }}
                    >
                      <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={20} color={customColors.danger} />
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.settlementAmount, { color: customColors.secondary }]}>
                    {amountText}
                  </Text>
                  <Text style={[styles.settlementInfo, { color: theme.dark ? '#98989D' : '#666' }]}>
                    {fromToText}
                  </Text>
                  <Text style={[styles.settlementDate, { color: theme.dark ? '#98989D' : '#666' }]}>
                    {dateText}
                  </Text>
                </GlassView>
              );
            })}
          </>
        )}
      </ScrollView>

      <Modal
        visible={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingParticipant(null);
          setEditName("");
        }}
        title={t('editParticipant')}
        type="custom"
        confirmText={t('save')}
        onConfirm={handleUpdateParticipant}
      >
        <TextInput
          style={[styles.modalInput, { color: theme.colors.text, borderColor: theme.colors.border }]}
          placeholder={t('name')}
          placeholderTextColor={theme.dark ? '#98989D' : '#666'}
          value={editName}
          onChangeText={setEditName}
          autoFocus
        />
      </Modal>

      <Modal
        visible={showDeleteSettlementConfirm}
        onClose={() => {
          setShowDeleteSettlementConfirm(false);
          setSelectedSettlement(null);
        }}
        title={t('deleteSettlement')}
        message={t('deleteSettlementConfirm')}
        type="confirm"
        confirmText={t('delete')}
        confirmColor={customColors.danger}
        onConfirm={handleDeleteSettlement}
      />

      <Modal
        visible={showDeleteParticipantConfirm}
        onClose={() => {
          setShowDeleteParticipantConfirm(false);
          setSelectedParticipant(null);
        }}
        title={t('deleteParticipant')}
        message={t('deleteParticipantConfirm')}
        type="confirm"
        confirmText={t('delete')}
        confirmColor={customColors.danger}
        onConfirm={handleDeleteParticipant}
      />

      <Modal
        visible={errorModal.visible}
        onClose={() => setErrorModal({ visible: false, message: "" })}
        title={t('error')}
        message={errorModal.message}
        confirmText={t('ok')}
        confirmColor={customColors.danger}
      />

      <Modal
        visible={successModal.visible}
        onClose={() => setSuccessModal({ visible: false, message: "" })}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  headerButton: {
    padding: 8,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 100,
  },
  summaryCard: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  summaryText: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  summaryAmount: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
    marginTop: 8,
  },
  participantCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  participantHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  participantLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  participantActions: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  actionIcon: {
    padding: 4,
  },
  participantName: {
    fontSize: 20,
    fontWeight: '600',
  },
  participantDetails: {
    gap: 4,
  },
  participantInfo: {
    fontSize: 14,
  },
  participantBalance: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 4,
  },
  settlementCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  settlementHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  settlementHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  settlementDescription: {
    fontSize: 16,
    fontWeight: '600',
  },
  settlementAmount: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  settlementInfo: {
    fontSize: 14,
    marginBottom: 2,
  },
  settlementDate: {
    fontSize: 12,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  emptyState: {
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
  },
});
