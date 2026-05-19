// Copyright (c) 2026 Kunetz Szabolcs. All rights reserved.

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { Platform } from "react-native";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { authClient, setBearerToken, clearAuthTokens } from "@/lib/auth";
import { BACKEND_URL } from "@/utils/api";

const SOCIAL_SIGN_IN_SESSION_POLL_ATTEMPTS = 10;
const SOCIAL_SIGN_IN_SESSION_POLL_DELAY_MS = 500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const LOCAL_USER_ID_KEY = "@childcosts_local_user_id";
const ALL_USER_IDS_KEY = "@childcosts_all_user_ids";

interface User {
  id: string;
  email: string;
  name?: string;
  image?: string;
}

interface AuthContextType {
  user: User | null;
  localUserId: string | null;
  allUserIds: string[];
  loading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (
    email: string,
    password: string,
    name?: string,
  ) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signInWithGitHub: () => Promise<void>;
  signOut: () => Promise<void>;
  fetchUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper function to parse Better Auth error responses
// Backend now returns consistent format: { error: string, message: string, statusCode: number }
function parseAuthError(error: any): { message: string; code: string } {
  console.log("[Auth] Parsing error:", JSON.stringify(error, null, 2));

  let errorMessage = "Authentication failed";
  let errorCode = "";

  // Better Auth can throw errors in multiple formats:
  // 1. Direct error object from backend: { error: "EMAIL_NOT_VERIFIED", message: "...", statusCode: 401 }
  // 2. Wrapped in error.error or error.response
  // 3. As error.message string
  // 4. As plain string
  // 5. In error.json or error.data
  // 6. Fetch API error with response text

  // Try to extract the actual error data
  let errorData = error;

  // If error is wrapped in a json property (Better Auth format)
  if (error?.json) {
    try {
      errorData =
        typeof error.json === "string" ? JSON.parse(error.json) : error.json;
      console.log("[Auth] Extracted from error.json:", errorData);
    } catch (parseError) {
      console.error("[Auth] Failed to parse error.json:", parseError);
    }
  }

  // If error is wrapped in a response property
  if (error?.response) {
    try {
      errorData =
        typeof error.response === "string"
          ? JSON.parse(error.response)
          : error.response;
      console.log("[Auth] Extracted from error.response:", errorData);
    } catch (parseError) {
      console.error("[Auth] Failed to parse error.response:", parseError);
    }
  }

  // If error has a data property (axios-style)
  if (errorData?.data) {
    errorData = errorData.data;
    console.log("[Auth] Extracted from error.data:", errorData);
  }

  // If error has a body property (fetch API)
  if (errorData?.body) {
    try {
      errorData =
        typeof errorData.body === "string"
          ? JSON.parse(errorData.body)
          : errorData.body;
      console.log("[Auth] Extracted from error.body:", errorData);
    } catch (parseError) {
      console.error("[Auth] Failed to parse error.body:", parseError);
    }
  }

  // Now extract error code and message
  // Priority 1: error.error and error.message (backend format - NEW STRUCTURED FORMAT)
  if (errorData?.error && typeof errorData.error === "string") {
    errorCode = String(errorData.error).toUpperCase();
    errorMessage = errorData.message || errorMessage;
    console.log(
      "[Auth] Format 1 - error.error:",
      errorCode,
      "message:",
      errorMessage,
    );
  }
  // Priority 2: error.code and error.message (alternative format)
  else if (errorData?.code && typeof errorData.code === "string") {
    errorCode = String(errorData.code).toUpperCase();
    errorMessage = errorData.message || errorMessage;
    console.log(
      "[Auth] Format 2 - error.code:",
      errorCode,
      "message:",
      errorMessage,
    );
  }
  // Priority 3: error.message (plain string)
  else if (errorData?.message && typeof errorData.message === "string") {
    errorMessage = errorData.message;

    // Try to extract error code from message content
    const messageLower = errorMessage.toLowerCase();
    if (
      messageLower.includes("email") &&
      (messageLower.includes("verif") || messageLower.includes("not verified"))
    ) {
      errorCode = "EMAIL_NOT_VERIFIED";
    } else if (
      messageLower.includes("invalid") ||
      messageLower.includes("credentials") ||
      messageLower.includes("incorrect")
    ) {
      errorCode = "INVALID_CREDENTIALS";
    } else if (
      messageLower.includes("already") ||
      messageLower.includes("exists")
    ) {
      errorCode = "EMAIL_EXISTS";
    } else if (
      messageLower.includes("not found") ||
      messageLower.includes("no user")
    ) {
      errorCode = "USER_NOT_FOUND";
    } else if (
      messageLower.includes("password") &&
      (messageLower.includes("8") ||
        messageLower.includes("short") ||
        messageLower.includes("characters"))
    ) {
      errorCode = "PASSWORD_TOO_SHORT";
    } else if (
      messageLower.includes("email") &&
      (messageLower.includes("invalid") || messageLower.includes("valid"))
    ) {
      errorCode = "INVALID_EMAIL";
    } else if (
      messageLower.includes("email") &&
      messageLower.includes("required")
    ) {
      errorCode = "INVALID_EMAIL";
    } else if (
      messageLower.includes("password") &&
      messageLower.includes("required")
    ) {
      errorCode = "PASSWORD_TOO_SHORT";
    } else if (
      messageLower.includes("validation") ||
      messageLower.includes("422")
    ) {
      // Generic validation error - try to infer from context
      if (messageLower.includes("email")) {
        errorCode = "INVALID_EMAIL";
      } else if (messageLower.includes("password")) {
        errorCode = "PASSWORD_TOO_SHORT";
      } else {
        errorCode = "BAD_REQUEST";
      }
    }

    console.log("[Auth] Format 3 - extracted from message:", errorCode);
  }
  // Priority 4: Plain string error
  else if (typeof errorData === "string") {
    errorMessage = errorData;

    // Try to extract error code from string content
    const messageLower = errorMessage.toLowerCase();
    if (messageLower.includes("email") && messageLower.includes("exists")) {
      errorCode = "EMAIL_EXISTS";
    } else if (
      messageLower.includes("password") &&
      (messageLower.includes("8") || messageLower.includes("short"))
    ) {
      errorCode = "PASSWORD_TOO_SHORT";
    } else if (
      messageLower.includes("email") &&
      (messageLower.includes("invalid") || messageLower.includes("required"))
    ) {
      errorCode = "INVALID_EMAIL";
    }

    console.log("[Auth] Format 4 - plain string:", errorMessage);
  }

  // Normalize error codes to standard format
  // Backend may return USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL, normalize to EMAIL_EXISTS
  if (
    errorCode.includes("USER_ALREADY_EXISTS") ||
    errorCode.includes("EMAIL_ALREADY_EXISTS")
  ) {
    errorCode = "EMAIL_EXISTS";
    console.log("[Auth] Normalized error code to EMAIL_EXISTS");
  }

  console.log(
    "[Auth] Final parsed error - Code:",
    errorCode,
    "Message:",
    errorMessage,
  );

  return { message: errorMessage, code: errorCode };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [localUserId, setLocalUserId] = useState<string | null>(null);
  const [allUserIds, setAllUserIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    initializeAuth();

    // Listen for deep links (e.g. from social auth redirects)
    const subscription = Linking.addEventListener("url", (event) => {
      console.log("Deep link received, refreshing user session");
      // Allow time for the client to process the token if needed
      setTimeout(() => fetchUser(), 500);
    });

    // POLLING: Refresh session every 5 minutes to keep SecureStore token in sync
    // This prevents 401 errors when the session token rotates
    const intervalId = setInterval(
      () => {
        console.log("Auto-refreshing user session to sync token...");
        fetchUser();
      },
      5 * 60 * 1000,
    ); // 5 minutes

    return () => {
      subscription.remove();
      clearInterval(intervalId);
    };
  }, []);

  const initializeAuth = async () => {
    try {
      // Load local user ID from storage
      const storedUserId = await AsyncStorage.getItem(LOCAL_USER_ID_KEY);
      console.log("[Auth] Loaded local user ID from storage:", storedUserId);
      setLocalUserId(storedUserId);

      // Load all user IDs from storage
      const storedAllUserIds = await AsyncStorage.getItem(ALL_USER_IDS_KEY);
      if (storedAllUserIds) {
        try {
          const parsedIds = JSON.parse(storedAllUserIds);
          setAllUserIds(parsedIds);
          console.log("[Auth] Loaded all user IDs from storage:", parsedIds);
        } catch (parseError) {
          console.error("[Auth] Failed to parse all user IDs:", parseError);
          setAllUserIds([]);
        }
      } else {
        setAllUserIds([]);
      }

      // Try to fetch user session
      await fetchUser();
    } catch (error) {
      console.error("[Auth] Failed to initialize auth:", error);
    }
  };

  const fetchUser = async () => {
    try {
      setLoading(true);
      const session = await authClient.getSession();
      console.log("[Auth] Session fetched:", session ? "Found" : "Not found");

      if (session?.data?.user) {
        const userData = session.data.user as User;
        setUser(userData);

        // Store user ID locally for offline ownership checks
        const existingLocalUserId =
          await AsyncStorage.getItem(LOCAL_USER_ID_KEY);
        if (!existingLocalUserId) {
          await AsyncStorage.setItem(LOCAL_USER_ID_KEY, userData.id);
          setLocalUserId(userData.id);
          console.log(
            "[Auth] First login - stored user ID locally:",
            userData.id,
          );
        } else {
          setLocalUserId(existingLocalUserId);
          console.log(
            "[Auth] User logged in:",
            userData.id,
            "Preserving original localUserId:",
            existingLocalUserId,
          );
        }

        // Add this user ID to the list of all user IDs (for multi-account support)
        const storedAllUserIds = await AsyncStorage.getItem(ALL_USER_IDS_KEY);
        let allIds: string[] = [];
        if (storedAllUserIds) {
          try {
            allIds = JSON.parse(storedAllUserIds);
          } catch (parseError) {
            console.error("[Auth] Failed to parse all user IDs:", parseError);
            allIds = [];
          }
        }

        // Add the new user ID if it's not already in the list
        if (!allIds.includes(userData.id)) {
          allIds.push(userData.id);
          await AsyncStorage.setItem(ALL_USER_IDS_KEY, JSON.stringify(allIds));
          console.log(
            "[Auth] Added user ID to all user IDs list:",
            userData.id,
            "Total IDs:",
            allIds.length,
          );
        }

        // 🔥 NEW: Fetch participants created by this user and add their creator IDs to allUserIds
        // This ensures that if a user's ID changed (e.g., due to Better Auth migration),
        // they can still edit expenses created by participants they own
        try {
          console.log(
            "[Auth] Fetching participants to discover historical user IDs...",
          );
          const response = await fetch(`${BACKEND_URL}/api/participants`);
          if (response.ok) {
            const participants = await response.json();
            console.log("[Auth] Fetched participants:", participants.length);

            // Extract unique creator IDs from participants
            const participantCreatorIds = participants
              .map((p: any) => p.createdBy)
              .filter((id: any) => id && typeof id === "string");

            console.log(
              "[Auth] Participant creator IDs found:",
              participantCreatorIds,
            );

            // Add any new creator IDs to allUserIds
            let updated = false;
            for (const creatorId of participantCreatorIds) {
              if (!allIds.includes(creatorId)) {
                allIds.push(creatorId);
                updated = true;
                console.log(
                  "[Auth] Added historical user ID from participant:",
                  creatorId,
                );
              }
            }

            if (updated) {
              await AsyncStorage.setItem(
                ALL_USER_IDS_KEY,
                JSON.stringify(allIds),
              );
              console.log(
                "[Auth] Updated allUserIds with historical IDs. Total IDs:",
                allIds.length,
                "IDs:",
                allIds,
              );
            }
          }
        } catch (participantError) {
          console.error(
            "[Auth] Failed to fetch participants for historical user IDs:",
            participantError,
          );
          // Don't fail the whole auth flow if this fails
        }

        setAllUserIds(allIds);
        console.log("[Auth] Final allUserIds state:", allIds);

        // Sync token to SecureStore for utils/api.ts
        if (session.data.session?.token) {
          await setBearerToken(session.data.session.token);
        }
      } else {
        console.log("[Auth] No active session found");
        setUser(null);
        await clearAuthTokens();
        // Keep localUserId and allUserIds - don't clear them when session expires
      }
    } catch (error) {
      console.error("[Auth] Failed to fetch user:", error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    try {
      console.log("[Auth] Attempting email sign in for:", email);
      const result = await authClient.signIn.email({ email, password });
      console.log("[Auth] Sign in result:", JSON.stringify(result, null, 2));

      // Check if the result contains an error (Better Auth can return errors in the result)
      if (
        result &&
        typeof result === "object" &&
        "error" in result &&
        result.error
      ) {
        console.log("[Auth] Sign in returned error in result:", result);

        // Better Auth returns errors in result.error, which itself has { error, message, statusCode }
        const errorData = (result as any).error;
        const { message, code } = parseAuthError(errorData);

        console.log(
          "[Auth] Parsed error from result - Code:",
          code,
          "Message:",
          message,
        );

        const structuredError: any = new Error(message);
        structuredError.error = code;
        throw structuredError;
      }

      await fetchUser();
    } catch (error: any) {
      console.error("[Auth] Email sign in failed:", error);
      console.error(
        "[Auth] Error stringified:",
        JSON.stringify(error, null, 2),
      );

      const { message, code } = parseAuthError(error);

      console.log(
        "[Auth] Parsed error from catch - Code:",
        code,
        "Message:",
        message,
      );

      // Create a structured error object
      const structuredError: any = new Error(message);
      structuredError.error = code;
      throw structuredError;
    }
  };

  const signUpWithEmail = async (
    email: string,
    password: string,
    name?: string,
  ) => {
    try {
      console.log(
        "[Auth] Attempting email sign up for:",
        email,
        "with name:",
        name,
      );
      console.log("[Auth] Sign up payload:", { email, password: "***", name });

      const result = await authClient.signUp.email({
        email,
        password,
        name,
      });

      console.log("[Auth] Sign up result:", JSON.stringify(result, null, 2));

      // Check if the result contains an error (Better Auth can return errors in the result)
      if (
        result &&
        typeof result === "object" &&
        "error" in result &&
        result.error
      ) {
        console.log("[Auth] Sign up returned error in result:", result);

        // Better Auth returns errors in result.error, which itself has { error, message, statusCode }
        const errorData = (result as any).error;
        const { message, code } = parseAuthError(errorData);

        console.log(
          "[Auth] Parsed error from result - Code:",
          code,
          "Message:",
          message,
        );

        const structuredError: any = new Error(message);
        structuredError.error = code;
        throw structuredError;
      }

      // Don't auto-login after signup - user needs to verify email first
      console.log("[Auth] Sign up successful, email verification required");
    } catch (error: any) {
      console.error("[Auth] Email sign up failed:", error);
      console.error(
        "[Auth] Error stringified:",
        JSON.stringify(error, null, 2),
      );

      const { message, code } = parseAuthError(error);

      console.log(
        "[Auth] Parsed error from catch - Code:",
        code,
        "Message:",
        message,
      );

      // Create a structured error object
      const structuredError: any = new Error(message);
      structuredError.error = code;
      throw structuredError;
    }
  };

  const waitForSocialSession = async () => {
    for (
      let attempt = 1;
      attempt <= SOCIAL_SIGN_IN_SESSION_POLL_ATTEMPTS;
      attempt++
    ) {
      const session = await authClient.getSession();
      if (session?.data?.user) {
        await fetchUser();
        return;
      }
      await sleep(SOCIAL_SIGN_IN_SESSION_POLL_DELAY_MS);
    }

    throw new Error(
      "Social sign-in completed, but no active session was returned by the backend.",
    );
  };

  const signInWithSocial = async (provider: "google" | "apple" | "github") => {
    try {
      const callbackURL =
        Platform.OS === "web"
          ? `${window.location.origin}/auth-callback`
          : Linking.createURL("auth-callback");

      console.log(
        `[Auth] Starting ${provider} social sign-in with callback:`,
        callbackURL,
      );

      // Breadcrumb to the backend ring buffer so we can see what the
      // SDK observed inside the openAuthSessionAsync flow, even when
      // Cloud Run routes our debug-logs call to a different instance.
      const debugLog = (event: string, data?: any) => {
        try {
          fetch(`${BACKEND_URL}/api/auth/debug-client-log`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source: "AuthContext.signInWithSocial", event, data }),
          }).catch(() => {});
        } catch {}
      };

      debugLog("sdk-start", { provider, callbackURL });

      const result = await authClient.signIn.social({
        provider,
        callbackURL,
      });

      debugLog("sdk-returned", {
        hasError: !!(result && typeof result === "object" && "error" in result && (result as any).error),
        keys: result && typeof result === "object" ? Object.keys(result) : null,
      });

      if (
        result &&
        typeof result === "object" &&
        "error" in result &&
        result.error
      ) {
        const { message, code } = parseAuthError((result as any).error);
        const structuredError: any = new Error(message);
        structuredError.error = code;
        throw structuredError;
      }

      // Peek at whether the SDK's openAuthSessionAsync actually
      // surfaced a session cookie into storage.
      try {
        const stored = await (Platform.OS === "web"
          ? Promise.resolve(localStorage.getItem("childcosts_cookie"))
          : (await import("expo-secure-store")).getItemAsync("childcosts_cookie"));
        const parsed = stored ? JSON.parse(stored) : null;
        debugLog("cookie-storage-after-sdk", {
          hasStorage: !!stored,
          cookieNames: parsed ? Object.keys(parsed) : [],
        });
      } catch {}

      await waitForSocialSession();
    } catch (error: any) {
      console.error(`${provider} sign in failed:`, error);
      if (
        error?.message?.includes("cancelled") ||
        error?.message?.includes("canceled")
      ) {
        throw new Error("Sign in was cancelled");
      }
      throw error instanceof Error ? error : new Error(String(error));
    }
  };

  const signInWithGoogle = () => signInWithSocial("google");
  const signInWithApple = () => signInWithSocial("apple");
  const signInWithGitHub = () => signInWithSocial("github");

  const signOut = async () => {
    try {
      await authClient.signOut();
    } catch (error) {
      console.error("Sign out failed (API):", error);
    } finally {
      // Always clear local state
      setUser(null);
      await clearAuthTokens();
      // Keep localUserId - don't clear it on sign out
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        localUserId,
        allUserIds,
        loading,
        signInWithEmail,
        signUpWithEmail,
        signInWithGoogle,
        signInWithApple,
        signInWithGitHub,
        signOut,
        fetchUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
