// Copyright (c) 2026 Kunetz Szabolcs. All rights reserved.

import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "expo-router";
import Modal from "@/components/ui/Modal";
import { IconSymbol } from "@/components/IconSymbol";
import Constants from "expo-constants";

type Mode = "signin" | "signup";

export default function AuthScreen() {
  const router = useRouter();
  const { signInWithEmail, signUpWithEmail, signInWithGoogle, signInWithApple, signInWithGitHub, loading: authLoading } =
    useAuth();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorModal, setErrorModal] = useState({ visible: false, message: "" });
  const [verificationModal, setVerificationModal] = useState({ visible: false, email: "" });
  const [showPassword, setShowPassword] = useState(false);

  if (authLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  const handleEmailAuth = async () => {
    console.log('[Auth Screen] handleEmailAuth called, mode:', mode);
    
    if (!email || !password) {
      setErrorModal({ visible: true, message: "Please enter both email and password to continue." });
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setErrorModal({ visible: true, message: "Please enter a valid email address." });
      return;
    }

    if (mode === "signup" && password.length < 8) {
      setErrorModal({ visible: true, message: "Password must be at least 8 characters long for security." });
      return;
    }

    setLoading(true);
    try {
      if (mode === "signin") {
        console.log('[Auth Screen] Attempting email sign in for:', email);
        await signInWithEmail(email, password);
        console.log('[Auth Screen] Sign in successful, navigating to home');
        router.replace("/");
      } else {
        console.log('[Auth Screen] Attempting email sign up for:', email);
        await signUpWithEmail(email, password, name || undefined);
        console.log('[Auth Screen] Sign up successful, showing verification modal');
        
        // Show verification required message
        setVerificationModal({
          visible: true,
          email: email,
        });
        
        // Clear form
        setEmail("");
        setPassword("");
        setName("");
      }
    } catch (error: any) {
      console.error('[Auth Screen] Authentication error:', error);
      
      // Extract error code and message
      const errorCode = String(error.error || "").toUpperCase();
      const errorMessage = error.message || "Authentication failed";
      
      console.log('[Auth Screen] Error code:', errorCode, 'Message:', errorMessage);
      
      // Handle specific error cases with user-friendly messages
      let displayMessage = "";
      
      switch (errorCode) {
        case "EMAIL_NOT_VERIFIED":
          displayMessage = "📧 Email Not Verified\n\nYour email address has not been verified yet.\n\n✅ Good news: We've just sent a new verification email to your inbox!\n\nPlease check your email (and spam folder) and click the verification link to activate your account. Once verified, you can sign in.\n\n💡 Tip: The email should arrive within a few minutes.";
          break;
        
        case "INVALID_CREDENTIALS":
          displayMessage = "❌ Invalid Credentials\n\nThe email or password you entered is incorrect. Please check your credentials and try again.\n\nTip: Make sure Caps Lock is off and you're using the correct email address.";
          break;
        
        case "EMAIL_EXISTS":
          displayMessage = "⚠️ Email Already Registered\n\nAn account with this email address already exists. Please sign in instead, or use a different email address to create a new account.";
          break;
        
        case "USER_NOT_FOUND":
          displayMessage = "❌ Account Not Found\n\nNo account found with this email address. Please check your email or sign up for a new account.";
          break;
        
        case "PASSWORD_TOO_SHORT":
          displayMessage = "⚠️ Password Too Short\n\nPassword must be at least 8 characters long for security. Please choose a longer password.";
          break;
        
        case "INVALID_EMAIL":
          displayMessage = "⚠️ Invalid Email\n\nPlease enter a valid email address (e.g., user@example.com).";
          break;
        
        case "BAD_REQUEST":
          // Check if it's a validation error
          if (errorMessage.toLowerCase().includes("password")) {
            displayMessage = "⚠️ Password Error\n\nPassword must be at least 8 characters long.";
          } else if (errorMessage.toLowerCase().includes("email")) {
            displayMessage = "⚠️ Email Error\n\nPlease enter a valid email address.";
          } else {
            displayMessage = `⚠️ Invalid Request\n\n${errorMessage}`;
          }
          break;
        
        default:
          // Check message content for common error patterns
          const messageLower = errorMessage.toLowerCase();
          
          if (messageLower.includes("fetch") || messageLower.includes("network") || messageLower.includes("404") || messageLower.includes("failed to fetch")) {
            displayMessage = "🔌 Connection Error\n\nUnable to connect to the authentication service. Please check your internet connection and try again.\n\nYou can still use the app without logging in.";
          } else if (messageLower.includes("invalid") || messageLower.includes("credentials") || messageLower.includes("401") || messageLower.includes("incorrect") || messageLower.includes("wrong password")) {
            displayMessage = "❌ Invalid Credentials\n\nThe email or password you entered is incorrect. Please check your credentials and try again.";
          } else if (messageLower.includes("verify") || messageLower.includes("verification") || messageLower.includes("403") || messageLower.includes("not verified")) {
            displayMessage = "📧 Email Not Verified\n\nYour email address has not been verified yet.\n\n✅ Good news: We've just sent a new verification email to your inbox!\n\nPlease check your email (and spam folder) and click the verification link to activate your account.";
          } else if (messageLower.includes("already exists") || messageLower.includes("409") || messageLower.includes("already registered")) {
            displayMessage = "⚠️ Email Already Registered\n\nAn account with this email address already exists. Please sign in instead.";
          } else if (messageLower.includes("not found") || messageLower.includes("no user") || messageLower.includes("user does not exist")) {
            displayMessage = "❌ Account Not Found\n\nNo account found with this email address. Please check your email or sign up for a new account.";
          } else if (messageLower.includes("password") && messageLower.includes("8")) {
            displayMessage = "⚠️ Password Too Short\n\nPassword must be at least 8 characters long.";
          } else {
            // Show the actual error message from the backend with better formatting
            displayMessage = `⚠️ Authentication Error\n\n${errorMessage}`;
          }
      }
      
      setErrorModal({
        visible: true,
        message: displayMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSocialAuth = async (provider: "google" | "apple" | "github") => {
    setLoading(true);
    try {
      console.log('[Auth Screen] Attempting social auth with:', provider);
      if (provider === "google") {
        await signInWithGoogle();
      } else if (provider === "apple") {
        await signInWithApple();
      } else if (provider === "github") {
        await signInWithGitHub();
      }
      console.log('[Auth Screen] Social auth successful, navigating to home');
      router.replace("/");
    } catch (error: any) {
      console.error('[Auth Screen] Social auth error:', error);
      
      // Extract error message from various error formats
      let errorMessage = "Authentication failed";
      
      if (error.message) {
        errorMessage = error.message;
      } else if (error.error) {
        errorMessage = error.error;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      const errorString = String(errorMessage).toLowerCase();
      
      // Handle specific error cases
      if (errorString.includes("fetch") || errorString.includes("network") || errorString.includes("404")) {
        setErrorModal({
          visible: true,
          message: "Authentication service is currently unavailable. You can still use the app without logging in by going back.",
        });
      } else if (errorString.includes("cancelled") || errorString.includes("canceled")) {
        console.log('[Auth Screen] User cancelled social auth');
        // Don't show error modal for user cancellation
      } else if (errorString.includes("popup") || errorString.includes("blocked")) {
        setErrorModal({
          visible: true,
          message: "Please allow popups for this site to use social sign-in.",
        });
      } else {
        setErrorModal({
          visible: true,
          message: `${provider.charAt(0).toUpperCase() + provider.slice(1)} sign-in failed. ${errorMessage}`,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const modeText = mode === "signin" ? "Sign In" : "Sign Up";
  const switchModeText = mode === "signin" 
    ? "Don't have an account? Sign Up" 
    : "Already have an account? Sign In";

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <Text style={styles.title}>{modeText}</Text>

          <Text style={styles.subtitle}>
            Authentication is optional. You can use the app without logging in.
          </Text>

          {mode === "signup" && (
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Name (Optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your name"
                placeholderTextColor="#999"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </View>
          )}

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Email Address</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your email"
              placeholderTextColor="#999"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Password</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Enter your password"
                placeholderTextColor="#999"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
              >
                <IconSymbol
                  ios_icon_name={showPassword ? "eye.slash.fill" : "eye.fill"}
                  android_material_icon_name={showPassword ? "visibility-off" : "visibility"}
                  size={24}
                  color="#666"
                />
              </TouchableOpacity>
            </View>
            {mode === "signup" && (
              <Text style={styles.helperText}>Must be at least 8 characters</Text>
            )}
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.buttonDisabled]}
            onPress={handleEmailAuth}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>{modeText}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.switchModeButton}
            onPress={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            <Text style={styles.switchModeText}>{switchModeText}</Text>
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or continue with</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={styles.socialButton}
            onPress={() => handleSocialAuth("google")}
            disabled={loading}
          >
            <Text style={styles.socialButtonText}>Continue with Google</Text>
          </TouchableOpacity>

          {Platform.OS === "ios" && (
            <TouchableOpacity
              style={[styles.socialButton, styles.appleButton]}
              onPress={() => handleSocialAuth("apple")}
              disabled={loading}
            >
              <Text style={[styles.socialButtonText, styles.appleButtonText]}>
                Continue with Apple
              </Text>
            </TouchableOpacity>
          )}

          {/* DIAGNOSTIC: shows which backend URL this build will call.
              Remove once Google sign-in is confirmed working. */}
          <Text
            selectable
            style={{
              marginTop: 16,
              fontSize: 10,
              color: '#888',
              textAlign: 'center',
              fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
            }}
          >
            backend: {Constants.expoConfig?.extra?.backendUrl || '(unset)'}
          </Text>

          <TouchableOpacity
            style={styles.skipButton}
            onPress={() => router.back()}
          >
            <Text style={styles.skipButtonText}>Skip for now</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal
        visible={errorModal.visible}
        onClose={() => setErrorModal({ visible: false, message: "" })}
        title="Authentication Error"
        message={errorModal.message}
        confirmText="OK"
        confirmColor="#EF4444"
      />

      <Modal
        visible={verificationModal.visible}
        onClose={() => {
          setVerificationModal({ visible: false, email: "" });
          setMode("signin");
        }}
        title="✉️ Check Your Email"
        type="custom"
      >
        <View style={styles.verificationContent}>
          <Text style={styles.verificationText}>
            📧 A verification email has been sent to:
          </Text>
          <Text style={styles.verificationEmail}>{verificationModal.email}</Text>
          <Text style={styles.verificationText}>
            Please open your email and click the verification link to activate your account.
          </Text>
          <Text style={styles.verificationNote}>
            ⚠️ Important: You must verify your email before you can sign in.
          </Text>
          <Text style={styles.verificationSteps}>
            📝 What happens next:
            {'\n'}1. Check your inbox for the verification email
            {'\n'}2. Click the verification link in the email
            {'\n'}3. You'll see a "✅ Email Verified!" confirmation
            {'\n'}4. Return here and sign in with your credentials
          </Text>
          <Text style={styles.verificationHelpText}>
            💡 Tip: The email should arrive within a few minutes. If you don't see it, check your spam/junk folder.
          </Text>
          <TouchableOpacity
            style={styles.verificationButton}
            onPress={() => {
              setVerificationModal({ visible: false, email: "" });
              setMode("signin");
            }}
          >
            <Text style={styles.verificationButtonText}>Got it, I'll check my email</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 8,
    textAlign: "center",
    color: "#000",
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 32,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 6,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: "#fff",
    color: "#000",
  },
  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    backgroundColor: "#fff",
    height: 50,
  },
  passwordInput: {
    flex: 1,
    height: 50,
    paddingHorizontal: 16,
    fontSize: 16,
    color: "#000",
  },
  eyeButton: {
    padding: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  helperText: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
  },
  primaryButton: {
    height: 50,
    backgroundColor: "#007AFF",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  switchModeButton: {
    marginTop: 16,
    alignItems: "center",
  },
  switchModeText: {
    color: "#007AFF",
    fontSize: 14,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#ddd",
  },
  dividerText: {
    marginHorizontal: 12,
    color: "#666",
    fontSize: 14,
  },
  socialButton: {
    height: 50,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
    backgroundColor: "#fff",
  },
  socialButtonText: {
    fontSize: 16,
    color: "#000",
    fontWeight: "500",
  },
  appleButton: {
    backgroundColor: "#000",
    borderColor: "#000",
  },
  appleButtonText: {
    color: "#fff",
  },
  skipButton: {
    marginTop: 16,
    alignItems: "center",
    paddingVertical: 12,
  },
  skipButtonText: {
    color: "#666",
    fontSize: 14,
  },
  verificationContent: {
    paddingVertical: 8,
  },
  verificationText: {
    fontSize: 15,
    color: "#1a1a1a",
    marginBottom: 12,
    lineHeight: 22,
  },
  verificationEmail: {
    fontSize: 16,
    fontWeight: "600",
    color: "#007AFF",
    marginBottom: 16,
    textAlign: "center",
  },
  verificationNote: {
    fontSize: 14,
    color: "#EF4444",
    fontStyle: "italic",
    marginTop: 8,
    marginBottom: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  verificationSteps: {
    fontSize: 14,
    color: "#1a1a1a",
    marginBottom: 16,
    lineHeight: 22,
    backgroundColor: "#F0F9FF",
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#007AFF",
  },
  verificationHelpText: {
    fontSize: 13,
    color: "#666",
    marginBottom: 20,
    textAlign: "center",
    lineHeight: 20,
  },
  verificationButton: {
    height: 50,
    backgroundColor: "#007AFF",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  verificationButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
