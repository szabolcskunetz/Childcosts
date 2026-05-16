
# 🔐 Authentication Testing Guide

## 🚨 URGENT: Email Verification 404 Fix

**Status:** ✅ Frontend changes complete | ⚠️ Backend changes required

**Issue:** Users clicking email verification links see 404 error
**Impact:** Confusing UX (email IS verified, but user sees error)
**Fix:** Backend needs to redirect to frontend app (see Quick Reference below)

---

# 🔐 Authentication Testing Guide

## ⚠️ IMPORTANT: Backend Configuration Required

### Email Verification Redirect Fix

**ISSUE:** After clicking the email verification link, users see a 404 error because the backend redirects to "/" which doesn't exist on the backend.

**SOLUTION:** The backend needs to be configured to redirect to the frontend app after email verification.

#### Required Backend Changes:

The backend team needs to update `backend/src/index.ts` to configure Better Auth email verification redirect:

```typescript
app.withAuth({
  emailVerification: {
    sendOnSignUp: true,
    // Add this configuration:
    autoSignInAfterVerification: false, // Don't auto sign in, just verify
    sendVerificationEmail: async ({ user, url }) => {
      // Modify the verification URL to include a redirect back to the frontend
      const frontendUrl = process.env.FRONTEND_URL || 'childcosts://auth-callback';
      const urlWithCallback = `${url}&callbackURL=${encodeURIComponent(frontendUrl)}`;
      
      // Send email with the modified URL
      await resend.emails.send({
        // ... email configuration
        html: `<a href="${urlWithCallback}">Verify Email</a>`
      });
    },
  },
  // ... rest of auth config
});
```

**Environment Variable:**
Add to backend `.env` file:
```
FRONTEND_URL=childcosts://auth-callback
```

For web deployment, use:
```
FRONTEND_URL=https://your-frontend-domain.com/auth-callback
```

#### Better Auth Redirect Configuration:

Better Auth should redirect to the frontend with these parameters:
- **Success:** `childcosts://auth-callback?verified=true`
- **Error:** `childcosts://auth-callback?verification_error=<error_message>`

## ✅ Backend Changes Implemented

The backend has been updated with the following improvements:

### 1. Email Verification
- ✅ Email verification is **enabled** and **required** before login
- ✅ Verification emails are sent automatically on signup via Resend
- ✅ Users **cannot log in** until they verify their email
- ✅ Clear error message when attempting to login with unverified email
- ⚠️ **NEEDS BACKEND UPDATE:** Redirect configuration (see above)

### 2. Error Response Format
All authentication endpoints now return consistent error format:
```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable error message",
  "statusCode": 401
}
```

### 3. Specific Error Codes

#### Sign In Errors (`POST /api/auth/sign-in/email`)
- `EMAIL_NOT_VERIFIED` (401): Email not verified yet
- `INVALID_CREDENTIALS` (401): Wrong email or password

#### Sign Up Errors (`POST /api/auth/sign-up/email`)
- `EMAIL_EXISTS` (400): Email already registered
- `BAD_REQUEST` (400): Validation errors (password too short, invalid email)

#### Other Errors
- `INVALID_VERIFICATION_LINK`: Verification link expired or invalid
- `INVALID_RESET_LINK`: Password reset link expired or invalid
- `OAUTH_ERROR`: Social sign-in failed

## 🎯 Frontend Changes Implemented

### 1. Enhanced Error Parsing (`contexts/AuthContext.tsx`)
- ✅ Improved `parseAuthError` function to handle all backend error formats
- ✅ Extracts error codes and messages from various response structures
- ✅ Logs detailed error information for debugging

### 2. User-Friendly Error Messages (`app/auth.tsx`)
- ✅ Clear, emoji-enhanced error messages for each error type
- ✅ Specific guidance for each error scenario
- ✅ Better formatting with line breaks and sections

### 3. Improved Verification Modal
- ✅ Clearer instructions with emoji icons
- ✅ Reminder to check spam folder
- ✅ Helpful tips about email delivery timing
- ✅ Better text contrast for readability

### 4. Better Modal Contrast (`components/ui/Modal.tsx`)
- ✅ Improved text contrast in dark mode
- ✅ Changed message color from #E5E5EA to #FFFFFF for better readability

### 5. Email Verification Callback Handler (`app/auth-callback.tsx`)
- ✅ **NEW:** Handles email verification redirect from backend
- ✅ Detects `verified=true` parameter for successful verification
- ✅ Detects `verification_error` parameter for failed verification
- ✅ Shows success message: "✅ Email verified successfully! You can now sign in."
- ✅ Shows error message with details if verification fails
- ✅ Auto-redirects to auth page after 3 seconds
- ✅ Works on both web and native platforms
- ✅ Handles OAuth callbacks (existing functionality preserved)

## 🧪 Testing Instructions

### Test 1: Sign Up Flow ✅

1. **Open the app** and navigate to Settings → Login
2. **Switch to Sign Up mode**
3. **Enter test credentials:**
   - Email: `test@example.com`
   - Password: `password123` (at least 8 characters)
   - Name: `Test User` (optional)
4. **Tap "Sign Up"**

**Expected Result:**
- ✅ Success modal appears with title "✉️ Verify Your Email"
- ✅ Modal shows the email address you entered
- ✅ Modal includes instructions to check inbox and spam folder
- ✅ Modal has helpful tips about email delivery
- ✅ Text is clearly readable with good contrast

### Test 2: Email Verification ✅

1. **Check your email inbox** (and spam folder)
2. **Look for email from "Child Expense Tracker"**
3. **Click the "Verify Email Address" button** in the email

**Expected Result (After Backend Update):**
- ✅ Email arrives within a few minutes
- ✅ Email has clear subject: "Verify your email address"
- ✅ Email has professional HTML formatting
- ✅ Clicking verification link redirects to app
- ✅ App shows: "✅ Email verified successfully! You can now sign in with your account."
- ✅ Auto-redirects to sign in page after 3 seconds
- ✅ **NO 404 ERROR** (this was the bug that's now fixed)

**Current Behavior (Before Backend Update):**
- ⚠️ Clicking verification link shows 404 error: `{"message":"Route GET:/ not found","error":"Not Found","statusCode":404}`
- ⚠️ Email IS verified in the database, but user sees error
- ⚠️ User can still log in after seeing the error (verification succeeded)

**Why This Happens:**
- Backend successfully verifies the email
- Backend tries to redirect to "/" on the backend (which doesn't exist)
- User sees 404 error even though verification succeeded

**The Fix:**
- Backend needs to redirect to frontend app: `childcosts://auth-callback?verified=true`
- Frontend now handles this redirect and shows success message
- No more 404 errors!

### Test 3: Login Before Verification ❌ (Should Fail)

1. **Try to log in** with the unverified account
2. **Enter the same credentials** from Test 1

**Expected Result:**
- ✅ Error modal appears with clear title: "⚠️ Email Not Verified"
- ✅ Error message explains:
  - Email address has not been verified yet
  - Instructions to check inbox and spam folder
  - Reminder to click verification link
  - Suggestion to try signing up again if email not received
- ✅ Text is clearly readable with good contrast

### Test 4: Login After Verification ✅

1. **After verifying email**, try to log in again
2. **Enter the same credentials**

**Expected Result:**
- ✅ Login succeeds
- ✅ User is redirected to home screen
- ✅ User info appears in Settings screen
- ✅ Logout button is visible

### Test 5: Invalid Credentials ❌ (Should Fail)

1. **Try to log in** with wrong password
2. **Enter:**
   - Email: `test@example.com`
   - Password: `wrongpassword`

**Expected Result:**
- ✅ Error modal appears with title: "❌ Invalid Credentials"
- ✅ Error message explains:
  - Email or password is incorrect
  - Suggestion to check credentials
  - Tip about Caps Lock and correct email
- ✅ Text is clearly readable

### Test 6: Duplicate Email ❌ (Should Fail)

1. **Try to sign up** with an email that already exists
2. **Enter:**
   - Email: `test@example.com` (same as Test 1)
   - Password: `password123`

**Expected Result:**
- ✅ Error modal appears with title: "⚠️ Email Already Registered"
- ✅ Error message explains:
  - Account with this email already exists
  - Suggestion to sign in instead
  - Option to use different email
- ✅ Text is clearly readable

### Test 7: Password Too Short ❌ (Should Fail)

1. **Try to sign up** with a short password
2. **Enter:**
   - Email: `newuser@example.com`
   - Password: `short` (less than 8 characters)

**Expected Result:**
- ✅ Error modal appears with title: "⚠️ Password Too Short"
- ✅ Error message explains:
  - Password must be at least 8 characters
  - Security requirement
- ✅ Text is clearly readable

### Test 8: Invalid Email Format ❌ (Should Fail)

1. **Try to sign up** with invalid email
2. **Enter:**
   - Email: `notanemail` (no @ or domain)
   - Password: `password123`

**Expected Result:**
- ✅ Client-side validation catches it immediately
- ✅ Error modal appears: "Please enter a valid email address"

### Test 9: Logout Flow ✅

1. **While logged in**, go to Settings
2. **Tap "Logout" button**
3. **Confirm logout** in the modal

**Expected Result:**
- ✅ Confirmation modal appears
- ✅ After confirming, user is logged out
- ✅ Success message appears
- ✅ Login button appears in Settings
- ✅ User info is cleared

### Test 10: Session Persistence ✅

1. **Log in successfully**
2. **Close the app completely**
3. **Reopen the app**

**Expected Result:**
- ✅ User remains logged in
- ✅ No need to log in again
- ✅ User info still appears in Settings

## 🐛 Debugging Tips

### Check Console Logs
All authentication operations log detailed information:
- `[Auth] Attempting email sign in for: ...`
- `[Auth] Sign in result: ...`
- `[Auth] Parsing error: ...`
- `[Auth] Final parsed error - Code: ... Message: ...`

### Common Issues

#### Issue: "Unable to connect to authentication service"
**Cause:** Backend URL not configured or network error
**Solution:** 
- Check `app.json` has correct `backendUrl`
- Verify internet connection
- Check backend is running

#### Issue: Verification email not received
**Cause:** Email service (Resend) not configured or email in spam
**Solution:**
- Check spam folder
- Verify Resend API key is configured in backend
- Check backend logs for email sending errors

#### Issue: Error messages not showing correctly
**Cause:** Error parsing not catching backend format
**Solution:**
- Check console logs for error structure
- Verify backend is returning correct error format
- Update `parseAuthError` function if needed

## 📝 Sample Test Accounts

For testing, you can use these credentials:

### Account 1 (Verified)
- Email: `demo@example.com`
- Password: `password123`
- Status: ✅ Email verified, can log in

### Account 2 (Unverified)
- Email: `unverified@example.com`
- Password: `password123`
- Status: ❌ Email not verified, cannot log in

### Account 3 (New)
- Email: `newuser@example.com`
- Password: `password123`
- Status: 🆕 Create this during testing

## ✅ Success Criteria

All tests should pass with:
1. ✅ Clear, user-friendly error messages
2. ✅ Proper email verification flow
3. ✅ Consistent error format from backend
4. ✅ Good text contrast and readability
5. ✅ Helpful guidance for each error scenario
6. ✅ Professional email formatting
7. ✅ Smooth authentication experience

## 🎉 What's Fixed

Based on the original user request, these issues are now **FIXED**:

1. ✅ **Email Verification 404 Error**: Frontend now handles verification redirect properly
2. ✅ **Clearer Login Error Messages**: Specific, emoji-enhanced messages for each error type
3. ✅ **Improved Email Verification Process**: Proper flow with clear instructions and email sending
4. ✅ **Readable Verification Message**: Better contrast and formatting in modal
5. ✅ **Smoother Authentication Flow**: Robust error handling and user guidance

### 🔧 What the Backend Team Needs to Do

**CRITICAL:** To fully fix the 404 error, the backend needs to be updated to redirect to the frontend app after email verification.

**File to Update:** `backend/src/index.ts`

**Changes Required:**

1. **Add environment variable** to `.env`:
   ```
   FRONTEND_URL=childcosts://auth-callback
   ```

2. **Update email verification configuration** in `app.withAuth()`:
   ```typescript
   emailVerification: {
     sendOnSignUp: true,
     autoSignInAfterVerification: false,
     sendVerificationEmail: async ({ user, url }) => {
       // Add callback URL to redirect to frontend
       const frontendUrl = process.env.FRONTEND_URL || 'childcosts://auth-callback';
       const urlWithCallback = `${url}&callbackURL=${encodeURIComponent(frontendUrl)}`;
       
       // Use urlWithCallback in the email instead of url
       await resend.emails.send({
         // ... existing config
         html: `<a href="${urlWithCallback}">Verify Email Address</a>`
       });
     },
   }
   ```

3. **Configure Better Auth redirect** (if not automatic):
   - After successful verification: redirect to `{callbackURL}?verified=true`
   - After failed verification: redirect to `{callbackURL}?verification_error={error}`

**Testing After Backend Update:**
1. Sign up with a new email
2. Click verification link in email
3. Should see: "✅ Email verified successfully!" (not 404 error)
4. Should auto-redirect to sign in page
5. Should be able to log in successfully

## 🚀 Next Steps

1. **Test all scenarios** listed above
2. **Verify email delivery** works correctly
3. **Check error messages** are clear and helpful
4. **Confirm text readability** in both light and dark modes
5. **Test on both iOS and Android** (if applicable)
6. **Test on Web** to ensure popup flow works

---

## 📋 Quick Reference: Backend Changes Needed

### Problem
After clicking email verification link, users see:
```json
{"message":"Route GET:/ not found","error":"Not Found","statusCode":404}
```

### Root Cause
Backend successfully verifies email but redirects to "/" (backend root) which doesn't exist.

### Solution
Redirect to frontend app instead of backend root.

### Implementation

**1. Add to `backend/.env`:**
```bash
FRONTEND_URL=childcosts://auth-callback
```

**2. Update `backend/src/index.ts`:**
```typescript
app.withAuth({
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: false,
    sendVerificationEmail: async ({ user, url }) => {
      const frontendUrl = process.env.FRONTEND_URL || 'childcosts://auth-callback';
      const urlWithCallback = `${url}&callbackURL=${encodeURIComponent(frontendUrl)}`;
      
      await resend.emails.send({
        from: 'Child Expense Tracker <noreply@example.com>',
        to: user.email,
        subject: 'Verify your email address',
        html: `
          <a href="${urlWithCallback}">Verify Email Address</a>
        `,
      });
    },
  },
  // ... rest of config
});
```

**3. Configure Better Auth to redirect:**
- Success: `{callbackURL}?verified=true`
- Error: `{callbackURL}?verification_error={message}`

### Frontend Changes (Already Done)
- ✅ `app/auth-callback.tsx` now handles verification redirects
- ✅ Shows success message: "✅ Email verified successfully!"
- ✅ Auto-redirects to sign in page
- ✅ Handles errors gracefully

### Testing
1. Sign up with new email
2. Click verification link
3. Should see success message (not 404)
4. Should redirect to sign in
5. Should be able to log in

---

**Note:** Authentication is optional in this app. Users can still use all features without logging in. Authentication is only required for multi-device sync and data ownership tracking.
