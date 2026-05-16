// Copyright (c) 2026 Kunetz Szabolcs. All rights reserved.

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  RefreshControl,
  AppState,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@react-navigation/native";
import { IconSymbol } from "@/components/IconSymbol";
import { GlassView } from "expo-glass-effect";
import * as DocumentPicker from 'expo-document-picker';
import { expensesApi, participantsApi, settlementsApi, Expense, Participant } from "@/utils/api";
import Modal from "@/components/ui/Modal";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCustomTheme } from "@/contexts/ThemeContext";
import { downloadFile, downloadBlob } from "@/utils/fileDownload";
import { useAuth } from "@/contexts/AuthContext";
import { useProject } from "@/contexts/ProjectContext";
import { useFocusEffect } from "@react-navigation/native";

export default function ExpensesScreen() {
  const theme = useTheme();
  const { t } = useLanguage();
  const { customColors, getParticipantColor } = useCustomTheme();
  const { user, localUserId, allUserIds } = useAuth();
  const { activeProject, activeProjectId } = useProject();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [showAddSettlement, setShowAddSettlement] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<'csv' | 'xlsx'>('xlsx');
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [errorModal, setErrorModal] = useState({ visible: false, message: "" });
  const [successModal, setSuccessModal] = useState({ visible: false, message: "" });
  const [importLoading, setImportLoading] = useState(false);
  const [showImportInfo, setShowImportInfo] = useState(false);
  const [deleteAllLoading, setDeleteAllLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<Set<string>>(new Set());
  
  const [splitMode, setSplitMode] = useState<'equal' | 'percentage'>('equal');
  
  const [showEditExpense, setShowEditExpense] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editExpenseData, setEditExpenseData] = useState({
    description: "",
    amount: "",
    date: new Date().toISOString(),
    paidBy: "",
    splitPercentage: "0",
  });
  
  const [newExpense, setNewExpense] = useState({
    description: "",
    amount: "",
    date: new Date().toISOString(),
    paidBy: "",
    splitPercentage: "0",
  });
  
  const [newParticipant, setNewParticipant] = useState("");
  const [newSettlement, setNewSettlement] = useState({
    fromParticipant: "",
    toParticipant: "",
    amount: "",
    description: "Settlement",
  });

  const loadData = useCallback(async () => {
    if (!activeProjectId) {
      setExpenses([]);
      setParticipants([]);
      setLoading(false);
      return;
    }
    try {
      console.log('[Expenses] Loading data for project:', activeProjectId);
      const [expensesData, participantsData] = await Promise.all([
        expensesApi.getAll(activeProjectId, {
          search: searchQuery || undefined,
          minAmount: minAmount ? parseFloat(minAmount) : undefined,
          maxAmount: maxAmount ? parseFloat(maxAmount) : undefined,
        }),
        participantsApi.getAll(activeProjectId),
      ]);
      
      console.log('[Expenses] Loaded expenses:', expensesData.length);
      console.log('[Participants] Loaded participants:', participantsData.length);
      console.log('[Participants] Participant details:', participantsData.map(p => ({ id: p.id, name: p.name, createdBy: p.createdBy })));
      
      setExpenses(expensesData);
      setParticipants(participantsData);
      
      if (participantsData.length > 0) {
        setNewExpense(prev => {
          if (!prev.paidBy) {
            return {
              ...prev,
              paidBy: participantsData[0].id,
            };
          }
          return prev;
        });
      }
    } catch (error: any) {
      console.error('[Expenses] Failed to load data:', error);
      console.error('[Expenses] Error type:', typeof error);
      console.error('[Expenses] Error name:', error?.name);
      console.error('[Expenses] Error message:', error?.message);
      console.error('[Expenses] Error stack:', error?.stack);
      
      let errorMessage = t('error');
      
      if (error?.message) {
        errorMessage = error.message;
      } else if (error instanceof TypeError) {
        errorMessage = 'Cannot connect to server. Please check your internet connection.';
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      setErrorModal({ visible: true, message: errorMessage });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [searchQuery, minAmount, maxAmount, t, user, localUserId, activeProjectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      console.log('[Expenses] Screen focused - refreshing data');
      loadData();
    }, [loadData])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        console.log('[Expenses] App came to foreground - refreshing data');
        loadData();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [loadData]);

  const onRefresh = useCallback(() => {
    console.log('[Expenses] User triggered pull-to-refresh');
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const sortedExpenses = useMemo(() => {
    if (!expenses || expenses.length === 0) {
      return [];
    }
    
    const sorted = [...expenses].sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateB - dateA;
    });
    
    console.log('[Expenses] Sorted expenses by date (most recent first):', sorted.length);
    return sorted;
  }, [expenses]);

  const handleAddExpense = async () => {
    try {
      if (!newExpense.description || !newExpense.amount || !newExpense.paidBy) {
        setErrorModal({ visible: true, message: t('fillAllFields') });
        return;
      }

      const createdByUserId = user?.id || localUserId || null;

      let finalSplitPercentage = 0;
      if (splitMode === 'equal') {
        finalSplitPercentage = 0;
      } else {
        const percentageValue = parseFloat(newExpense.splitPercentage);
        if (isNaN(percentageValue) || percentageValue < 0 || percentageValue > 100) {
          setErrorModal({ visible: true, message: t('invalidPercentage') || 'Please enter a valid percentage (0-100)' });
          return;
        }
        finalSplitPercentage = percentageValue;
      }

      console.log('[Expense] Creating expense by user:', createdByUserId || 'anonymous', 'splitMode:', splitMode, 'splitPercentage:', finalSplitPercentage);
      
      if (!activeProjectId) {
        setErrorModal({ visible: true, message: 'No active project selected' });
        return;
      }
      await expensesApi.create({
        description: newExpense.description,
        amount: parseFloat(newExpense.amount),
        date: newExpense.date,
        paidBy: newExpense.paidBy,
        splitPercentage: finalSplitPercentage,
        createdBy: createdByUserId,
        projectId: activeProjectId,
      });

      setSuccessModal({ visible: true, message: t('expenseAdded') });
      setShowAddExpense(false);
      setNewExpense({
        description: "",
        amount: "",
        date: new Date().toISOString(),
        paidBy: participants[0]?.id || "",
        splitPercentage: "0",
      });
      setSplitMode('equal');
      loadData();
    } catch (error: any) {
      console.error('[Expense] Failed to add expense:', error);
      setErrorModal({ visible: true, message: error.message || t('error') });
    }
  };

  const handleEditExpense = (expense: Expense) => {
    console.log('[Expense] User tapped edit expense button for:', expense.id);
    setEditingExpense(expense);
    
    const paidById = typeof expense.paidBy === 'object' && expense.paidBy && 'id' in expense.paidBy 
      ? expense.paidBy.id 
      : expense.paidBy;
    
    setEditExpenseData({
      description: expense.description,
      amount: expense.amount.toString(),
      date: expense.date,
      paidBy: paidById || "",
      splitPercentage: expense.splitPercentage.toString(),
    });
    
    setSplitMode(expense.splitPercentage === 0 ? 'equal' : 'percentage');
    setShowEditExpense(true);
  };

  const handleUpdateExpense = async () => {
    if (!editingExpense) {
      return;
    }

    try {
      if (!editExpenseData.description || !editExpenseData.amount || !editExpenseData.paidBy) {
        setErrorModal({ visible: true, message: t('fillAllFields') });
        return;
      }

      let finalSplitPercentage = 0;
      if (splitMode === 'equal') {
        finalSplitPercentage = 0;
      } else {
        const percentageValue = parseFloat(editExpenseData.splitPercentage);
        if (isNaN(percentageValue) || percentageValue < 0 || percentageValue > 100) {
          setErrorModal({ visible: true, message: t('invalidPercentage') || 'Please enter a valid percentage (0-100)' });
          return;
        }
        finalSplitPercentage = percentageValue;
      }

      console.log('[Expense] Updating expense:', editingExpense.id);
      await expensesApi.update(editingExpense.id, {
        description: editExpenseData.description,
        amount: parseFloat(editExpenseData.amount),
        date: editExpenseData.date,
        paidBy: editExpenseData.paidBy,
        splitPercentage: finalSplitPercentage,
      });

      setSuccessModal({ visible: true, message: t('expenseUpdated') || 'Expense updated successfully' });
      setShowEditExpense(false);
      setEditingExpense(null);
      loadData();
    } catch (error: any) {
      console.error('[Expense] Failed to update expense:', error);
      if (error.message?.includes('403') || error.message?.includes('Forbidden') || error.message?.includes('Only the creator')) {
        setErrorModal({ visible: true, message: t('unauthorizedEdit') || 'Only the creator can edit this expense' });
      } else if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
        setErrorModal({ visible: true, message: t('loginRequired') || 'Please log in to edit expenses' });
      } else {
        setErrorModal({ visible: true, message: error.message || t('error') });
      }
    }
  };

  const handleDeleteExpense = async () => {
    if (!selectedExpense) {
      return;
    }

    try {
      console.log('[Expense] Deleting expense:', selectedExpense.id);
      setIsDeleting(true);
      await expensesApi.delete(selectedExpense.id);
      setSuccessModal({ visible: true, message: t('expenseDeleted') });
      setShowDeleteConfirm(false);
      setSelectedExpense(null);
      loadData();
    } catch (error: any) {
      console.error('[Expense] Failed to delete expense:', error);
      if (error.message?.includes('403') || error.message?.includes('Forbidden') || error.message?.includes('Only the creator')) {
        setErrorModal({ visible: true, message: t('unauthorizedDelete') || 'Only the creator can delete this expense' });
      } else if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
        setErrorModal({ visible: true, message: t('loginRequired') || 'Please log in to delete expenses' });
      } else {
        setErrorModal({ visible: true, message: error.message || t('error') });
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteAllExpenses = async () => {
    try {
      console.log('[Expenses] User tapped Delete All Expenses button');
      setDeleteAllLoading(true);
      
      if (!activeProjectId) {
        setErrorModal({ visible: true, message: 'No active project selected' });
        return;
      }
      const result = await expensesApi.deleteAll(activeProjectId);
      
      const deletedCountText = result.deletedCount.toString();
      const successMessage = `${t('deleteAllSuccess')} ${deletedCountText} ${t('expenses').toLowerCase()}`;
      
      setSuccessModal({ visible: true, message: successMessage });
      setShowDeleteAllConfirm(false);
      loadData();
    } catch (error: any) {
      console.error('[Expenses] Failed to delete all expenses:', error);
      setErrorModal({ visible: true, message: error.message || t('error') });
    } finally {
      setDeleteAllLoading(false);
    }
  };

  const handleAddParticipant = async () => {
    try {
      if (!newParticipant.trim()) {
        setErrorModal({ visible: true, message: t('fillAllFields') });
        return;
      }

      const createdByUserId = user?.id || localUserId || null;
      if (!activeProjectId) {
        setErrorModal({ visible: true, message: 'No active project selected' });
        return;
      }
      console.log('[Participant] Adding participant:', newParticipant, 'to project:', activeProjectId);
      await participantsApi.create(activeProjectId, newParticipant, createdByUserId);
      setSuccessModal({ visible: true, message: t('participantAdded') });
      setShowAddParticipant(false);
      setNewParticipant("");
      loadData();
    } catch (error: any) {
      console.error('[Participant] Failed to add participant:', error);
      setErrorModal({ visible: true, message: error.message || t('error') });
    }
  };

  const handleAddSettlement = async () => {
    try {
      if (!newSettlement.fromParticipant || !newSettlement.toParticipant || !newSettlement.amount) {
        setErrorModal({ visible: true, message: t('fillAllFields') });
        return;
      }

      if (!activeProjectId) {
        setErrorModal({ visible: true, message: 'No active project selected' });
        return;
      }
      console.log('[Settlement] Adding settlement:', newSettlement);
      await settlementsApi.create({
        fromParticipant: newSettlement.fromParticipant,
        toParticipant: newSettlement.toParticipant,
        amount: parseFloat(newSettlement.amount),
        date: new Date().toISOString(),
        description: newSettlement.description,
        projectId: activeProjectId,
      });

      setSuccessModal({ visible: true, message: t('settlementRecorded') });
      setShowAddSettlement(false);
      setNewSettlement({
        fromParticipant: "",
        toParticipant: "",
        amount: "",
        description: "Settlement",
      });
      loadData();
    } catch (error: any) {
      console.error('[Settlement] Failed to record settlement:', error);
      setErrorModal({ visible: true, message: error.message || t('error') });
    }
  };

  const handleExportAll = async () => {
    try {
      if (!activeProjectId) {
        setErrorModal({ visible: true, message: 'No active project selected' });
        return;
      }
      console.log('[Export] Starting export all with format:', exportFormat);
      const blob = await expensesApi.export(activeProjectId, exportFormat);
      const fileExtension = exportFormat === 'xlsx' ? 'xlsx' : 'csv';
      const fileName = `expenses_all_${new Date().toISOString().split('T')[0]}.${fileExtension}`;
      
      await downloadBlob(blob, fileName);
      
      setSuccessModal({ visible: true, message: `${t('exportSuccess')}: ${fileName}` });
      setShowExportModal(false);
    } catch (error: any) {
      console.error('[Export] Export failed:', error);
      setErrorModal({ visible: true, message: error.message || t('exportFailed') });
    }
  };

  const handleExportSelected = async () => {
    try {
      if (selectedExpenseIds.size === 0) {
        setErrorModal({ visible: true, message: t('noExpensesSelected') || 'Please select at least one expense to export' });
        return;
      }

      console.log('[Export] Starting export selected:', selectedExpenseIds.size, 'expenses with format:', exportFormat);
      
      const idsString = Array.from(selectedExpenseIds).join(',');

      if (!activeProjectId) {
        setErrorModal({ visible: true, message: 'No active project selected' });
        return;
      }
      const blob = await expensesApi.export(activeProjectId, exportFormat, idsString);
      const fileExtension = exportFormat === 'xlsx' ? 'xlsx' : 'csv';
      const fileName = `expenses_selected_${new Date().toISOString().split('T')[0]}.${fileExtension}`;
      
      await downloadBlob(blob, fileName);
      
      setSuccessModal({ visible: true, message: `${t('exportSuccess')}: ${fileName}` });
      setShowExportModal(false);
      setSelectionMode(false);
      setSelectedExpenseIds(new Set());
    } catch (error: any) {
      console.error('[Export] Export selected failed:', error);
      setErrorModal({ visible: true, message: error.message || t('exportFailed') });
    }
  };

  const handleImport = async () => {
    try {
      console.log('[Import] Starting import...');
      
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'text/csv',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        console.log('[Import] User canceled file selection');
        return;
      }

      const file = result.assets[0];
      console.log('[Import] Selected file:', file.name, 'Type:', file.mimeType, 'URI:', file.uri);
      
      if (!activeProjectId) {
        setErrorModal({ visible: true, message: 'No active project selected' });
        return;
      }
      setImportLoading(true);
      const importResult = await expensesApi.import(activeProjectId, {
        uri: file.uri,
        name: file.name,
        type: file.mimeType || 'text/csv',
      });
      setImportLoading(false);

      const importedText = `${t('importSuccess')} ${importResult.imported} ${t('expenses').toLowerCase()}`;
      let errorsText = '';
      
      if (importResult.errors.length > 0) {
        errorsText = `\n\n${t('importErrors')} (${importResult.errors.length}):\n\n${importResult.errors.join('\n')}`;
      }
      
      setSuccessModal({
        visible: true,
        message: importedText + errorsText,
      });
      loadData();
    } catch (error: any) {
      setImportLoading(false);
      console.error('[Import] Import failed:', error);
      setErrorModal({ visible: true, message: error.message || t('importFailed') });
    }
  };

  const toggleExpenseSelection = (expenseId: string) => {
    const newSelection = new Set(selectedExpenseIds);
    if (newSelection.has(expenseId)) {
      newSelection.delete(expenseId);
    } else {
      newSelection.add(expenseId);
    }
    setSelectedExpenseIds(newSelection);
  };

  const selectAllExpenses = () => {
    const allIds = new Set(sortedExpenses.map(e => e.id));
    setSelectedExpenseIds(allIds);
  };

  const deselectAllExpenses = () => {
    setSelectedExpenseIds(new Set());
  };

  const isOwner = useCallback((expense: Expense) => {
    const createdById = typeof expense.createdBy === 'string' 
      ? expense.createdBy 
      : expense.createdBy && typeof expense.createdBy === 'object' && 'id' in expense.createdBy
      ? expense.createdBy.id
      : null;
    
    const currentUserId = user?.id || localUserId;
    
    console.log('[Ownership Check] Expense:', expense.id, 'createdBy:', createdById, 'user:', user?.id || 'not logged in', 'localUserId:', localUserId || 'none', 'allUserIds:', allUserIds);
    
    if (!createdById) {
      console.log('[Ownership Check] No creator (anonymous expense) - allowing ownership for all users');
      return true;
    }
    
    if (!currentUserId && !user && allUserIds.length === 0) {
      console.log('[Ownership Check] No current user ID, not logged in, and no historical user IDs - denying ownership');
      return false;
    }
    
    if (currentUserId && createdById === currentUserId) {
      console.log('[Ownership Check] User owns expense directly (createdBy matches currentUserId) - SHOWING BUTTONS');
      return true;
    }
    
    if (user?.id && createdById === user.id) {
      console.log('[Ownership Check] User owns expense directly (createdBy matches user.id) - SHOWING BUTTONS');
      return true;
    }
    
    if (localUserId && createdById === localUserId) {
      console.log('[Ownership Check] User owns expense via localUserId (createdBy matches localUserId) - SHOWING BUTTONS');
      return true;
    }
    
    if (allUserIds.includes(createdById)) {
      console.log('[Ownership Check] User owns expense via historical user ID (createdBy in allUserIds) - SHOWING BUTTONS');
      return true;
    }
    
    const paidByParticipantId = typeof expense.paidBy === 'object' && expense.paidBy && 'id' in expense.paidBy
      ? expense.paidBy.id
      : expense.paidBy;
    
    const paidByParticipant = participants.find(p => p.id === paidByParticipantId);
    console.log('[Ownership Check] Looking for participant who paid (paidBy):', paidByParticipantId, 'Found:', paidByParticipant ? `${paidByParticipant.name} (createdBy: ${paidByParticipant.createdBy})` : 'not found');
    
    if (paidByParticipant && paidByParticipant.createdBy) {
      const participantCreatorId = typeof paidByParticipant.createdBy === 'string'
        ? paidByParticipant.createdBy
        : (paidByParticipant.createdBy as any)?.id;
      
      console.log('[Ownership Check] Participant creator ID:', participantCreatorId, 'vs currentUserId:', currentUserId, 'vs user.id:', user?.id, 'vs localUserId:', localUserId, 'vs allUserIds:', allUserIds);
      
      if (currentUserId && participantCreatorId === currentUserId) {
        console.log('[Ownership Check] User owns expense via participant (participant.createdBy matches currentUserId) - SHOWING BUTTONS');
        return true;
      }
      
      if (user?.id && participantCreatorId === user.id) {
        console.log('[Ownership Check] User owns expense via participant (participant.createdBy matches user.id) - SHOWING BUTTONS');
        return true;
      }
      
      if (localUserId && participantCreatorId === localUserId) {
        console.log('[Ownership Check] User owns expense via participant (participant.createdBy matches localUserId) - SHOWING BUTTONS');
        return true;
      }
      
      if (allUserIds.includes(participantCreatorId)) {
        console.log('[Ownership Check] User owns expense via participant with historical user ID (participant.createdBy in allUserIds) - SHOWING BUTTONS');
        return true;
      }
    }
    
    console.log('[Ownership Check] User does NOT own expense - HIDING BUTTONS');
    return false;
  }, [user, localUserId, allUserIds, participants]);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={customColors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>{t('appName')}</Text>
          {activeProject && (
            <Text style={{ color: theme.colors.text, opacity: 0.6, fontSize: 13 }}>
              {activeProject.name}
            </Text>
          )}
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity 
            onPress={() => setShowExportModal(true)} 
            style={styles.headerButton}
            accessibilityLabel={t('exportExpenses')}
            accessibilityHint={t('exportAllDescription')}
          >
            <IconSymbol ios_icon_name="square.and.arrow.up" android_material_icon_name="upload" size={24} color={customColors.primary} />
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={handleImport} 
            style={styles.headerButton}
            accessibilityLabel={t('importExpenses')}
            accessibilityHint={t('importDescription')}
            disabled={importLoading}
          >
            {importLoading ? (
              <ActivityIndicator size="small" color={customColors.primary} />
            ) : (
              <IconSymbol ios_icon_name="square.and.arrow.down" android_material_icon_name="download" size={24} color={customColors.primary} />
            )}
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => setShowImportInfo(true)} 
            style={styles.headerButton}
            accessibilityLabel={t('importInfo')}
            accessibilityHint={t('importInfoMessage')}
          >
            <IconSymbol ios_icon_name="info.circle" android_material_icon_name="info" size={24} color={customColors.primary} />
          </TouchableOpacity>
          {expenses.length > 0 && (
            <TouchableOpacity 
              onPress={() => {
                console.log('[Expenses] User tapped Delete All button');
                setShowDeleteAllConfirm(true);
              }} 
              style={styles.headerButton}
              accessibilityLabel={t('deleteAllExpenses')}
              accessibilityHint={t('deleteAllExpensesHint')}
            >
              <IconSymbol ios_icon_name="trash.fill" android_material_icon_name="delete-sweep" size={24} color={customColors.danger} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <GlassView style={[styles.section, Platform.OS !== 'ios' && { backgroundColor: theme.dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]} glassEffectStyle="regular">
          <TextInput
            style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border }]}
            placeholder={t('searchExpenses')}
            placeholderTextColor={theme.dark ? '#98989D' : '#666'}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          <View style={styles.filterRow}>
            <TextInput
              style={[styles.filterInput, { color: theme.colors.text, borderColor: theme.colors.border }]}
              placeholder={t('minAmount')}
              placeholderTextColor={theme.dark ? '#98989D' : '#666'}
              value={minAmount}
              onChangeText={setMinAmount}
              keyboardType="numeric"
            />
            <TextInput
              style={[styles.filterInput, { color: theme.colors.text, borderColor: theme.colors.border }]}
              placeholder={t('maxAmount')}
              placeholderTextColor={theme.dark ? '#98989D' : '#666'}
              value={maxAmount}
              onChangeText={setMaxAmount}
              keyboardType="numeric"
            />
          </View>
        </GlassView>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: customColors.primary }]}
            onPress={() => setShowAddExpense(true)}
          >
            <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={20} color="#fff" />
            <Text style={styles.actionButtonText}>{t('addExpense')}</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: customColors.primary }]}
            onPress={() => setShowAddParticipant(true)}
          >
            <IconSymbol ios_icon_name="person.badge.plus" android_material_icon_name="person-add" size={20} color="#fff" />
            <Text style={styles.actionButtonText}>{t('addPerson')}</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: customColors.primary }]}
            onPress={() => setShowAddSettlement(true)}
          >
            <IconSymbol ios_icon_name="dollarsign.circle" android_material_icon_name="payments" size={20} color="#fff" />
            <Text style={styles.actionButtonText}>{t('settle')}</Text>
          </TouchableOpacity>
        </View>

        {selectionMode && (
          <View style={styles.selectionBar}>
            <Text style={[styles.selectionText, { color: theme.colors.text }]}>
              {selectedExpenseIds.size} {t('selected') || 'selected'}
            </Text>
            <View style={styles.selectionButtons}>
              <TouchableOpacity onPress={selectAllExpenses} style={styles.selectionButton}>
                <Text style={[styles.selectionButtonText, { color: customColors.primary }]}>
                  {t('selectAll') || 'Select All'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={deselectAllExpenses} style={styles.selectionButton}>
                <Text style={[styles.selectionButtonText, { color: customColors.primary }]}>
                  {t('deselectAll') || 'Deselect All'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => {
                  setSelectionMode(false);
                  setSelectedExpenseIds(new Set());
                }} 
                style={styles.selectionButton}
              >
                <Text style={[styles.selectionButtonText, { color: customColors.danger }]}>
                  {t('cancel') || 'Cancel'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{t('recentExpenses')}</Text>
        {sortedExpenses.length === 0 ? (
          <GlassView style={[styles.emptyState, Platform.OS !== 'ios' && { backgroundColor: theme.dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]} glassEffectStyle="regular">
            <IconSymbol ios_icon_name="tray" android_material_icon_name="inbox" size={48} color={theme.dark ? '#98989D' : '#666'} />
            <Text style={[styles.emptyText, { color: theme.dark ? '#98989D' : '#666' }]}>
              {t('noExpenses')}
            </Text>
          </GlassView>
        ) : (
          sortedExpenses.map((expense) => {
            const expenseAmount = `${expense.amount.toFixed(2)} HUF`;
            
            const paidByName = expense.paidBy && typeof expense.paidBy === 'object' && 'name' in expense.paidBy
              ? expense.paidBy.name 
              : (t('deletedParticipant') || 'Deleted Participant');
            const paidByText = `${t('paidBy')} ${paidByName}`;
            
            const createdById = typeof expense.createdBy === 'string' 
              ? expense.createdBy 
              : expense.createdBy && typeof expense.createdBy === 'object' && 'id' in expense.createdBy
              ? expense.createdBy.id
              : null;
            
            let createdByName = t('anonymous') || 'Anonymous';
            
            if (createdById) {
              const creatorParticipant = participants.find(p => p.id === createdById);
              
              if (creatorParticipant) {
                createdByName = creatorParticipant.name;
              } else if (user?.id === createdById) {
                createdByName = user.name || user.email || t('you') || 'You';
              } else if (typeof expense.createdBy === 'object' && expense.createdBy && 'name' in expense.createdBy) {
                createdByName = (expense.createdBy as any).name;
              } else {
                createdByName = t('unknown') || 'Unknown';
              }
            }
            
            const createdByText = `${t('createdBy')} ${createdByName}`;
            
            const splitText = expense.splitPercentage === 0 
              ? t('splitModeEqual') || 'Split: Equal among all'
              : `${t('splitPercentage')}: ${expense.splitPercentage}%`;
            const dateText = new Date(expense.date).toLocaleDateString();
            
            const creatorColor = (expense.paidBy && typeof expense.paidBy === 'object' && 'id' in expense.paidBy && expense.paidBy.id)
              ? getParticipantColor(expense.paidBy.id) 
              : customColors.primary;
            
            const canModify = isOwner(expense);
            const isOwnExpense = isOwner(expense);
            
            const isSelected = selectedExpenseIds.has(expense.id);
            
            const CardWrapper = selectionMode ? TouchableOpacity : View;
            const cardWrapperProps = selectionMode ? {
              onPress: () => toggleExpenseSelection(expense.id),
              activeOpacity: 0.7
            } : {};
            
            return (
              <CardWrapper
                key={expense.id}
                {...cardWrapperProps}
              >
                <GlassView
                  style={[
                    styles.expenseCard, 
                    Platform.OS !== 'ios' && { backgroundColor: theme.dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' },
                    { borderLeftWidth: 4, borderLeftColor: creatorColor },
                    isSelected && { borderWidth: 2, borderColor: customColors.primary }
                  ]}
                  glassEffectStyle="regular"
                >
                  <View style={styles.expenseHeader}>
                    <View style={styles.expenseHeaderLeft}>
                      {selectionMode && (
                        <View style={[styles.checkbox, { borderColor: theme.colors.border }]}>
                          {isSelected && (
                            <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={16} color={customColors.primary} />
                          )}
                        </View>
                      )}
                      <View style={[styles.colorIndicator, { backgroundColor: creatorColor }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.expenseDescription, { color: theme.colors.text }]}>
                          {expense.description}
                        </Text>
                        {isOwnExpense && (
                          <View style={[styles.ownershipBadge, { backgroundColor: customColors.primary + '20', borderColor: customColors.primary }]}>
                            <IconSymbol ios_icon_name="person.fill" android_material_icon_name="person" size={12} color={customColors.primary} />
                            <Text style={[styles.ownershipBadgeText, { color: customColors.primary }]}>
                              {t('you') || 'You'}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                    {canModify && !selectionMode && (
                      <View style={styles.actionButtons}>
                        <TouchableOpacity
                          onPress={() => {
                            console.log('[Expense] User tapped edit button for:', expense.id);
                            handleEditExpense(expense);
                          }}
                          style={styles.editButton}
                          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                        >
                          <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={24} color={customColors.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => {
                            console.log('[Expense] User tapped delete button for:', expense.id);
                            setSelectedExpense(expense);
                            setShowDeleteConfirm(true);
                          }}
                          style={styles.deleteButton}
                          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                        >
                          <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={24} color={customColors.danger} />
                        </TouchableOpacity>
                      </View>
                    )}
                    {!canModify && !selectionMode && (
                      <View style={[styles.lockedBadge, { backgroundColor: theme.dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
                        <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={18} color={theme.dark ? '#98989D' : '#666'} />
                      </View>
                    )}
                  </View>
                  <View style={styles.expenseDetails}>
                    <Text style={[styles.expenseAmount, { color: creatorColor }]}>
                      {expenseAmount}
                    </Text>
                    <Text style={[styles.expenseInfo, { color: theme.dark ? '#98989D' : '#666' }]}>
                      {paidByText}
                    </Text>
                    <Text style={[styles.expenseInfo, { color: theme.dark ? '#98989D' : '#666' }]}>
                      {createdByText}
                    </Text>
                    <Text style={[styles.expenseInfo, { color: theme.dark ? '#98989D' : '#666' }]}>
                      {splitText}
                    </Text>
                  </View>
                  <Text style={[styles.expenseDate, { color: theme.dark ? '#98989D' : '#666' }]}>
                    {dateText}
                  </Text>
                </GlassView>
              </CardWrapper>
            );
          })
        )}
      </ScrollView>

      {/* Modals - keeping existing implementation */}
      <Modal
        visible={showExportModal}
        onClose={() => setShowExportModal(false)}
        title={t('exportExpenses') || 'Export Expenses'}
        type="custom"
      >
        <View style={styles.formatContainer}>
          <Text style={[styles.formatLabel, { color: theme.colors.text }]}>
            {t('exportFormat') || 'Export Format'}:
          </Text>
          <View style={styles.formatButtons}>
            <TouchableOpacity
              style={[
                styles.formatButton,
                { borderColor: theme.colors.border },
                exportFormat === 'xlsx' && { backgroundColor: customColors.primary },
              ]}
              onPress={() => setExportFormat('xlsx')}
            >
              <IconSymbol 
                ios_icon_name="doc.richtext" 
                android_material_icon_name="table-chart" 
                size={20} 
                color={exportFormat === 'xlsx' ? '#fff' : theme.colors.text} 
              />
              <Text style={[styles.formatButtonText, { color: exportFormat === 'xlsx' ? '#fff' : theme.colors.text }]}>
                Excel (.xlsx)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.formatButton,
                { borderColor: theme.colors.border },
                exportFormat === 'csv' && { backgroundColor: customColors.primary },
              ]}
              onPress={() => setExportFormat('csv')}
            >
              <IconSymbol 
                ios_icon_name="doc.text" 
                android_material_icon_name="description" 
                size={20} 
                color={exportFormat === 'csv' ? '#fff' : theme.colors.text} 
              />
              <Text style={[styles.formatButtonText, { color: exportFormat === 'csv' ? '#fff' : theme.colors.text }]}>
                CSV (.csv)
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.exportOption, { borderColor: theme.colors.border }]}
          onPress={handleExportAll}
        >
          <IconSymbol ios_icon_name="doc.text" android_material_icon_name="description" size={24} color={customColors.primary} />
          <View style={styles.exportOptionText}>
            <Text style={[styles.exportOptionTitle, { color: theme.colors.text }]}>
              {t('exportAll') || 'Export All Expenses'}
            </Text>
            <Text style={[styles.exportOptionDescription, { color: theme.dark ? '#98989D' : '#666' }]}>
              {t('exportAllDescription') || `Export all expenses to ${exportFormat.toUpperCase()} file`}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.exportOption, { borderColor: theme.colors.border }]}
          onPress={() => {
            setShowExportModal(false);
            setSelectionMode(true);
          }}
        >
          <IconSymbol ios_icon_name="checkmark.circle" android_material_icon_name="check-circle" size={24} color={customColors.primary} />
          <View style={styles.exportOptionText}>
            <Text style={[styles.exportOptionTitle, { color: theme.colors.text }]}>
              {t('exportSelected') || 'Export Selected Expenses'}
            </Text>
            <Text style={[styles.exportOptionDescription, { color: theme.dark ? '#98989D' : '#666' }]}>
              {t('exportSelectedDescription') || 'Select specific expenses to export'}
            </Text>
          </View>
        </TouchableOpacity>

        {selectionMode && selectedExpenseIds.size > 0 && (
          <TouchableOpacity
            style={[styles.exportButton, { backgroundColor: customColors.primary }]}
            onPress={handleExportSelected}
          >
            <IconSymbol ios_icon_name="square.and.arrow.up" android_material_icon_name="upload" size={20} color="#fff" />
            <Text style={styles.exportButtonText}>
              {t('exportSelectedCount') || `Export ${selectedExpenseIds.size} Selected`}
            </Text>
          </TouchableOpacity>
        )}
      </Modal>

      <Modal
        visible={showAddExpense}
        onClose={() => {
          setShowAddExpense(false);
          setSplitMode('equal');
        }}
        title={t('addExpense')}
        type="custom"
        confirmText={t('add')}
        onConfirm={handleAddExpense}
      >
        <TextInput
          style={[styles.modalInput, { color: theme.colors.text, borderColor: theme.colors.border }]}
          placeholder={t('description')}
          placeholderTextColor={theme.dark ? '#98989D' : '#666'}
          value={newExpense.description}
          onChangeText={(text) => setNewExpense({ ...newExpense, description: text })}
        />
        <TextInput
          style={[styles.modalInput, { color: theme.colors.text, borderColor: theme.colors.border }]}
          placeholder={`${t('amount')} (HUF)`}
          placeholderTextColor={theme.dark ? '#98989D' : '#666'}
          value={newExpense.amount}
          onChangeText={(text) => setNewExpense({ ...newExpense, amount: text })}
          keyboardType="numeric"
        />
        <View style={styles.pickerContainer}>
          <Text style={[styles.pickerLabel, { color: theme.colors.text }]}>{t('paidBy')}:</Text>
          {participants.length === 0 ? (
            <Text style={[styles.noParticipantsText, { color: theme.dark ? '#98989D' : '#666' }]}>
              {t('noParticipants')}
            </Text>
          ) : (
            <View style={styles.pickerButtons}>
              {participants.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    styles.pickerButton,
                    { borderColor: theme.colors.border },
                    newExpense.paidBy === p.id && { backgroundColor: customColors.primary },
                  ]}
                  onPress={() => setNewExpense({ ...newExpense, paidBy: p.id })}
                >
                  <Text style={[styles.pickerButtonText, { color: newExpense.paidBy === p.id ? '#fff' : theme.colors.text }]}>
                    {p.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
        
        <View style={styles.splitContainer}>
          <Text style={[styles.pickerLabel, { color: theme.colors.text }]}>{t('splitMode') || 'Split Mode'}:</Text>
          <View style={styles.splitModeButtons}>
            <TouchableOpacity
              style={[
                styles.splitModeButton,
                { borderColor: theme.colors.border },
                splitMode === 'equal' && { backgroundColor: customColors.primary },
              ]}
              onPress={() => {
                setSplitMode('equal');
                setNewExpense({ ...newExpense, splitPercentage: "0" });
              }}
            >
              <Text style={[styles.splitModeButtonText, { color: splitMode === 'equal' ? '#fff' : theme.colors.text }]}>
                {t('equalSplit') || 'Equal Split'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.splitModeButton,
                { borderColor: theme.colors.border },
                splitMode === 'percentage' && { backgroundColor: customColors.primary },
              ]}
              onPress={() => {
                setSplitMode('percentage');
                setNewExpense({ ...newExpense, splitPercentage: "50" });
              }}
            >
              <Text style={[styles.splitModeButtonText, { color: splitMode === 'percentage' ? '#fff' : theme.colors.text }]}>
                {t('percentageSplit') || 'Percentage Split'}
              </Text>
            </TouchableOpacity>
          </View>
          
          {splitMode === 'equal' ? (
            <Text style={[styles.splitHelpText, { color: theme.dark ? '#98989D' : '#666' }]}>
              {t('equalSplitHelp') || 'The expense will be split equally among all participants (including the payer).'}
            </Text>
          ) : (
            <React.Fragment>
              <Text style={[styles.splitHelpText, { color: theme.dark ? '#98989D' : '#666' }]}>
                {t('percentageSplitHelp') || 'Enter the payer\'s share percentage. The remaining amount will be split equally among other participants.'}
              </Text>
              <TextInput
                style={[styles.modalInput, { color: theme.colors.text, borderColor: theme.colors.border }]}
                placeholder={t('payerSharePercentage') || 'Payer\'s share (%)'}
                placeholderTextColor={theme.dark ? '#98989D' : '#666'}
                value={newExpense.splitPercentage}
                onChangeText={(text) => setNewExpense({ ...newExpense, splitPercentage: text })}
                keyboardType="numeric"
              />
            </React.Fragment>
          )}
        </View>
      </Modal>

      <Modal
        visible={showEditExpense}
        onClose={() => {
          setShowEditExpense(false);
          setEditingExpense(null);
          setSplitMode('equal');
        }}
        title={t('editExpense') || 'Edit Expense'}
        type="custom"
        confirmText={t('save') || 'Save'}
        onConfirm={handleUpdateExpense}
      >
        <TextInput
          style={[styles.modalInput, { color: theme.colors.text, borderColor: theme.colors.border }]}
          placeholder={t('description')}
          placeholderTextColor={theme.dark ? '#98989D' : '#666'}
          value={editExpenseData.description}
          onChangeText={(text) => setEditExpenseData({ ...editExpenseData, description: text })}
        />
        <TextInput
          style={[styles.modalInput, { color: theme.colors.text, borderColor: theme.colors.border }]}
          placeholder={`${t('amount')} (HUF)`}
          placeholderTextColor={theme.dark ? '#98989D' : '#666'}
          value={editExpenseData.amount}
          onChangeText={(text) => setEditExpenseData({ ...editExpenseData, amount: text })}
          keyboardType="numeric"
        />
        <View style={styles.pickerContainer}>
          <Text style={[styles.pickerLabel, { color: theme.colors.text }]}>{t('paidBy')}:</Text>
          {participants.length === 0 ? (
            <Text style={[styles.noParticipantsText, { color: theme.dark ? '#98989D' : '#666' }]}>
              {t('noParticipants')}
            </Text>
          ) : (
            <View style={styles.pickerButtons}>
              {participants.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    styles.pickerButton,
                    { borderColor: theme.colors.border },
                    editExpenseData.paidBy === p.id && { backgroundColor: customColors.primary },
                  ]}
                  onPress={() => setEditExpenseData({ ...editExpenseData, paidBy: p.id })}
                >
                  <Text style={[styles.pickerButtonText, { color: editExpenseData.paidBy === p.id ? '#fff' : theme.colors.text }]}>
                    {p.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
        
        <View style={styles.splitContainer}>
          <Text style={[styles.pickerLabel, { color: theme.colors.text }]}>{t('splitMode') || 'Split Mode'}:</Text>
          <View style={styles.splitModeButtons}>
            <TouchableOpacity
              style={[
                styles.splitModeButton,
                { borderColor: theme.colors.border },
                splitMode === 'equal' && { backgroundColor: customColors.primary },
              ]}
              onPress={() => {
                setSplitMode('equal');
                setEditExpenseData({ ...editExpenseData, splitPercentage: "0" });
              }}
            >
              <Text style={[styles.splitModeButtonText, { color: splitMode === 'equal' ? '#fff' : theme.colors.text }]}>
                {t('equalSplit') || 'Equal Split'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.splitModeButton,
                { borderColor: theme.colors.border },
                splitMode === 'percentage' && { backgroundColor: customColors.primary },
              ]}
              onPress={() => {
                setSplitMode('percentage');
                setEditExpenseData({ ...editExpenseData, splitPercentage: "50" });
              }}
            >
              <Text style={[styles.splitModeButtonText, { color: splitMode === 'percentage' ? '#fff' : theme.colors.text }]}>
                {t('percentageSplit') || 'Percentage Split'}
              </Text>
            </TouchableOpacity>
          </View>
          
          {splitMode === 'equal' ? (
            <Text style={[styles.splitHelpText, { color: theme.dark ? '#98989D' : '#666' }]}>
              {t('equalSplitHelp') || 'The expense will be split equally among all participants (including the payer).'}
            </Text>
          ) : (
            <React.Fragment>
              <Text style={[styles.splitHelpText, { color: theme.dark ? '#98989D' : '#666' }]}>
                {t('percentageSplitHelp') || 'Enter the payer\'s share percentage. The remaining amount will be split equally among other participants.'}
              </Text>
              <TextInput
                style={[styles.modalInput, { color: theme.colors.text, borderColor: theme.colors.border }]}
                placeholder={t('payerSharePercentage') || 'Payer\'s share (%)'}
                placeholderTextColor={theme.dark ? '#98989D' : '#666'}
                value={editExpenseData.splitPercentage}
                onChangeText={(text) => setEditExpenseData({ ...editExpenseData, splitPercentage: text })}
                keyboardType="numeric"
              />
            </React.Fragment>
          )}
        </View>
      </Modal>

      <Modal
        visible={showAddParticipant}
        onClose={() => setShowAddParticipant(false)}
        title={t('addParticipant')}
        type="custom"
        confirmText={t('add')}
        onConfirm={handleAddParticipant}
      >
        <TextInput
          style={[styles.modalInput, { color: theme.colors.text, borderColor: theme.colors.border }]}
          placeholder={t('name')}
          placeholderTextColor={theme.dark ? '#98989D' : '#666'}
          value={newParticipant}
          onChangeText={setNewParticipant}
          autoFocus
        />
      </Modal>

      <Modal
        visible={showAddSettlement}
        onClose={() => setShowAddSettlement(false)}
        title={t('recordSettlement')}
        type="custom"
        confirmText={t('confirm')}
        onConfirm={handleAddSettlement}
      >
        <View style={styles.pickerContainer}>
          <Text style={[styles.pickerLabel, { color: theme.colors.text }]}>{t('from')}:</Text>
          {participants.length === 0 ? (
            <Text style={[styles.noParticipantsText, { color: theme.dark ? '#98989D' : '#666' }]}>
              {t('noParticipants')}
            </Text>
          ) : (
            <View style={styles.pickerButtons}>
              {participants.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    styles.pickerButton,
                    { borderColor: theme.colors.border },
                    newSettlement.fromParticipant === p.id && { backgroundColor: customColors.primary },
                  ]}
                  onPress={() => setNewSettlement({ ...newSettlement, fromParticipant: p.id })}
                >
                  <Text style={[styles.pickerButtonText, { color: newSettlement.fromParticipant === p.id ? '#fff' : theme.colors.text }]}>
                    {p.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
        <View style={styles.pickerContainer}>
          <Text style={[styles.pickerLabel, { color: theme.colors.text }]}>{t('to')}:</Text>
          {participants.length === 0 ? (
            <Text style={[styles.noParticipantsText, { color: theme.dark ? '#98989D' : '#666' }]}>
              {t('noParticipants')}
            </Text>
          ) : (
            <View style={styles.pickerButtons}>
              {participants.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    styles.pickerButton,
                    { borderColor: theme.colors.border },
                    newSettlement.toParticipant === p.id && { backgroundColor: customColors.primary },
                  ]}
                  onPress={() => setNewSettlement({ ...newSettlement, toParticipant: p.id })}
                >
                  <Text style={[styles.pickerButtonText, { color: newSettlement.toParticipant === p.id ? '#fff' : theme.colors.text }]}>
                    {p.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
        <TextInput
          style={[styles.modalInput, { color: theme.colors.text, borderColor: theme.colors.border }]}
          placeholder={`${t('amount')} (HUF)`}
          placeholderTextColor={theme.dark ? '#98989D' : '#666'}
          value={newSettlement.amount}
          onChangeText={(text) => setNewSettlement({ ...newSettlement, amount: text })}
          keyboardType="numeric"
        />
      </Modal>

      <Modal
        visible={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title={t('deleteExpense')}
        message={t('deleteExpenseConfirm')}
        type="confirm"
        confirmText={t('delete')}
        confirmColor={customColors.danger}
        onConfirm={handleDeleteExpense}
      />

      <Modal
        visible={showDeleteAllConfirm}
        onClose={() => setShowDeleteAllConfirm(false)}
        title={t('deleteAllExpenses')}
        message={t('deleteAllExpensesConfirm')}
        type="confirm"
        confirmText={deleteAllLoading ? t('loading') : t('deleteAll')}
        confirmColor={customColors.danger}
        onConfirm={handleDeleteAllExpenses}
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

      <Modal
        visible={showImportInfo}
        onClose={() => setShowImportInfo(false)}
        title={t('importInfo')}
        message={t('importInfoMessage')}
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
  headerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  headerButton: {
    padding: 8,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 100,
  },
  section: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 8,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    textAlign: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  selectionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 8,
  },
  selectionText: {
    fontSize: 16,
    fontWeight: '600',
  },
  selectionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  selectionButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  selectionButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
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
  expenseCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  expenseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  expenseHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    flex: 1,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
  },
  expenseDescription: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  ownershipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  ownershipBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  editButton: {
    padding: 12,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderRadius: 10,
  },
  deleteButton: {
    padding: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 10,
  },
  lockedBadge: {
    padding: 12,
    borderRadius: 10,
  },
  expenseDetails: {
    gap: 4,
    marginBottom: 8,
  },
  expenseAmount: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  expenseInfo: {
    fontSize: 14,
  },
  expenseDate: {
    fontSize: 12,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  formatContainer: {
    marginBottom: 20,
  },
  formatLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  formatButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  formatButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 2,
  },
  formatButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  exportOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  exportOptionText: {
    flex: 1,
  },
  exportOptionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  exportOptionDescription: {
    fontSize: 14,
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 8,
  },
  exportButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  pickerContainer: {
    marginBottom: 12,
  },
  pickerLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  pickerButtons: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  pickerButton: {
    flex: 1,
    minWidth: '45%',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  pickerButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  noParticipantsText: {
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 8,
  },
  splitContainer: {
    marginBottom: 12,
  },
  splitModeButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  splitModeButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  splitModeButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  splitHelpText: {
    fontSize: 12,
    marginBottom: 8,
    lineHeight: 18,
  },
});
