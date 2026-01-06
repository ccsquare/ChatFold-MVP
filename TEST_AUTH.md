# Authentication System Testing Guide

## ✅ Implementation Complete

The frontend authentication system has been fully implemented and integrated with the backend API.

### Components Created

1. **API Client** (`web/src/lib/api/auth.ts`)
   - `sendVerificationCode()` - Send email verification code
   - `register()` - User registration
   - `login()` - User login
   - `getCurrentUser()` - Get current user info
   - `verifyToken()` - Verify JWT token

2. **Authentication Store** (`web/src/lib/stores/authStore.ts`)
   - Zustand store with persistence
   - State: user, token, isAuthenticated, isLoading, error
   - Actions: login, register, logout, sendCode, loadUser

3. **UI Components**
   - `AuthDialog.tsx` - Main authentication dialog
   - `LoginForm.tsx` - Login form with email/password
   - `RegisterForm.tsx` - Registration form with email verification
   - `UserMenu.tsx` - User menu in sidebar (login/logout)
   - `AuthProvider.tsx` - Initializes auth state on app load

4. **Integration**
   - Updated `Sidebar.tsx` to use UserMenu
   - Updated `layout.tsx` to include AuthProvider
   - Full integration with backend API

## Testing the Authentication Flow

### Prerequisites

1. Backend running with FakeRedis:

   ```bash
   cd backend
   CHATFOLD_USE_MEMORY_STORE=true uv run uvicorn app.main:app --reload
   ```

2. Frontend running:
   ```bash
   cd web
   npm run dev
   ```

### Test Steps

#### 1. Register a New User

1. Open http://localhost:3000
2. Click on "Guest" user menu at bottom left
3. Select "Sign up" from dropdown
4. Fill in email (e.g., `test@example.com`)
5. Click "Send Code"
6. Check backend logs for verification code:
   ```
   [INFO][email_service.py:37]: Code: XXXXXX
   ```
7. Enter the 6-digit code
8. Fill in username and password
9. Click "Create account"
10. ✅ Should automatically log in and show username

#### 2. Logout

1. Click on your username in bottom left
2. Select "Log out"
3. ✅ Should show "Guest" again

#### 3. Login with Existing Account

1. Click on "Guest"
2. Select "Log in"
3. Enter email and password
4. Click "Log in"
5. ✅ Should log in and show your username

#### 4. Test Persistence

1. Login to your account
2. Refresh the page
3. ✅ Should remain logged in (token persisted)

#### 5. Test API Integration

Open browser console and check:

```javascript
// Check auth state
JSON.parse(localStorage.getItem("auth-storage"));

// Should show:
// {
//   state: {
//     user: { id, username, email, ... },
//     token: "eyJ...",
//     isAuthenticated: true
//   }
// }
```

## Backend API Endpoints Used

- `POST /api/v1/auth/send-verification-code` - Send code
- `POST /api/v1/auth/register` - Register user
- `POST /api/v1/auth/login` - Login
- `GET /api/v1/auth/me` - Get current user

## Features Implemented

✅ Email-based registration with verification code
✅ Password-based login
✅ JWT token authentication
✅ Persistent login (localStorage)
✅ Auto-restore session on page load
✅ User menu with login/logout
✅ Error handling and toast notifications
✅ Loading states
✅ Form validation

## Next Steps (Optional Enhancements)

- [ ] Password reset functionality
- [ ] Email verification reminder
- [ ] Profile editing
- [ ] Session timeout handling
- [ ] Remember me functionality
- [ ] Social login (Google, GitHub, etc.)

## Troubleshooting

### Verification code not received

- Check backend logs for the code (dev mode logs codes to console)
- Make sure backend is running

### Login fails

- Check backend is running on port 8000
- Verify email and password are correct
- Check browser console for errors

### State not persisting

- Check localStorage in browser dev tools
- Clear browser cache and try again
