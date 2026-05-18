// Copyright (c) 2026 Kunetz Szabolcs. All rights reserved.

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Platform } from "react-native";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { authClient, setBearerToken, clearAuthTokens } from "@/lib/auth";
import { BACKEND_URL } from "@/utils/api";

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
  signUpWithEmail: (email: string, password: string, name?: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signInWithGitHub: () => Promise<void>;
  signOut: () => Promise<void>;
  fetchUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function openOAuthPopup(provider: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const popupUrl = `${window.location.origin}/auth-popup?provider=${provider}`;
    const width = 500;
    const height = 600;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      popupUrl,
      "oauth-popup",
      `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`
    );

    if (!popup) {
      reject(new Error("Failed to open popup. Please allow popups."));
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "oauth-success" && event.data?.token) {
        window.removeEventListener("message", handleMessage);
        clearInterval(checkClosed);
        resolve(event.data.token);
      } else if (event.data?.type === "oauth-error") {
        window.removeEventListener("message", handleMessage);
        clearInterval(checkClosed);
        reject(new Error(event.data.error || "OAuth failed"));
      }
    };

    window.addEventListener("message", handleMessage);

    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        window.removeEventListener("message", handleMessage);
        reject(new Error("Authentication cancelled"));
      }
    }, 500);
  });
}

// Helper function to parse Better Auth error responses
// Backend now returns consistent format: { error: string, message: string, statusCode: number }
function parseAuthError(error: any): { message: string; code: string } {
  console.log('[Auth] Parsing error:', JSON.stringify(error, null, 2));
  
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
      errorData = typeof error.json === 'string' 
        ? JSON.parse(error.json) 
        : error.json;
      console.log('[Auth] Extracted from error.json:', errorData);
    } catch (parseError) {
      console.error('[Auth] Failed to parse error.json:', parseError);
    }
  }
  
  // If error is wrapped in a response property
  if (error?.response) {
    try {
      errorData = typeof error.response === 'string' 
        ? JSON.parse(error.response) 
        : error.response;
      console.log('[Auth] Extracted from error.response:', errorData);
    } catch (parseError) {
      console.error('[Auth] Failed to parse error.response:', parseError);
    }
  }
  
  // If error has a data property (axios-style)
  if (errorData?.data) {
    errorData = errorData.data;
    console.log('[Auth] Extracted from error.data:', errorData);
  }
  
  // If error has a body property (fetch API)
  if (errorData?.body) {
    try {
      errorData = typeof errorData.body === 'string' 
        ? JSON.parse(errorData.body) 
        : errorData.body;
      console.log('[Auth] Extracted from error.body:', errorData);
    } catch (parseError) {
      console.error('[Auth] Failed to parse error.body:', parseError);
    }
  }
  
  // Now extract error code and message
  // Priority 1: error.error and error.message (backend format - NEW STRUCTURED FORMAT)
  if (errorData?.error && typeof errorData.error === 'string') {
    errorCode = String(errorData.error).toUpperCase();
    errorMessage = errorData.message || errorMessage;
    console.log('[Auth] Format 1 - error.error:', errorCode, 'message:', errorMessage);
  }
  // Priority 2: error.code and error.message (alternative format)
  else if (errorData?.code && typeof errorData.code === 'string') {
    errorCode = String(errorData.code).toUpperCase();
    errorMessage = errorData.message || errorMessage;
    console.log('[Auth] Format 2 - error.code:', errorCode, 'message:', errorMessage);
  }
  // Priority 3: error.message (plain string)
  else if (errorData?.message && typeof errorData.message === 'string') {
    errorMessage = errorData.message;
    
    // Try to extract error code from message content
    const messageLower = errorMessage.toLowerCase();
    if (messageLower.includes('email') && (messageLower.includes('verif') || messageLower.includes('not verified'))) {
      errorCode = 'EMAIL_NOT_VERIFIED';
    } else if (messageLower.includes('invalid') || messageLower.includes('credentials') || messageLower.includes('incorrect')) {
      errorCode = 'INVALID_CREDENTIALS';
    } else if (messageLower.includes('already') || messageLower.includes('exists')) {
      errorCode = 'EMAIL_EXISTS';
    } else if (messageLower.includes('not found') || messageLower.includes('no user')) {
      errorCode = 'USER_NOT_FOUND';
    } else if (messageLower.includes('password') && (messageLower.includes('8') || messageLower.includes('short') || messageLower.includes('characters'))) {
      errorCode = 'PASSWORD_TOO_SHORT';
    } else if (messageLower.includes('email') && (messageLower.includes('invalid') || messageLower.includes('valid'))) {
      errorCode = 'INVALID_EMAIL';
    } else if (messageLower.includes('email') && messageLower.includes('required')) {
      errorCode = 'INVALID_EMAIL';
    } else if (messageLower.includes('password') && messageLower.includes('required')) {
      errorCode = 'PASSWORD_TOO_SHORT';
    } else if (messageLower.includes('validation') || messageLower.includes('422')) {
      // Generic validation error - try to infer from context
      if (messageLower.includes('email')) {
        errorCode = 'INVALID_EMAIL';
      } else if (messageLower.includes('password')) {
        errorCode = 'PASSWORD_TOO_SHORT';
      } else {
        errorCode = 'BAD_REQUEST';
      }
    }
    
    console.log('[Auth] Format 3 - extracted from message:', errorCode);
  }
  // Priority 4: Plain string error
  else if (typeof errorData === 'string') {
    errorMessage = errorData;
    
    // Try to extract error code from string content
    const messageLower = errorMessage.toLowerCase();
    if (messageLower.includes('email') && messageLower.includes('exists')) {
      errorCode = 'EMAIL_EXISTS';
    } else if (messageLower.includes('password') && (messageLower.includes('8') || messageLower.includes('short'))) {
      errorCode = 'PASSWORD_TOO_SHORT';
    } else if (messageLower.includes('email') && (messageLower.includes('invalid') || messageLower.includes('required'))) {
      errorCode = 'INVALID_EMAIL';
    }
    
    console.log('[Auth] Format 4 - plain string:', errorMessage);
  }

  // Normalize error codes to standard format
  // Backend may return USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL, normalize to EMAIL_EXISTS
  if (errorCode.includes('USER_ALREADY_EXISTS') || errorCode.includes('EMAIL_ALREADY_EXISTS')) {
    errorCode = 'EMAIL_EXISTS';
    console.log('[Auth] Normalized error code to EMAIL_EXISTS');
  }

  console.log('[Auth] Final parsed error - Code:', errorCode, 'Message:', errorMessage);
  
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
    const intervalId = setInterval(() => {
      console.log("Auto-refreshing user session to sync token...");
      fetchUser();
    }, 5 * 60 * 1000); // 5 minutes

    return () => {
      subscription.remove();
      clearInterval(intervalId);
    };
  }, []);

  const initializeAuth = async () => {
    try {
      // Load local user ID from storage
      const storedUserId = await AsyncStorage.getItem(LOCAL_USER_ID_KEY);
      console.log('[Auth] Loaded local user ID from storage:', storedUserId);
      setLocalUserId(storedUserId);
      
      // Load all user IDs from storage
      const storedAllUserIds = await AsyncStorage.getItem(ALL_USER_IDS_KEY);
      if (storedAllUserIds) {
        try {
          const parsedIds = JSON.parse(storedAllUserIds);
          setAllUserIds(parsedIds);
          console.log('[Auth] Loaded all user IDs from storage:', parsedIds);
        } catch (parseError) {
          console.error('[Auth] Failed to parse all user IDs:', parseError);
          setAllUserIds([]);
        }
      } else {
        setAllUserIds([]);
      }
      
      // Try to fetch user session
      await fetchUser();
    } catch (error) {
      console.error('[Auth] Failed to initialize auth:', error);
    }
  };

  const fetchUser = async () => {
    try {
      setLoading(true);
      const session = await authClient.getSession();
      console.log('[Auth] Session fetched:', session ? 'Found' : 'Not found');
      
      if (session?.data?.user) {
        const userData = session.data.user as User;
        setUser(userData);
        
        // Store user ID locally for offline ownership checks
        const existingLocalUserId = await AsyncStorage.getItem(LOCAL_USER_ID_KEY);
        if (!existingLocalUserId) {
          await AsyncStorage.setItem(LOCAL_USER_ID_KEY, userData.id);
          setLocalUserId(userData.id);
          console.log('[Auth] First login - stored user ID locally:', userData.id);
        } else {
          setLocalUserId(existingLocalUserId);
          console.log('[Auth] User logged in:', userData.id, 'Preserving original localUserId:', existingLocalUserId);
        }
        
        // Add this user ID to the list of all user IDs (for multi-account support)
        const storedAllUserIds = await AsyncStorage.getItem(ALL_USER_IDS_KEY);
        let allIds: string[] = [];
        if (storedAllUserIds) {
          try {
            allIds = JSON.parse(storedAllUserIds);
          } catch (parseError) {
            console.error('[Auth] Failed to parse all user IDs:', parseError);
            allIds = [];
          }
        }
        
        // Add the new user ID if it's not already in the list
        if (!allIds.includes(userData.id)) {
          allIds.push(userData.id);
          await AsyncStorage.setItem(ALL_USER_IDS_KEY, JSON.stringify(allIds));
          console.log('[Auth] Added user ID to all user IDs list:', userData.id, 'Total IDs:', allIds.length);
        }
        
        // 🔥 NEW: Fetch participants created by this user and add their creator IDs to allUserIds
        // This ensures that if a user's ID changed (e.g., due to Better Auth migration),
        // they can still edit expenses created by participants they own
        try {
          console.log('[Auth] Fetching participants to discover historical user IDs...');
          const response = await fetch(`${BACKEND_URL}/api/participants`);
          if (response.ok) {
            const participants = await response.json();
            console.log('[Auth] Fetched participants:', participants.length);
            
            // Extract unique creator IDs from participants
            const participantCreatorIds = participants
              .map((p: any) => p.createdBy)
              .filter((id: any) => id && typeof id === 'string');
            
            console.log('[Auth] Participant creator IDs found:', participantCreatorIds);
            
            // Add any new creator IDs to allUserIds
            let updated = false;
            for (const creatorId of participantCreatorIds) {
              if (!allIds.includes(creatorId)) {
                allIds.push(creatorId);
                updated = true;
                console.log('[Auth] Added historical user ID from participant:', creatorId);
              }
            }
            
            if (updated) {
              await AsyncStorage.setItem(ALL_USER_IDS_KEY, JSON.stringify(allIds));
              console.log('[Auth] Updated allUserIds with historical IDs. Total IDs:', allIds.length, 'IDs:', allIds);
            }
          }
        } catch (participantError) {
          console.error('[Auth] Failed to fetch participants for historical user IDs:', participantError);
          // Don't fail the whole auth flow if this fails
        }
        
        setAllUserIds(allIds);
        console.log('[Auth] Final allUserIds state:', allIds);
        
        // Sync token to SecureStore for utils/api.ts
        if (session.data.session?.token) {
          await setBearerToken(session.data.session.token);
        }
      } else {
        console.log('[Auth] No active session found');
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
      console.log('[Auth] Attempting email sign in for:', email);
      const result = await authClient.signIn.email({ email, password });
      console.log('[Auth] Sign in result:', JSON.stringify(result, null, 2));
      
      // Check if the result contains an error (Better Auth can return errors in the result)
      if (result && typeof result === 'object' && 'error' in result && result.error) {
        console.log('[Auth] Sign in returned error in result:', result);
        
        // Better Auth returns errors in result.error, which itself has { error, message, statusCode }
        const errorData = (result as any).error;
        const { message, code } = parseAuthError(errorData);
        
        console.log('[Auth] Parsed error from result - Code:', code, 'Message:', message);
        
        const structuredError: any = new Error(message);
        structuredError.error = code;
        throw structuredError;
      }
      
      await fetchUser();
    } catch (error: any) {
      console.error("[Auth] Email sign in failed:", error);
      console.error("[Auth] Error stringified:", JSON.stringify(error, null, 2));
      
      const { message, code } = parseAuthError(error);
      
      console.log('[Auth] Parsed error from catch - Code:', code, 'Message:', message);
      
      // Create a structured error object
      const structuredError: any = new Error(message);
      structuredError.error = code;
      throw structuredError;
    }
  };

  const signUpWithEmail = async (email: string, password: string, name?: string) => {
    try {
      console.log('[Auth] Attempting email sign up for:', email, 'with name:', name);
      console.log('[Auth] Sign up payload:', { email, password: '***', name });
      
      const result = await authClient.signUp.email({
        email,
        password,
        name,
      });
      
      console.log('[Auth] Sign up result:', JSON.stringify(result, null, 2));
      
      // Check if the result contains an error (Better Auth can return errors in the result)
      if (result && typeof result === 'object' && 'error' in result && result.error) {
        console.log('[Auth] Sign up returned error in result:', result);
        
        // Better Auth returns errors in result.error, which itself has { error, message, statusCode }
        const errorData = (result as any).error;
        const { message, code } = parseAuthError(errorData);
        
        console.log('[Auth] Parsed error from result - Code:', code, 'Message:', message);
        
        const structuredError: any = new Error(message);
        structuredError.error = code;
        throw structuredError;
      }
      
      // Don't auto-login after signup - user needs to verify email first
      console.log('[Auth] Sign up successful, email verification required');
    } catch (error: any) {
      console.error("[Auth] Email sign up failed:", error);
      console.error("[Auth] Error stringified:", JSON.stringify(error, null, 2));
      
      const { message, code } = parseAuthError(error);
      
      console.log('[Auth] Parsed error from catch - Code:', code, 'Message:', message);
      
      // Create a structured error object
      const structuredError: any = new Error(message);
      structuredError.error = code;
      throw structuredError;
    }
  };

  const signInWithSocial = async (provider: "google" | "apple" | "github") => {
    try {
      if (Platform.OS === "web") {
        const token = await openOAuthPopup(provider);
        await setBearerToken(token);
        await fetchUser();
      } else {
        // Native: bypass the @better-auth/expo client's social flow. It
        // calls openAuthSessionAsync with an internal proxy and expects
        // the server-side @better-auth/expo plugin to redirect to the
        // deep link with ?cookie=<session>. We don't have that plugin
        // server-side, so the SDK silently fails when the deep link
        // arrives without the cookie param.
        //
        // Instead, drive the flow ourselves:
        //   1. POST /api/auth/sign-in/social to get the Google OAuth URL
        //   2. Open the OAuth URL directly with openAuthSessionAsync,
        //      watching for the deep link `childcosts://auth-callback`
        //   3. The backend's /api/auth/callback/google processes Google's
        //      code, sets a Better Auth session, then redirects to the
        //      deep link — the same response Better Auth produces for
        //      web clients.
        //   4. After openAuthSessionAsync returns, ask the backend for
        //      the current session (cookie or bearer token will be set)
        //      and pull the user.
        const callbackURL = Linking.createURL("auth-callback");
        console.log(`[Auth] Starting ${provider} OAuth, deep link:`, callbackURL);

        // Ship a breadcrumb to the backend ring buffer so we can read
        // what the client saw even when remote console is unavailable.
        const debugLog = (event: string, data?: any) => {
          try {
            fetch(`${BACKEND_URL}/api/auth/debug-client-log`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ source: "AuthContext.signInWithSocial", event, data }),
            }).catch(() => {});
          } catch {}
        };

        debugLog("start", { provider, callbackURL });

        const startRes = await fetch(`${BACKEND_URL}/api/auth/sign-in/social`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Synthesize an Origin so Better Auth's CSRF check doesn't
            // reject the request (server also injects this as a fallback).
            Origin: BACKEND_URL,
          },
          body: JSON.stringify({ provider, callbackURL }),
        });
        if (!startRes.ok) {
          const text = await startRes.text();
          throw new Error(`Failed to start ${provider} OAuth: ${startRes.status} ${text}`);
        }
        const startData = await startRes.json();
        const oauthUrl = startData?.url;
        if (!oauthUrl) {
          throw new Error(`No OAuth URL returned by backend for ${provider}`);
        }

        debugLog("sign-in-social-response", { startStatus: startRes.status, oauthHost: (() => { try { return new URL(oauthUrl).host; } catch { return null; } })() });

        let WebBrowser: typeof import("expo-web-browser");
        try {
          WebBrowser = await import("expo-web-browser");
        } catch (e: any) {
          debugLog("webbrowser-import-failed", { message: e?.message });
          throw new Error(`expo-web-browser unavailable: ${e?.message || e}`);
        }

        debugLog("opening-browser", { callbackURL });

        // Race the browser session against a deep link listener. On
        // Android the system intent filter for childcosts://* often
        // claims the redirect before openAuthSessionAsync's URL match
        // logic runs, so the browser returns 'dismiss' even though the
        // OAuth completed and the deep link reached the app.
        const deepLinkPromise = new Promise<{ url: string }>((resolve) => {
          const sub = Linking.addEventListener("url", (evt) => {
            try {
              if (evt?.url && evt.url.startsWith("childcosts://")) {
                sub.remove();
                resolve({ url: evt.url });
              }
            } catch {}
          });
        });

        let browserResult: any = null;
        let deepLinkUrl: string | null = null;
        try {
          const winner = await Promise.race([
            WebBrowser.openAuthSessionAsync(oauthUrl, callbackURL).then((r) => ({ kind: "browser" as const, r })),
            deepLinkPromise.then((d) => ({ kind: "link" as const, url: d.url })),
          ]);
          if (winner.kind === "browser") {
            browserResult = winner.r;
          } else {
            deepLinkUrl = winner.url;
            // Make sure the browser closes too so the user lands back in the app.
            try { WebBrowser.dismissBrowser(); } catch {}
          }
        } catch (e: any) {
          debugLog("openAuthSessionAsync-threw", { message: e?.message, stack: e?.stack });
          throw new Error(`Browser session threw: ${e?.message || e}`);
        }

        // If the browser closed before the deep link arrived, give the
        // OS a moment in case the link is still on its way.
        if (browserResult && browserResult.type !== "success" && !deepLinkUrl) {
          try {
            deepLinkUrl = await Promise.race([
              deepLinkPromise.then((d) => d.url),
              new Promise<string | null>((resolve) => setTimeout(() => resolve(null), 1500)),
            ]);
          } catch {}
        }

        const finalUrl: string | null = deepLinkUrl || (browserResult?.url ?? null);
        debugLog("browser-result", {
          type: browserResult?.type ?? "deep-link",
          finalUrl: finalUrl ? finalUrl.slice(0, 500) : null,
        });

        if (!finalUrl) {
          throw new Error(`Sign in was ${browserResult?.type || "dismiss"} (url=none)`);
        }

        // Extract bearer token from the callback URL (server adds it in
        // the OAuth callback redirect — see backend onSend hook).
        try {
          const returned = new URL(finalUrl);
          const token =
            returned.searchParams.get("token") ||
            returned.searchParams.get("better_auth_token");
          if (token) {
            await setBearerToken(token);
            debugLog("bearer-token-set", { fromQuery: true });
          } else {
            debugLog("bearer-token-missing", { url: finalUrl.slice(0, 300) });
          }
        } catch {}

        // Pull the session a few times — Better Auth needs a moment.
        let attempts = 0;
        const maxAttempts = 10;
        const pollInterval = setInterval(async () => {
          attempts++;
          try {
            const session = await authClient.getSession();
            if (session?.data?.user) {
              clearInterval(pollInterval);
              await fetchUser();
            } else if (attempts >= maxAttempts) {
              clearInterval(pollInterval);
            }
          } catch (err) {
            if (attempts >= maxAttempts) clearInterval(pollInterval);
          }
        }, 1000);
      }
    } catch (error: any) {
      console.error(`${provider} sign in failed:`, error);
      // Re-throw with the underlying message preserved so the auth
      // screen can show what actually broke instead of a generic
      // "google sign in failed. Please try again." string.
      if (error?.message?.includes("cancelled") || error?.message?.includes("canceled")) {
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
