// Copyright (c) 2026 Kunetz Szabolcs. All rights reserved.

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { Platform } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import { setBearerToken } from "@/lib/auth";

type Status = "processing" | "success" | "error";

const EXPO_AUTH_COOKIE_KEY = "childcosts_cookie";
const DEFAULT_BETTER_AUTH_COOKIE_NAME = "__Secure-better-auth.session_token";

async function storeNativeSessionToken(
  token: string,
  cookieName?: string | null,
) {
  const names = Array.from(
    new Set([
      cookieName || DEFAULT_BETTER_AUTH_COOKIE_NAME,
      DEFAULT_BETTER_AUTH_COOKIE_NAME,
      "better-auth.session_token",
    ]),
  );
  const payload = JSON.stringify(
    Object.fromEntries(
      names.map((name) => [name, { value: token, expires: null }]),
    ),
  );
  await setBearerToken(token);
  await SecureStore.setItemAsync(EXPO_AUTH_COOKIE_KEY, payload);
}

export default function AuthCallbackScreen() {
  const router = useRouter();
  const { fetchUser } = useAuth();
  const [status, setStatus] = useState<Status>("processing");
  const [message, setMessage] = useState("Processing authentication...");

  useEffect(() => {
    console.log("[Auth Callback] Screen mounted, platform:", Platform.OS);

    if (Platform.OS === "web") {
      handleWebCallback();
    } else {
      handleNativeCallback();
    }
  }, []);

  const handleWebCallback = async () => {
    try {
      console.log("[Auth Callback Web] Processing web callback");
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get("better_auth_token");
      const error = urlParams.get("error");
      const verified = urlParams.get("verified");
      const verificationError = urlParams.get("verification_error");

      console.log("[Auth Callback Web] URL params:", {
        hasToken: !!token,
        error,
        verified,
        verificationError,
      });

      // Handle email verification success
      if (verified === "true") {
        console.log("[Auth Callback Web] Email verification successful");
        setStatus("success");
        setMessage(
          "🎉 Your email has been verified successfully!\n\nYou can now sign in to your account and start using all features.",
        );

        // If this is a popup window (OAuth flow), notify parent
        if (window.opener) {
          console.log("[Auth Callback Web] Notifying parent window");
          window.opener.postMessage(
            { type: "verification-success" },
            window.location.origin,
          );
          setTimeout(() => window.close(), 2000);
        } else {
          // If this is a direct navigation (email link), redirect to auth page after delay
          console.log(
            "[Auth Callback Web] Redirecting to auth page in 4 seconds",
          );
          setTimeout(() => {
            router.replace("/auth");
          }, 4000);
        }
        return;
      }

      // Handle email verification error
      if (verificationError) {
        console.log(
          "[Auth Callback Web] Email verification error:",
          verificationError,
        );
        setStatus("error");
        setMessage(`❌ Email verification failed\n\n${verificationError}`);

        if (window.opener) {
          window.opener.postMessage(
            { type: "verification-error", error: verificationError },
            window.location.origin,
          );
          setTimeout(() => window.close(), 3000);
        } else {
          setTimeout(() => {
            router.replace("/auth");
          }, 4000);
        }
        return;
      }

      // Handle OAuth callback. Better Auth completes web OAuth by setting
      // an HTTP-only session cookie; it does not need to expose a token in
      // the query string. The previous implementation treated a missing
      // better_auth_token as a failure even when the cookie was already set.
      if (error) {
        console.log("[Auth Callback Web] OAuth error:", error);
        setStatus("error");
        setMessage(`❌ Authentication failed\n\n${error}`);
        window.opener?.postMessage(
          { type: "oauth-error", error },
          window.location.origin,
        );
        return;
      }

      try {
        await fetchUser();
        setStatus("success");
        setMessage("✅ Authentication successful!\n\nRedirecting...");
        window.opener?.postMessage(
          { type: "oauth-success" },
          window.location.origin,
        );
        if (window.opener) {
          setTimeout(() => window.close(), 1000);
        } else {
          setTimeout(() => router.replace("/"), 1000);
        }
      } catch (sessionError: any) {
        console.error(
          "[Auth Callback Web] Session refresh failed:",
          sessionError,
        );
        setStatus("error");
        setMessage(
          "❌ Authentication completed, but the app could not load the session.",
        );
        window.opener?.postMessage(
          {
            type: "oauth-error",
            error: sessionError?.message || "Session refresh failed",
          },
          window.location.origin,
        );
      }
    } catch (err) {
      console.error("[Auth Callback Web] Error:", err);
      setStatus("error");
      setMessage("❌ Failed to process authentication");
    }
  };

  const handleNativeCallback = async () => {
    try {
      console.log("[Auth Callback Native] Processing native callback");

      // Get the URL that opened this screen
      const url = await Linking.getInitialURL();
      console.log("[Auth Callback Native] Initial URL:", url);

      if (url) {
        const { queryParams } = Linking.parse(url);
        console.log("[Auth Callback Native] Query params:", queryParams);

        // Handle email verification success
        if (queryParams?.verified === "true") {
          console.log("[Auth Callback Native] Email verification successful");
          setStatus("success");
          setMessage(
            "🎉 Your email has been verified successfully!\n\nYou can now sign in to your account and start using all features.",
          );

          // Redirect to auth page after delay
          setTimeout(() => {
            console.log("[Auth Callback Native] Redirecting to auth page");
            router.replace("/auth");
          }, 4000);
          return;
        }

        // Handle OAuth token returned by the custom mobile Google flow.
        // This makes the callback screen resilient even if the AuthContext
        // deep-link listener misses the event or runs later than routing.
        const tokenParam = queryParams?.token || queryParams?.better_auth_token;
        if (typeof tokenParam === "string" && tokenParam.length > 0) {
          const cookieName =
            typeof queryParams?.cookieName === "string"
              ? queryParams.cookieName
              : undefined;
          await storeNativeSessionToken(tokenParam, cookieName);
        }

        // Handle email verification / OAuth error
        if (queryParams?.verification_error || queryParams?.error) {
          const errorMsg =
            queryParams?.verification_error ||
            queryParams?.error ||
            "Unknown error";
          const errorDescription =
            typeof queryParams?.error_description === "string"
              ? `\n\n${queryParams.error_description}`
              : "";
          console.log("[Auth Callback Native] Auth callback error:", errorMsg);
          setStatus("error");
          setMessage(
            `❌ Authentication failed\n\n${errorMsg}${errorDescription}`,
          );

          // Redirect to auth page after delay
          setTimeout(() => {
            console.log("[Auth Callback Native] Redirecting to auth page");
            router.replace("/auth");
          }, 4000);
          return;
        }
      }

      // For OAuth callbacks, the Better Auth client will automatically process the callback
      // We just need to refresh the user session
      console.log("[Auth Callback Native] Attempting to refresh user session");

      // Wait a moment for Better Auth to process the callback
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Refresh user session
      await fetchUser();

      console.log("[Auth Callback Native] User session refreshed successfully");
      setStatus("success");
      setMessage("✅ Authentication successful!\n\nRedirecting...");

      // Navigate to home
      setTimeout(() => {
        console.log("[Auth Callback Native] Redirecting to home");
        router.replace("/");
      }, 1000);
    } catch (err) {
      console.error("[Auth Callback Native] Error:", err);
      setStatus("error");
      setMessage(
        "❌ Failed to process authentication\n\nPlease try signing in again.",
      );

      // Navigate to auth page after delay
      setTimeout(() => {
        console.log(
          "[Auth Callback Native] Redirecting to auth page after error",
        );
        router.replace("/auth");
      }, 3000);
    }
  };

  const handleGoToAuth = () => {
    console.log("[Auth Callback] Manual navigation to auth page");
    router.replace("/auth");
  };

  const handleGoToHome = () => {
    console.log("[Auth Callback] Manual navigation to home");
    router.replace("/");
  };

  return (
    <View style={styles.container}>
      {status === "processing" && (
        <>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.processingText}>Processing...</Text>
        </>
      )}

      {status === "success" && (
        <>
          <View style={styles.iconContainer}>
            <Text style={styles.successIcon}>✓</Text>
          </View>
          <Text style={styles.title}>✅ Email Verified!</Text>
        </>
      )}

      {status === "error" && (
        <>
          <View style={styles.iconContainer}>
            <Text style={styles.errorIcon}>✗</Text>
          </View>
          <Text style={styles.title}>Error</Text>
        </>
      )}

      <Text style={styles.message}>{message}</Text>

      {status === "success" && (
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleGoToAuth}
          >
            <Text style={styles.primaryButtonText}>Go to Sign In</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleGoToHome}
          >
            <Text style={styles.secondaryButtonText}>Go to Home</Text>
          </TouchableOpacity>
        </View>
      )}

      {status === "error" && (
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleGoToAuth}
          >
            <Text style={styles.primaryButtonText}>Go to Sign In</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#fff",
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  successIcon: {
    fontSize: 56,
    fontWeight: "bold",
    color: "#34C759",
  },
  errorIcon: {
    fontSize: 56,
    fontWeight: "bold",
    color: "#FF3B30",
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 16,
    color: "#000",
    textAlign: "center",
  },
  processingText: {
    fontSize: 18,
    marginTop: 16,
    color: "#666",
  },
  message: {
    fontSize: 18,
    textAlign: "center",
    color: "#333",
    lineHeight: 28,
    marginBottom: 32,
    maxWidth: 500,
    fontWeight: "500",
  },
  buttonContainer: {
    width: "100%",
    maxWidth: 300,
    gap: 12,
  },
  primaryButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    backgroundColor: "#007AFF",
    borderRadius: 10,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    backgroundColor: "#F2F2F7",
    borderRadius: 10,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#007AFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
