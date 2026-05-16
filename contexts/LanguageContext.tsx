
import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Language = 'en' | 'hu' | 'de' | 'es';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

const translations: Record<Language, Record<string, string>> = {
  en: {
    // App
    appName: 'ChildCosts',
    
    // Navigation
    home: 'Home',
    balance: 'Balance',
    settings: 'Settings',
    
    // Common
    add: 'Add',
    edit: 'Edit',
    delete: 'Delete',
    deleteAll: 'Delete All',
    cancel: 'Cancel',
    save: 'Save',
    confirm: 'Confirm',
    ok: 'OK',
    error: 'Error',
    success: 'Success',
    loading: 'Loading...',
    
    // Projects
    projects: 'Projects',

    // Expenses
    expenses: 'Expenses',
    recentExpenses: 'Recent Expenses',
    noExpenses: 'No expenses yet',
    addExpense: 'Add Expense',
    editExpense: 'Edit Expense',
    deleteExpense: 'Delete Expense',
    deleteExpenseConfirm: 'Are you sure you want to delete this expense?',
    deleteAllExpenses: 'Delete All Expenses',
    deleteAllExpensesConfirm: 'Are you sure you want to delete ALL expenses? This action cannot be undone.',
    deleteAllExpensesHint: 'Delete all expenses permanently',
    deleteAllSuccess: 'Successfully deleted',
    expenseAdded: 'Expense added successfully',
    expenseUpdated: 'Expense updated successfully',
    expenseDeleted: 'Expense deleted successfully',
    unauthorizedEdit: 'Only the creator can edit this expense',
    loginRequired: 'Please log in to perform this action',
    description: 'Description',
    amount: 'Amount',
    date: 'Date',
    paidBy: 'Paid by',
    createdBy: 'Created by',
    splitPercentage: 'Split Percentage',
    splitPercentageHelp: 'Percentage of the expense to split (e.g., 50 for 50/50)',
    searchExpenses: 'Search expenses...',
    minAmount: 'Min Amount',
    maxAmount: 'Max Amount',
    
    // Split Mode
    splitMode: 'Split Mode',
    equalSplit: 'Equal Split',
    percentageSplit: 'Percentage Split',
    splitModeEqual: 'Split: Equal among all',
    equalSplitHelp: 'The expense will be split equally among all participants (including the payer).',
    percentageSplitHelp: 'Enter the payer\'s share percentage. The remaining amount will be split equally among other participants.',
    payerSharePercentage: 'Payer\'s share (%)',
    invalidPercentage: 'Please enter a valid percentage (0-100)',
    
    // Participants
    participants: 'Participants',
    noParticipants: 'No participants yet',
    addParticipant: 'Add Participant',
    addPerson: 'Add Person',
    editParticipant: 'Edit Participant',
    deleteParticipant: 'Delete Participant',
    deleteParticipantConfirm: 'Are you sure you want to delete this participant?',
    participantAdded: 'Participant added successfully',
    participantUpdated: 'Participant updated successfully',
    participantDeleted: 'Participant deleted successfully',
    name: 'Name',
    totalPaid: 'Total Paid',
    totalOwed: 'Total Owed',
    currentBalance: 'Current Balance',
    deletedParticipant: 'Deleted Participant',
    
    // Balance
    noBalance: 'All settled up!',
    owes: 'owes',
    whoOwesWhom: 'Who Owes Whom',
    
    // Settlements
    settle: 'Settle',
    recordSettlement: 'Record Settlement',
    deleteSettlement: 'Delete Settlement',
    deleteSettlementConfirm: 'Are you sure you want to delete this settlement?',
    settlementRecorded: 'Settlement recorded successfully',
    settlementDeleted: 'Settlement deleted successfully',
    from: 'From',
    to: 'To',
    failedToDeleteSettlement: 'Failed to delete settlement',
    failedToDeleteParticipant: 'Failed to delete participant',
    
    // Import/Export
    exportExpenses: 'Export Expenses',
    exportFormat: 'Export Format',
    exportAll: 'Export All Expenses',
    exportAllDescription: 'Export all expenses to file',
    exportSelected: 'Export Selected Expenses',
    exportSelectedDescription: 'Select specific expenses to export',
    exportSelectedCount: 'Export Selected',
    exportSuccess: 'Export successful',
    exportFailed: 'Export failed',
    importExpenses: 'Import Expenses',
    importDescription: 'Import expenses from CSV or Excel file (.csv, .xls, .xlsx)',
    importSuccess: 'Import successful',
    importFailed: 'Import failed',
    importErrors: 'Errors',
    importInfo: 'Import File Format',
    importInfoMessage: 'Your file should have these columns:\n\n📅 DATE COLUMN (case-insensitive):\n• English: "Date", "Timestamp"\n• German: "Datum", "Zeitpunkt"\n• Spanish: "Fecha"\n• Hungarian: "Időpont", "Idopont"\n\n💰 DESCRIPTION/COST COLUMN (case-insensitive):\n• English: "Description", "Cost", "Expense"\n• German: "Beschreibung", "Kosten"\n• Spanish: "Descripción", "Descripcion", "Costo"\n• Hungarian: "Leírás", "Leiras", "Költség", "Koltseg", "Költség megnevezése", "Koltseg megnevezese"\n\n👤 PARTICIPANT PAYMENT COLUMNS (case-insensitive):\n• English: "Paid by [Name]", "[Name] paid"\n• German: "[Name] bezahlt", "Bezahlt von [Name]"\n• Spanish: "[Name] pagó", "[Name] pago", "Pagado por [Name]"\n• Hungarian: "[Name] fizette", "Fizette: [Name]"\n\n📁 SUPPORTED FORMATS:\n• CSV (.csv)\n• Excel (.xlsx, .xls)\n\n✨ The import automatically detects column names in all 4 languages!',
    selected: 'selected',
    selectAll: 'Select All',
    deselectAll: 'Deselect All',
    noExpensesSelected: 'Please select at least one expense to export',
    
    // Settings
    language: 'Language',
    english: 'English',
    hungarian: 'Hungarian',
    german: 'German',
    spanish: 'Spanish',
    theme: 'Theme',
    account: 'Account',
    loggedInAs: 'Logged in as',
    logoutSuccess: 'Logged out successfully',
    colorCustomization: 'Color Customization',
    primaryColor: 'Primary Color',
    secondaryColor: 'Secondary Color',
    accentColor: 'Accent Color',
    dangerColor: 'Danger Color',
    customColors: 'Custom Colors',
    resetColors: 'Reset Colors',
    colorsReset: 'Colors reset to default',
    participantColors: 'Participant Colors',
    resetParticipantColors: 'Reset Participant Colors',
    participantColorsReset: 'Participant colors reset to default',
    colorUpdated: 'Color updated successfully',
    logout: 'Logout',
    logoutConfirm: 'Are you sure you want to logout?',
    
    // Auth
    login: 'Login',
    signup: 'Sign Up',
    email: 'Email',
    password: 'Password',
    loginRequiredForOwnership: 'You must be logged in to create items',
    unauthorizedDelete: 'Only the creator can delete this expense',
    unauthorizedDeleteParticipant: 'Only the creator can delete this participant',
    anonymous: 'Anonymous',
    unknown: 'Unknown',
    you: 'You',
    
    // Validation
    fillAllFields: 'Please fill all fields',
  },
  hu: {
    // App
    appName: 'ChildCosts',
    
    // Navigation
    home: 'Kezdőlap',
    balance: 'Egyenleg',
    settings: 'Beállítások',
    
    // Common
    add: 'Hozzáadás',
    edit: 'Szerkesztés',
    delete: 'Törlés',
    deleteAll: 'Összes törlése',
    cancel: 'Mégse',
    save: 'Mentés',
    confirm: 'Megerősítés',
    ok: 'OK',
    error: 'Hiba',
    success: 'Sikeres',
    loading: 'Betöltés...',
    
    // Projects
    projects: 'Projektek',

    // Expenses
    expenses: 'Kiadások',
    recentExpenses: 'Legutóbbi kiadások',
    noExpenses: 'Még nincsenek kiadások',
    addExpense: 'Kiadás hozzáadása',
    editExpense: 'Kiadás szerkesztése',
    deleteExpense: 'Kiadás törlése',
    deleteExpenseConfirm: 'Biztosan törölni szeretnéd ezt a kiadást?',
    deleteAllExpenses: 'Összes kiadás törlése',
    deleteAllExpensesConfirm: 'Biztosan törölni szeretnéd az ÖSSZES kiadást? Ez a művelet nem vonható vissza.',
    deleteAllExpensesHint: 'Összes kiadás végleges törlése',
    deleteAllSuccess: 'Sikeresen törölve',
    expenseAdded: 'Kiadás sikeresen hozzáadva',
    expenseUpdated: 'Kiadás sikeresen frissítve',
    expenseDeleted: 'Kiadás sikeresen törölve',
    unauthorizedEdit: 'Csak a létrehozó szerkesztheti ezt a kiadást',
    loginRequired: 'Kérlek jelentkezz be a művelet végrehajtásához',
    description: 'Leírás',
    amount: 'Összeg',
    date: 'Dátum',
    paidBy: 'Fizette',
    createdBy: 'Létrehozta',
    splitPercentage: 'Megosztási arány',
    splitPercentageHelp: 'A kiadás megosztási aránya (pl. 50 az 50/50-hez)',
    searchExpenses: 'Kiadások keresése...',
    minAmount: 'Min. összeg',
    maxAmount: 'Max. összeg',
    
    // Split Mode
    splitMode: 'Megosztási mód',
    equalSplit: 'Egyenlő megosztás',
    percentageSplit: 'Százalékos megosztás',
    splitModeEqual: 'Megosztás: Egyenlő mindenki között',
    equalSplitHelp: 'A kiadás egyenlően lesz megosztva minden résztvevő között (beleértve a fizetőt is).',
    percentageSplitHelp: 'Add meg a fizető részesedését százalékban. A fennmaradó összeg egyenlően lesz megosztva a többi résztvevő között.',
    payerSharePercentage: 'Fizető részesedése (%)',
    invalidPercentage: 'Kérlek adj meg egy érvényes százalékot (0-100)',
    
    // Participants
    participants: 'Résztvevők',
    noParticipants: 'Még nincsenek résztvevők',
    addParticipant: 'Résztvevő hozzáadása',
    addPerson: 'Személy hozzáadása',
    editParticipant: 'Résztvevő szerkesztése',
    deleteParticipant: 'Résztvevő törlése',
    deleteParticipantConfirm: 'Biztosan törölni szeretnéd ezt a résztvevőt?',
    participantAdded: 'Résztvevő sikeresen hozzáadva',
    participantUpdated: 'Résztvevő sikeresen frissítve',
    participantDeleted: 'Résztvevő sikeresen törölve',
    name: 'Név',
    totalPaid: 'Összes fizetett',
    totalOwed: 'Összes tartozás',
    currentBalance: 'Jelenlegi egyenleg',
    deletedParticipant: 'Törölt résztvevő',
    
    // Balance
    noBalance: 'Minden rendezve!',
    owes: 'tartozik',
    whoOwesWhom: 'Ki kinek tartozik',
    
    // Settlements
    settle: 'Rendezés',
    recordSettlement: 'Rendezés rögzítése',
    deleteSettlement: 'Rendezés törlése',
    deleteSettlementConfirm: 'Biztosan törölni szeretnéd ezt a rendezést?',
    settlementRecorded: 'Rendezés sikeresen rögzítve',
    settlementDeleted: 'Rendezés sikeresen törölve',
    from: 'Kitől',
    to: 'Kinek',
    failedToDeleteSettlement: 'Rendezés törlése sikertelen',
    failedToDeleteParticipant: 'Résztvevő törlése sikertelen',
    
    // Import/Export
    exportExpenses: 'Kiadások exportálása',
    exportFormat: 'Export formátum',
    exportAll: 'Összes kiadás exportálása',
    exportAllDescription: 'Összes kiadás exportálása fájlba',
    exportSelected: 'Kiválasztott kiadások exportálása',
    exportSelectedDescription: 'Válassz ki konkrét kiadásokat az exportáláshoz',
    exportSelectedCount: 'Kiválasztottak exportálása',
    exportSuccess: 'Exportálás sikeres',
    exportFailed: 'Exportálás sikertelen',
    importExpenses: 'Kiadások importálása',
    importDescription: 'Kiadások importálása CSV vagy Excel fájlból (.csv, .xls, .xlsx)',
    importSuccess: 'Importálás sikeres',
    importFailed: 'Importálás sikertelen',
    importErrors: 'Hibák',
    importInfo: 'Import fájl formátum',
    importInfoMessage: 'A fájlnak ezeket az oszlopokat kell tartalmaznia:\n\n📅 DÁTUM OSZLOP (kis-/nagybetű független):\n• Angol: "Date", "Timestamp"\n• Német: "Datum", "Zeitpunkt"\n• Spanyol: "Fecha"\n• Magyar: "Időpont", "Idopont"\n\n💰 LEÍRÁS/KÖLTSÉG OSZLOP (kis-/nagybetű független):\n• Angol: "Description", "Cost", "Expense"\n• Német: "Beschreibung", "Kosten"\n• Spanyol: "Descripción", "Descripcion", "Costo"\n• Magyar: "Leírás", "Leiras", "Költség", "Koltseg", "Költség megnevezése", "Koltseg megnevezese"\n\n👤 RÉSZTVEVŐ FIZETÉS OSZLOPOK (kis-/nagybetű független):\n• Angol: "Paid by [Név]", "[Név] paid"\n• Német: "[Név] bezahlt", "Bezahlt von [Név]"\n• Spanyol: "[Név] pagó", "[Név] pago", "Pagado por [Név]"\n• Magyar: "[Név] fizette", "Fizette: [Név]"\n\n📁 TÁMOGATOTT FORMÁTUMOK:\n• CSV (.csv)\n• Excel (.xlsx, .xls)\n\n✨ Az import automatikusan felismeri az oszlopneveket mind a 4 nyelven!',
    selected: 'kiválasztva',
    selectAll: 'Összes kijelölése',
    deselectAll: 'Kijelölés törlése',
    noExpensesSelected: 'Kérlek válassz ki legalább egy kiadást az exportáláshoz',
    
    // Settings
    language: 'Nyelv',
    english: 'Angol',
    hungarian: 'Magyar',
    german: 'Német',
    spanish: 'Spanyol',
    theme: 'Téma',
    account: 'Fiók',
    loggedInAs: 'Bejelentkezve mint',
    logoutSuccess: 'Sikeresen kijelentkezve',
    colorCustomization: 'Szín testreszabás',
    primaryColor: 'Elsődleges szín',
    secondaryColor: 'Másodlagos szín',
    accentColor: 'Kiemelő szín',
    dangerColor: 'Veszély szín',
    customColors: 'Egyéni színek',
    resetColors: 'Színek visszaállítása',
    colorsReset: 'Színek visszaállítva alapértelmezettre',
    participantColors: 'Résztvevő színek',
    resetParticipantColors: 'Résztvevő színek visszaállítása',
    participantColorsReset: 'Résztvevő színek visszaállítva alapértelmezettre',
    colorUpdated: 'Szín sikeresen frissítve',
    logout: 'Kijelentkezés',
    logoutConfirm: 'Biztosan ki szeretnél jelentkezni?',
    
    // Auth
    login: 'Bejelentkezés',
    signup: 'Regisztráció',
    email: 'E-mail',
    password: 'Jelszó',
    loginRequiredForOwnership: 'Be kell jelentkezned az elemek létrehozásához',
    unauthorizedDelete: 'Csak a létrehozó törölheti ezt a kiadást',
    unauthorizedDeleteParticipant: 'Csak a létrehozó törölheti ezt a résztvevőt',
    anonymous: 'Névtelen',
    unknown: 'Ismeretlen',
    you: 'Te',
    
    // Validation
    fillAllFields: 'Kérlek töltsd ki az összes mezőt',
  },
  de: {
    // App
    appName: 'ChildCosts',
    
    // Navigation
    home: 'Startseite',
    balance: 'Saldo',
    settings: 'Einstellungen',
    
    // Common
    add: 'Hinzufügen',
    edit: 'Bearbeiten',
    delete: 'Löschen',
    deleteAll: 'Alle löschen',
    cancel: 'Abbrechen',
    save: 'Speichern',
    confirm: 'Bestätigen',
    ok: 'OK',
    error: 'Fehler',
    success: 'Erfolg',
    loading: 'Lädt...',

    // Projects
    projects: 'Projekte',

    // Expenses
    expenses: 'Ausgaben',
    recentExpenses: 'Letzte Ausgaben',
    noExpenses: 'Noch keine Ausgaben',
    addExpense: 'Ausgabe hinzufügen',
    editExpense: 'Ausgabe bearbeiten',
    deleteExpense: 'Ausgabe löschen',
    deleteExpenseConfirm: 'Möchten Sie diese Ausgabe wirklich löschen?',
    deleteAllExpenses: 'Alle Ausgaben löschen',
    deleteAllExpensesConfirm: 'Möchten Sie wirklich ALLE Ausgaben löschen? Diese Aktion kann nicht rückgängig gemacht werden.',
    deleteAllExpensesHint: 'Alle Ausgaben dauerhaft löschen',
    deleteAllSuccess: 'Erfolgreich gelöscht',
    expenseAdded: 'Ausgabe erfolgreich hinzugefügt',
    expenseUpdated: 'Ausgabe erfolgreich aktualisiert',
    expenseDeleted: 'Ausgabe erfolgreich gelöscht',
    unauthorizedEdit: 'Nur der Ersteller kann diese Ausgabe bearbeiten',
    loginRequired: 'Bitte melden Sie sich an, um diese Aktion auszuführen',
    description: 'Beschreibung',
    amount: 'Betrag',
    date: 'Datum',
    paidBy: 'Bezahlt von',
    createdBy: 'Erstellt von',
    splitPercentage: 'Aufteilungsprozentsatz',
    splitPercentageHelp: 'Prozentsatz der Ausgabe zum Aufteilen (z.B. 50 für 50/50)',
    searchExpenses: 'Ausgaben suchen...',
    minAmount: 'Min. Betrag',
    maxAmount: 'Max. Betrag',
    
    // Split Mode
    splitMode: 'Aufteilungsmodus',
    equalSplit: 'Gleichmäßige Aufteilung',
    percentageSplit: 'Prozentuale Aufteilung',
    splitModeEqual: 'Aufteilung: Gleichmäßig unter allen',
    equalSplitHelp: 'Die Ausgabe wird gleichmäßig unter allen Teilnehmern aufgeteilt (einschließlich des Zahlers).',
    percentageSplitHelp: 'Geben Sie den Anteil des Zahlers in Prozent ein. Der verbleibende Betrag wird gleichmäßig unter den anderen Teilnehmern aufgeteilt.',
    payerSharePercentage: 'Anteil des Zahlers (%)',
    invalidPercentage: 'Bitte geben Sie einen gültigen Prozentsatz ein (0-100)',
    
    // Participants
    participants: 'Teilnehmer',
    noParticipants: 'Noch keine Teilnehmer',
    addParticipant: 'Teilnehmer hinzufügen',
    addPerson: 'Person hinzufügen',
    editParticipant: 'Teilnehmer bearbeiten',
    deleteParticipant: 'Teilnehmer löschen',
    deleteParticipantConfirm: 'Möchten Sie diesen Teilnehmer wirklich löschen?',
    participantAdded: 'Teilnehmer erfolgreich hinzugefügt',
    participantUpdated: 'Teilnehmer erfolgreich aktualisiert',
    participantDeleted: 'Teilnehmer erfolgreich gelöscht',
    name: 'Name',
    totalPaid: 'Gesamt bezahlt',
    totalOwed: 'Gesamt geschuldet',
    currentBalance: 'Aktueller Saldo',
    deletedParticipant: 'Gelöschter Teilnehmer',
    
    // Balance
    noBalance: 'Alles ausgeglichen!',
    owes: 'schuldet',
    whoOwesWhom: 'Wer schuldet wem',
    
    // Settlements
    settle: 'Ausgleichen',
    recordSettlement: 'Ausgleich aufzeichnen',
    deleteSettlement: 'Ausgleich löschen',
    deleteSettlementConfirm: 'Möchten Sie diesen Ausgleich wirklich löschen?',
    settlementRecorded: 'Ausgleich erfolgreich aufgezeichnet',
    settlementDeleted: 'Ausgleich erfolgreich gelöscht',
    from: 'Von',
    to: 'An',
    failedToDeleteSettlement: 'Löschen des Ausgleichs fehlgeschlagen',
    failedToDeleteParticipant: 'Löschen des Teilnehmers fehlgeschlagen',
    
    // Import/Export
    exportExpenses: 'Ausgaben exportieren',
    exportFormat: 'Exportformat',
    exportAll: 'Alle Ausgaben exportieren',
    exportAllDescription: 'Alle Ausgaben in Datei exportieren',
    exportSelected: 'Ausgewählte Ausgaben exportieren',
    exportSelectedDescription: 'Bestimmte Ausgaben zum Exportieren auswählen',
    exportSelectedCount: 'Ausgewählte exportieren',
    exportSuccess: 'Export erfolgreich',
    exportFailed: 'Export fehlgeschlagen',
    importExpenses: 'Ausgaben importieren',
    importDescription: 'Ausgaben aus CSV- oder Excel-Datei importieren (.csv, .xls, .xlsx)',
    importSuccess: 'Import erfolgreich',
    importFailed: 'Import fehlgeschlagen',
    importErrors: 'Fehler',
    importInfo: 'Import-Dateiformat',
    importInfoMessage: 'Ihre Datei sollte diese Spalten enthalten:\n\n📅 DATUMSSPALTE (Groß-/Kleinschreibung unabhängig):\n• Englisch: "Date", "Timestamp"\n• Deutsch: "Datum", "Zeitpunkt"\n• Spanisch: "Fecha"\n• Ungarisch: "Időpont", "Idopont"\n\n💰 BESCHREIBUNG/KOSTEN SPALTE (Groß-/Kleinschreibung unabhängig):\n• Englisch: "Description", "Cost", "Expense"\n• Deutsch: "Beschreibung", "Kosten"\n• Spanisch: "Descripción", "Descripcion", "Costo"\n• Ungarisch: "Leírás", "Leiras", "Költség", "Koltseg", "Költség megnevezése", "Koltseg megnevezese"\n\n👤 TEILNEHMER ZAHLUNGSSPALTEN (Groß-/Kleinschreibung unabhängig):\n• Englisch: "Paid by [Name]", "[Name] paid"\n• Deutsch: "[Name] bezahlt", "Bezahlt von [Name]"\n• Spanisch: "[Name] pagó", "[Name] pago", "Pagado por [Name]"\n• Ungarisch: "[Name] fizette", "Fizette: [Name]"\n\n📁 UNTERSTÜTZTE FORMATE:\n• CSV (.csv)\n• Excel (.xlsx, .xls)\n\n✨ Der Import erkennt automatisch Spaltennamen in allen 4 Sprachen!',
    selected: 'ausgewählt',
    selectAll: 'Alle auswählen',
    deselectAll: 'Auswahl aufheben',
    noExpensesSelected: 'Bitte wählen Sie mindestens eine Ausgabe zum Exportieren aus',
    
    // Settings
    language: 'Sprache',
    english: 'Englisch',
    hungarian: 'Ungarisch',
    german: 'Deutsch',
    spanish: 'Spanisch',
    theme: 'Thema',
    customColors: 'Benutzerdefinierte Farben',
    resetColors: 'Farben zurücksetzen',
    colorsReset: 'Farben auf Standard zurückgesetzt',
    logout: 'Abmelden',
    logoutConfirm: 'Möchten Sie sich wirklich abmelden?',
    
    // Auth
    login: 'Anmelden',
    signup: 'Registrieren',
    email: 'E-Mail',
    password: 'Passwort',
    loginRequiredForOwnership: 'Sie müssen angemeldet sein, um Elemente zu erstellen',
    unauthorizedDelete: 'Nur der Ersteller kann diese Ausgabe löschen',
    unauthorizedDeleteParticipant: 'Nur der Ersteller kann diesen Teilnehmer löschen',
    anonymous: 'Anonym',
    unknown: 'Unbekannt',
    you: 'Sie',
    
    // Validation
    fillAllFields: 'Bitte füllen Sie alle Felder aus',
  },
  es: {
    // App
    appName: 'ChildCosts',
    
    // Navigation
    home: 'Inicio',
    balance: 'Balance',
    settings: 'Configuración',
    
    // Common
    add: 'Añadir',
    edit: 'Editar',
    delete: 'Eliminar',
    deleteAll: 'Eliminar todo',
    cancel: 'Cancelar',
    save: 'Guardar',
    confirm: 'Confirmar',
    ok: 'OK',
    error: 'Error',
    success: 'Éxito',
    loading: 'Cargando...',

    // Projects
    projects: 'Proyectos',

    // Expenses
    expenses: 'Gastos',
    recentExpenses: 'Gastos recientes',
    noExpenses: 'Aún no hay gastos',
    addExpense: 'Añadir gasto',
    editExpense: 'Editar gasto',
    deleteExpense: 'Eliminar gasto',
    deleteExpenseConfirm: '¿Está seguro de que desea eliminar este gasto?',
    deleteAllExpenses: 'Eliminar todos los gastos',
    deleteAllExpensesConfirm: '¿Está seguro de que desea eliminar TODOS los gastos? Esta acción no se puede deshacer.',
    deleteAllExpensesHint: 'Eliminar todos los gastos permanentemente',
    deleteAllSuccess: 'Eliminado exitosamente',
    expenseAdded: 'Gasto añadido correctamente',
    expenseUpdated: 'Gasto actualizado correctamente',
    expenseDeleted: 'Gasto eliminado correctamente',
    unauthorizedEdit: 'Solo el creador puede editar este gasto',
    loginRequired: 'Por favor inicie sesión para realizar esta acción',
    description: 'Descripción',
    amount: 'Cantidad',
    date: 'Fecha',
    paidBy: 'Pagado por',
    createdBy: 'Creado por',
    splitPercentage: 'Porcentaje de división',
    splitPercentageHelp: 'Porcentaje del gasto a dividir (ej. 50 para 50/50)',
    searchExpenses: 'Buscar gastos...',
    minAmount: 'Cantidad mín.',
    maxAmount: 'Cantidad máx.',
    
    // Split Mode
    splitMode: 'Modo de división',
    equalSplit: 'División igual',
    percentageSplit: 'División porcentual',
    splitModeEqual: 'División: Igual entre todos',
    equalSplitHelp: 'El gasto se dividirá equitativamente entre todos los participantes (incluido el pagador).',
    percentageSplitHelp: 'Ingrese el porcentaje de participación del pagador. La cantidad restante se dividirá equitativamente entre los demás participantes.',
    payerSharePercentage: 'Participación del pagador (%)',
    invalidPercentage: 'Por favor ingrese un porcentaje válido (0-100)',
    
    // Participants
    participants: 'Participantes',
    noParticipants: 'Aún no hay participantes',
    addParticipant: 'Añadir participante',
    addPerson: 'Añadir persona',
    editParticipant: 'Editar participante',
    deleteParticipant: 'Eliminar participante',
    deleteParticipantConfirm: '¿Está seguro de que desea eliminar este participante?',
    participantAdded: 'Participante añadido correctamente',
    participantUpdated: 'Participante actualizado correctamente',
    participantDeleted: 'Participante eliminado correctamente',
    name: 'Nombre',
    totalPaid: 'Total pagado',
    totalOwed: 'Total adeudado',
    currentBalance: 'Balance actual',
    deletedParticipant: 'Participante eliminado',
    
    // Balance
    noBalance: '¡Todo saldado!',
    owes: 'debe',
    whoOwesWhom: 'Quién debe a quién',
    
    // Settlements
    settle: 'Saldar',
    recordSettlement: 'Registrar saldo',
    deleteSettlement: 'Eliminar saldo',
    deleteSettlementConfirm: '¿Está seguro de que desea eliminar este saldo?',
    settlementRecorded: 'Saldo registrado correctamente',
    settlementDeleted: 'Saldo eliminado correctamente',
    from: 'De',
    to: 'Para',
    failedToDeleteSettlement: 'Error al eliminar el saldo',
    failedToDeleteParticipant: 'Error al eliminar el participante',
    
    // Import/Export
    exportExpenses: 'Exportar gastos',
    exportFormat: 'Formato de exportación',
    exportAll: 'Exportar todos los gastos',
    exportAllDescription: 'Exportar todos los gastos a archivo',
    exportSelected: 'Exportar gastos seleccionados',
    exportSelectedDescription: 'Seleccionar gastos específicos para exportar',
    exportSelectedCount: 'Exportar seleccionados',
    exportSuccess: 'Exportación exitosa',
    exportFailed: 'Exportación fallida',
    importExpenses: 'Importar gastos',
    importDescription: 'Importar gastos desde archivo CSV o Excel (.csv, .xls, .xlsx)',
    importSuccess: 'Importación exitosa',
    importFailed: 'Importación fallida',
    importErrors: 'Errores',
    importInfo: 'Formato de archivo de importación',
    importInfoMessage: 'Su archivo debe tener estas columnas:\n\n📅 COLUMNA DE FECHA (no distingue mayúsculas/minúsculas):\n• Inglés: "Date", "Timestamp"\n• Alemán: "Datum", "Zeitpunkt"\n• Español: "Fecha"\n• Húngaro: "Időpont", "Idopont"\n\n💰 COLUMNA DE DESCRIPCIÓN/COSTO (no distingue mayúsculas/minúsculas):\n• Inglés: "Description", "Cost", "Expense"\n• Alemán: "Beschreibung", "Kosten"\n• Español: "Descripción", "Descripcion", "Costo"\n• Húngaro: "Leírás", "Leiras", "Költség", "Koltseg", "Költség megnevezése", "Koltseg megnevezese"\n\n👤 COLUMNAS DE PAGO DE PARTICIPANTES (no distingue mayúsculas/minúsculas):\n• Inglés: "Paid by [Nombre]", "[Nombre] paid"\n• Alemán: "[Nombre] bezahlt", "Bezahlt von [Nombre]"\n• Español: "[Nombre] pagó", "[Nombre] pago", "Pagado por [Nombre]"\n• Húngaro: "[Nombre] fizette", "Fizette: [Nombre]"\n\n📁 FORMATOS COMPATIBLES:\n• CSV (.csv)\n• Excel (.xlsx, .xls)\n\n✨ ¡La importación detecta automáticamente los nombres de columna en los 4 idiomas!',
    selected: 'seleccionado',
    selectAll: 'Seleccionar todo',
    deselectAll: 'Deseleccionar todo',
    noExpensesSelected: 'Por favor seleccione al menos un gasto para exportar',
    
    // Settings
    language: 'Idioma',
    english: 'Inglés',
    hungarian: 'Húngaro',
    german: 'Alemán',
    spanish: 'Español',
    theme: 'Tema',
    customColors: 'Colores personalizados',
    resetColors: 'Restablecer colores',
    colorsReset: 'Colores restablecidos a predeterminados',
    logout: 'Cerrar sesión',
    logoutConfirm: '¿Está seguro de que desea cerrar sesión?',
    
    // Auth
    login: 'Iniciar sesión',
    signup: 'Registrarse',
    email: 'Correo electrónico',
    password: 'Contraseña',
    loginRequiredForOwnership: 'Debe iniciar sesión para crear elementos',
    unauthorizedDelete: 'Solo el creador puede eliminar este gasto',
    unauthorizedDeleteParticipant: 'Solo el creador puede eliminar este participante',
    anonymous: 'Anónimo',
    unknown: 'Desconocido',
    you: 'Tú',
    
    // Validation
    fillAllFields: 'Por favor complete todos los campos',
  },
};

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>('en');

  useEffect(() => {
    const loadLanguage = async () => {
      try {
        const savedLanguage = await AsyncStorage.getItem('language');
        if (savedLanguage === 'en' || savedLanguage === 'hu' || savedLanguage === 'de' || savedLanguage === 'es') {
          setLanguageState(savedLanguage);
        }
      } catch (error) {
        console.error('[Language] Failed to load language preference:', error);
      }
    };
    loadLanguage();
  }, []);

  const setLanguage = async (lang: Language) => {
    try {
      await AsyncStorage.setItem('language', lang);
      setLanguageState(lang);
      console.log('[Language] Language changed to:', lang);
    } catch (error) {
      console.error('[Language] Failed to save language preference:', error);
    }
  };

  const t = (key: string): string => {
    return translations[language][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};
