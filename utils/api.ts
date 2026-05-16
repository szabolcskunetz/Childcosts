
import Constants from "expo-constants";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { BEARER_TOKEN_KEY } from "@/lib/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Backend URL is configured in app.json under expo.extra.backendUrl
 * It is set automatically when the backend is deployed
 */
export const BACKEND_URL = Constants.expoConfig?.extra?.backendUrl || "";

/**
 * Check if backend is properly configured
 */
export const isBackendConfigured = (): boolean => {
  return !!BACKEND_URL && BACKEND_URL.length > 0;
};

/**
 * Get bearer token from platform-specific storage
 * Web: localStorage
 * Native: SecureStore
 *
 * @returns Bearer token or null if not found
 */
export const getBearerToken = async (): Promise<string | null> => {
  try {
    if (Platform.OS === "web") {
      return localStorage.getItem(BEARER_TOKEN_KEY);
    } else {
      return await SecureStore.getItemAsync(BEARER_TOKEN_KEY);
    }
  } catch (error) {
    console.error("[API] Error retrieving bearer token:", error);
    return null;
  }
};

/**
 * Get all historical user IDs from AsyncStorage
 * These are used for ownership checks when a user's ID has changed
 * 
 * @returns Array of historical user IDs
 */
export const getHistoricalUserIds = async (): Promise<string[]> => {
  try {
    const storedIds = await AsyncStorage.getItem('@childcosts_all_user_ids');
    if (storedIds) {
      const parsed = JSON.parse(storedIds);
      console.log('[API] Retrieved historical user IDs:', parsed);
      return Array.isArray(parsed) ? parsed : [];
    }
    return [];
  } catch (error) {
    console.error("[API] Error retrieving historical user IDs:", error);
    return [];
  }
};

/**
 * Generic API call helper with error handling
 *
 * @param endpoint - API endpoint path (e.g., '/users', '/auth/login')
 * @param options - Fetch options (method, headers, body, etc.)
 * @returns Parsed JSON response
 * @throws Error if backend is not configured or request fails
 */
export const apiCall = async <T = any>(
  endpoint: string,
  options?: RequestInit
): Promise<T> => {
  if (!isBackendConfigured()) {
    throw new Error("Backend URL not configured. Please rebuild the app.");
  }

  const url = `${BACKEND_URL}${endpoint}`;
  console.log("[API] Calling:", url, options?.method || "GET");

  try {
    const fetchOptions: RequestInit = {
      ...options,
      headers: {
        ...options?.headers,
      },
    };

    if (options?.body) {
      fetchOptions.headers = {
        "Content-Type": "application/json",
        ...fetchOptions.headers,
      };
    }

    // Add bearer token if available
    const token = await getBearerToken();
    if (token) {
      fetchOptions.headers = {
        ...fetchOptions.headers,
        Authorization: `Bearer ${token}`,
      };
    }

    // Add historical user IDs header for ownership checks
    // This allows users to edit/delete content created with old user IDs
    const historicalUserIds = await getHistoricalUserIds();
    if (historicalUserIds.length > 0) {
      fetchOptions.headers = {
        ...fetchOptions.headers,
        'X-Historical-User-IDs': historicalUserIds.join(','),
      };
      console.log('[API] Added historical user IDs header:', historicalUserIds.join(','));
    }

    console.log("[API] Fetch options:", fetchOptions);

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const text = await response.text();
      console.error("[API] Error response:", response.status, text);
      
      // Try to parse error response as JSON to get structured error message
      // Backend returns: { error: string, message: string, statusCode: number }
      try {
        const errorData = JSON.parse(text);
        const errorMessage = errorData.message || errorData.error || text;
        throw new Error(errorMessage);
      } catch (parseError) {
        // If parsing fails, use the raw text
        throw new Error(`API error: ${response.status} - ${text}`);
      }
    }

    const data = await response.json();
    console.log("[API] Success:", data);
    return data;
  } catch (error) {
    // Enhanced error logging with more details
    if (error instanceof TypeError && error.message.includes('fetch')) {
      // Network error - can't reach the server
      console.error("[API] Network error - cannot reach backend:", url);
      console.error("[API] This could be due to:");
      console.error("  1. Backend server is not running");
      console.error("  2. CORS is blocking the request");
      console.error("  3. Network connectivity issues");
      console.error("  4. Invalid backend URL");
      throw new Error("Cannot connect to server. Please check your internet connection.");
    }
    
    console.error("[API] Request failed:", error);
    console.error("[API] Error details:", {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : 'Unknown',
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
};

/**
 * GET request helper
 */
export const apiGet = async <T = any>(endpoint: string): Promise<T> => {
  return apiCall<T>(endpoint, { method: "GET" });
};

/**
 * POST request helper
 */
export const apiPost = async <T = any>(
  endpoint: string,
  data: any
): Promise<T> => {
  return apiCall<T>(endpoint, {
    method: "POST",
    body: JSON.stringify(data),
  });
};

/**
 * PUT request helper
 */
export const apiPut = async <T = any>(
  endpoint: string,
  data: any
): Promise<T> => {
  return apiCall<T>(endpoint, {
    method: "PUT",
    body: JSON.stringify(data),
  });
};

/**
 * PATCH request helper
 */
export const apiPatch = async <T = any>(
  endpoint: string,
  data: any
): Promise<T> => {
  return apiCall<T>(endpoint, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
};

/**
 * DELETE request helper
 */
export const apiDelete = async <T = any>(endpoint: string): Promise<T> => {
  return apiCall<T>(endpoint, {
    method: "DELETE",
  });
};

/**
 * Authenticated API call helper
 * Automatically retrieves bearer token from storage and adds to Authorization header
 *
 * @param endpoint - API endpoint path
 * @param options - Fetch options (method, headers, body, etc.)
 * @returns Parsed JSON response
 * @throws Error if token not found or request fails
 */
export const authenticatedApiCall = async <T = any>(
  endpoint: string,
  options?: RequestInit
): Promise<T> => {
  const token = await getBearerToken();

  if (!token) {
    throw new Error("Authentication token not found. Please sign in.");
  }

  return apiCall<T>(endpoint, {
    ...options,
    headers: {
      ...options?.headers,
      Authorization: `Bearer ${token}`,
    },
  });
};

/**
 * Authenticated GET request
 */
export const authenticatedGet = async <T = any>(endpoint: string): Promise<T> => {
  return authenticatedApiCall<T>(endpoint, { method: "GET" });
};

/**
 * Authenticated POST request
 */
export const authenticatedPost = async <T = any>(
  endpoint: string,
  data: any
): Promise<T> => {
  return authenticatedApiCall<T>(endpoint, {
    method: "POST",
    body: JSON.stringify(data),
  });
};

/**
 * Authenticated PUT request
 */
export const authenticatedPut = async <T = any>(
  endpoint: string,
  data: any
): Promise<T> => {
  return authenticatedApiCall<T>(endpoint, {
    method: "PUT",
    body: JSON.stringify(data),
  });
};

/**
 * Authenticated PATCH request
 */
export const authenticatedPatch = async <T = any>(
  endpoint: string,
  data: any
): Promise<T> => {
  return authenticatedApiCall<T>(endpoint, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
};

/**
 * Authenticated DELETE request
 */
export const authenticatedDelete = async <T = any>(endpoint: string): Promise<T> => {
  return authenticatedApiCall<T>(endpoint, {
    method: "DELETE",
  });
};

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface Participant {
  id: string;
  name: string;
  color?: string;
  createdAt: string;
  createdBy?: string | { id: string } | null;
}

export interface ParticipantWithBalance extends Participant {
  totalPaid: number;
  totalOwed: number;
  balance: number;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  date: string;
  paidBy: Participant | null;
  splitPercentage: number;
  createdAt: string;
  createdBy: string | { id: string; name: string; color?: string } | null;
}

export interface Settlement {
  id: string;
  fromParticipant: Participant | null;
  toParticipant: Participant | null;
  amount: number;
  date: string;
  description: string;
  createdAt: string;
}

export interface BalanceResponse {
  participants: ParticipantWithBalance[];
  whoOwesWhom: {
    from: string;
    to: string;
    amount: number;
  }[] | null;
}

export interface WhoOwesWhomItem {
  from: string;
  to: string;
  amount: number;
}

// ============================================================================
// API SERVICE OBJECTS
// ============================================================================

/**
 * Expenses API
 * Handles all expense-related operations
 */
export const expensesApi = {
  /**
   * Get all expenses with optional filters
   */
  getAll: async (filters?: { search?: string; minAmount?: number; maxAmount?: number }): Promise<Expense[]> => {
    const params = new URLSearchParams();
    if (filters?.search) params.append('search', filters.search);
    if (filters?.minAmount !== undefined) params.append('minAmount', filters.minAmount.toString());
    if (filters?.maxAmount !== undefined) params.append('maxAmount', filters.maxAmount.toString());
    
    const queryString = params.toString();
    const endpoint = queryString ? `/api/expenses?${queryString}` : '/api/expenses';
    
    return apiGet<Expense[]>(endpoint);
  },

  /**
   * Create a new expense
   * @param expense - Expense data including createdBy (user ID or null for anonymous)
   */
  create: async (expense: { 
    description: string; 
    amount: number; 
    date: string; 
    paidBy: string;
    splitPercentage: number; 
    createdBy: string | null;
  }): Promise<Expense> => {
    return apiPost<Expense>('/api/expenses', expense);
  },

  /**
   * Update an existing expense
   * Backend will automatically verify ownership via auth session + historical user IDs header
   */
  update: async (expenseId: string, expense: { description?: string; amount?: number; date?: string; paidBy?: string; splitPercentage?: number }): Promise<Expense> => {
    console.log('[API] Updating expense:', expenseId, 'with data:', expense);
    return apiPut<Expense>(`/api/expenses/${expenseId}`, expense);
  },

  /**
   * Delete an expense
   * Backend will automatically verify ownership via auth session + historical user IDs header
   * Only the creator (or user with matching historical user ID) can delete their own expenses
   * @param expenseId - ID of the expense to delete
   */
  delete: async (expenseId: string): Promise<void> => {
    console.log('[API] Deleting expense:', expenseId);
    return apiDelete<void>(`/api/expenses/${expenseId}`);
  },

  /**
   * Delete all expenses
   * @returns Object with success status and count of deleted expenses
   */
  deleteAll: async (): Promise<{ success: boolean; deletedCount: number }> => {
    console.log('[API] Deleting all expenses');
    return apiDelete<{ success: boolean; deletedCount: number }>('/api/expenses/all');
  },

  /**
   * Export expenses to CSV or Excel
   * @param format - Export format: 'csv' or 'xlsx' (default: 'csv')
   * @param ids - Optional comma-separated list of expense IDs to export
   * @returns Blob containing the exported file
   */
  export: async (format: 'csv' | 'xlsx' = 'csv', ids?: string): Promise<Blob> => {
    if (!isBackendConfigured()) {
      throw new Error("Backend URL not configured. Please rebuild the app.");
    }

    const params = new URLSearchParams();
    params.append('format', format);
    if (ids) {
      params.append('ids', ids);
    }

    const url = `${BACKEND_URL}/api/expenses/export?${params.toString()}`;
    const token = await getBearerToken();
    
    console.log('[Export] Requesting export:', url);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Export failed: ${response.status} - ${text}`);
    }

    return response.blob();
  },

  /**
   * Import expenses from CSV or Excel
   * @param file - File object with uri, name, and type
   * @returns Import result with count of imported expenses and any errors
   */
  import: async (file: { uri: string; name: string; type: string }): Promise<{ imported: number; errors: string[] }> => {
    if (!isBackendConfigured()) {
      throw new Error("Backend URL not configured. Please rebuild the app.");
    }

    console.log('[Import] Preparing file upload:', file.name, file.type);

    const formData = new FormData();
    
    if (Platform.OS === 'web') {
      const response = await fetch(file.uri);
      const blob = await response.blob();
      const webFile = new File([blob], file.name, { type: file.type });
      formData.append('file', webFile);
      console.log('[Import] Web file prepared:', webFile.name, webFile.size, 'bytes');
    } else {
      formData.append('file', {
        uri: file.uri,
        name: file.name,
        type: file.type,
      } as any);
      console.log('[Import] Native file prepared:', file.name);
    }

    const url = `${BACKEND_URL}/api/expenses/import`;
    const token = await getBearerToken();

    console.log('[Import] Uploading to:', url);

    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
    });

    console.log('[Import] Response status:', response.status);

    if (!response.ok) {
      const text = await response.text();
      console.error('[Import] Upload failed:', response.status, text);
      
      try {
        const errorData = JSON.parse(text);
        const errorMessage = errorData.error || text;
        throw new Error(`Import failed: ${response.status} - ${errorMessage}`);
      } catch {
        throw new Error(`Import failed: ${response.status} - ${text}`);
      }
    }

    const result = await response.json();
    console.log('[Import] Upload successful:', result);
    return result;
  },
};

/**
 * Participants API
 * Handles all participant-related operations
 */
export const participantsApi = {
  /**
   * Get all participants
   */
  getAll: async (): Promise<Participant[]> => {
    return apiGet<Participant[]>('/api/participants');
  },

  /**
   * Create a new participant
   * @param name - Participant name
   * @param createdByUserId - Optional user ID who is creating this participant (for ownership tracking)
   */
  create: async (name: string, createdByUserId?: string | null): Promise<Participant> => {
    const body: { name: string; createdBy?: string | null } = { name };
    if (createdByUserId !== undefined) {
      body.createdBy = createdByUserId;
    }
    return apiPost<Participant>('/api/participants', body);
  },

  /**
   * Update a participant's name
   */
  update: async (participantId: string, name: string): Promise<Participant> => {
    return apiPut<Participant>(`/api/participants/${participantId}`, { name });
  },

  /**
   * Delete a participant
   * @param participantId - ID of the participant to delete
   * @param createdByUserId - Optional user ID for ownership verification (if provided, only creator can delete)
   */
  delete: async (participantId: string, createdByUserId?: string): Promise<void> => {
    const endpoint = createdByUserId 
      ? `/api/participants/${participantId}?createdBy=${createdByUserId}`
      : `/api/participants/${participantId}`;
    return apiDelete<void>(endpoint);
  },

  /**
   * Get balance information for all participants
   */
  getBalance: async (): Promise<BalanceResponse> => {
    return apiGet<BalanceResponse>('/api/participants/balance');
  },
};

/**
 * Settlements API
 * Handles all settlement-related operations
 */
export const settlementsApi = {
  /**
   * Get all settlements
   */
  getAll: async (): Promise<Settlement[]> => {
    return apiGet<Settlement[]>('/api/settlements');
  },

  /**
   * Create a new settlement
   */
  create: async (settlement: { fromParticipant: string; toParticipant: string; amount: number; date: string; description: string }): Promise<Settlement> => {
    return apiPost<Settlement>('/api/settlements', settlement);
  },

  /**
   * Delete a settlement
   */
  delete: async (settlementId: string): Promise<void> => {
    return apiDelete<void>(`/api/settlements/${settlementId}`);
  },
};
