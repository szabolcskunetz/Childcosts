import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@react-navigation/native';
import { IconSymbol } from '@/components/IconSymbol';
import Modal from '@/components/ui/Modal';
import { useProject } from '@/contexts/ProjectContext';
import { useLanguage } from '@/contexts/LanguageContext';

export default function ProjectsScreen() {
  const theme = useTheme();
  const { t } = useLanguage();
  const {
    projects,
    activeProjectId,
    loading,
    refresh,
    setActiveProjectId,
    createProject,
    renameProject,
    deleteProject,
  } = useProject();

  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [showRename, setShowRename] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await createProject(name);
      setNewName('');
      setShowCreate(false);
    } catch (e: any) {
      setError(e?.message || 'Failed to create project');
    } finally {
      setBusy(false);
    }
  };

  const openRename = (id: string, current: string) => {
    setRenameId(id);
    setRenameValue(current);
    setShowRename(true);
  };

  const handleRename = async () => {
    if (!renameId) return;
    const name = renameValue.trim();
    if (!name) return;
    setBusy(true);
    try {
      await renameProject(renameId, name);
      setShowRename(false);
      setRenameId(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to rename project');
    } finally {
      setBusy(false);
    }
  };

  const openDelete = (id: string, name: string) => {
    setDeleteTarget({ id, name });
    setShowDelete(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await deleteProject(deleteTarget.id);
      setShowDelete(false);
      setDeleteTarget(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to delete project');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Projects</Text>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: theme.colors.primary }]}
          onPress={() => setShowCreate(true)}
        >
          <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={20} color="#fff" />
          <Text style={styles.addButtonText}>New</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {projects.length === 0 ? (
            <View style={styles.center}>
              <Text style={{ color: theme.colors.text, opacity: 0.6 }}>
                No projects yet. Tap "New" to create one.
              </Text>
            </View>
          ) : (
            projects.map((p) => {
              const isActive = p.id === activeProjectId;
              return (
                <View
                  key={p.id}
                  style={[
                    styles.row,
                    {
                      backgroundColor: theme.colors.card,
                      borderColor: isActive ? theme.colors.primary : theme.colors.border,
                      borderWidth: isActive ? 2 : 1,
                    },
                  ]}
                >
                  <TouchableOpacity
                    style={styles.rowMain}
                    onPress={() => setActiveProjectId(p.id)}
                  >
                    <IconSymbol
                      ios_icon_name={isActive ? 'checkmark.circle.fill' : 'folder'}
                      android_material_icon_name={isActive ? 'check-circle' : 'folder'}
                      size={22}
                      color={isActive ? theme.colors.primary : theme.colors.text}
                    />
                    <Text style={[styles.rowName, { color: theme.colors.text }]}>{p.name}</Text>
                    {isActive && (
                      <Text style={[styles.activeBadge, { color: theme.colors.primary }]}>active</Text>
                    )}
                  </TouchableOpacity>
                  <View style={styles.rowActions}>
                    <TouchableOpacity
                      onPress={() => openRename(p.id, p.name)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={20} color={theme.colors.text} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => openDelete(p.id, p.name)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={20} color="#dc2626" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Create modal */}
      <Modal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        title="New project"
        type="confirm"
        confirmText={busy ? 'Creating…' : 'Create'}
        cancelText="Cancel"
        onConfirm={handleCreate}
      >
        <TextInput
          style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border }]}
          placeholder="Project name (e.g. Vacation 2026)"
          placeholderTextColor={theme.colors.text + '80'}
          value={newName}
          onChangeText={setNewName}
          autoFocus
        />
      </Modal>

      {/* Rename modal */}
      <Modal
        visible={showRename}
        onClose={() => setShowRename(false)}
        title="Rename project"
        type="confirm"
        confirmText={busy ? 'Saving…' : 'Save'}
        cancelText="Cancel"
        onConfirm={handleRename}
      >
        <TextInput
          style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border }]}
          placeholder="Project name"
          placeholderTextColor={theme.colors.text + '80'}
          value={renameValue}
          onChangeText={setRenameValue}
          autoFocus
        />
      </Modal>

      {/* Delete confirmation */}
      <Modal
        visible={showDelete}
        onClose={() => setShowDelete(false)}
        title="Delete project?"
        message={
          deleteTarget
            ? `"${deleteTarget.name}" will be permanently deleted along with all of its participants, expenses, and settlements. This cannot be undone.`
            : ''
        }
        type="confirm"
        confirmText={busy ? 'Deleting…' : 'Delete'}
        cancelText="Cancel"
        confirmColor="#dc2626"
        onConfirm={handleDelete}
      />

      {/* Error modal */}
      <Modal
        visible={!!error}
        onClose={() => setError(null)}
        title="Error"
        message={error || ''}
        type="alert"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  title: { fontSize: 28, fontWeight: '700' },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addButtonText: { color: '#fff', fontWeight: '600' },
  list: { padding: 20, paddingBottom: 140 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowName: { fontSize: 17, fontWeight: '500', flex: 1 },
  activeBadge: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  rowActions: { flexDirection: 'row', gap: 16, paddingLeft: 12 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginTop: 8,
  },
});
