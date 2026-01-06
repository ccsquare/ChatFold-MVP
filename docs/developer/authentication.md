# Authentication System

This document describes the email-based authentication system implemented for ChatFold.

## Overview

ChatFold uses an email verification code registration system with JWT token-based authentication, based on the implementation from the InfoAgent project.

## Features

- **Email Verification**: 6-digit verification codes sent via email
- **JWT Tokens**: 15-minute expiring access tokens
- **Password Hashing**: bcrypt for secure password storage
- **Rate Limiting**: Email and IP-based rate limiting to prevent abuse
- **Redis Caching**: User data cached for performance

## Architecture

### Frontend (`web/`)

**Pages**:

- [/auth/login](../../web/src/app/auth/login/page.tsx) - Login page
- [/auth/signup](../../web/src/app/auth/signup/page.tsx) - Registration page
- [/auth/forgot-password](../../web/src/app/auth/forgot-password/page.tsx) - Password reset

**Components**:

- [AuthLayout.tsx](../../web/src/components/auth/AuthLayout.tsx) - Shared auth page layout
- [LoginForm.tsx](../../web/src/components/auth/LoginForm.tsx) - Login form component
- [SignupForm.tsx](../../web/src/components/auth/SignupForm.tsx) - Registration form component

### Backend (`backend/`)

**API Endpoints** (`/api/v1/auth`):

- `POST /send-verification-code` - Send verification code to email
- `POST /register` - Register new user
- `POST /login` - Login and get JWT token
- `GET /me` - Get current user info

**Services**:

- [auth_service.py](../../backend/app/services/auth_service.py) - JWT and password management
- [verification_service.py](../../backend/app/services/verification_service.py) - Verification code logic
- [email_service.py](../../backend/app/services/email_service.py) - Email sending

**Models**:

- User model updated with `username`, `hashed_password`, `onboarding_completed`
- [auth_schemas.py](../../backend/app/models/auth_schemas.py) - Pydantic schemas for requests/responses

## User Registration Flow

```
1. User enters email on signup page
   ↓
2. Click "Send" button
   ↓
3. Frontend: POST /api/v1/auth/send-verification-code
   ↓
4. Backend:
   - Check if email already registered
   - Check rate limits (email + IP)
   - Generate 6-digit code
   - Store in Redis (5 min expiry)
   - Send email (dev mode: logs to console)
   ↓
5. User receives email with code
   ↓
6. User fills form:
   - Email
   - Verification code
   - Username
   - Password
   - Confirm password
   - Accept terms
   ↓
7. Frontend: POST /api/v1/auth/register
   ↓
8. Backend:
   - Verify code from Redis
   - Check email/username not taken
   - Hash password with bcrypt
   - Create User in database
   - Return user data
   ↓
9. Redirect to login page
```

## User Login Flow

```
1. User enters email + password
   ↓
2. Frontend: POST /api/v1/auth/login
   ↓
3. Backend:
   - Query User by email
   - Verify password hash
   - Create JWT token (15 min expiry)
   - Return access_token
   ↓
4. Frontend:
   - Store token in localStorage
   - Redirect to main app
   ↓
5. For authenticated requests:
   - Add header: Authorization: Bearer <token>
   ↓
6. Backend middleware:
   - Decode JWT token
   - Get user from Redis cache (or DB)
   - Inject user into request context
```

## Configuration

### JWT Settings

Located in [auth_service.py:15-16](../../backend/app/services/auth_service.py#L15-L16):

```python
SECRET_KEY = "your-secret-key-change-in-production"  # TODO: Move to settings
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 15
```

**TODO**: Move `SECRET_KEY` to environment variable in production.

### Email Settings

Located in [email_service.py:10-17](../../backend/app/services/email_service.py#L10-L17):

```python
EMAIL_DEV_MODE = True  # Set to False in production
SENDER_EMAIL = "noreply@chatfold.com"
SENDER_NAME = "ChatFold"
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587
SMTP_USERNAME = ""  # Set via environment variable
SMTP_PASSWORD = ""  # Set via environment variable
```

**Development Mode**: When `EMAIL_DEV_MODE = True`, verification codes are logged to console instead of sending emails.

### Verification Code Settings

Located in [verification_service.py:12-18](../../backend/app/services/verification_service.py#L12-L18):

```python
CODE_LENGTH = 6
CODE_EXPIRY = 300  # 5 minutes
MAX_ATTEMPTS = 3
EMAIL_RATE_LIMIT = 60  # 1 minute between sends
IP_RATE_LIMIT_COUNT = 10
IP_RATE_LIMIT_WINDOW = 3600  # 1 hour
```

## Security Features

### Password Security

- **bcrypt hashing** with random salt
- Minimum 6 characters (frontend validation)
- Constant-time comparison

### Token Security

- **JWT tokens** with HS256 algorithm
- 15-minute expiration
- Stored in localStorage (standard for SPAs)
- Bearer token authentication

### Rate Limiting

- **Email limit**: 1 minute between verification code sends per email
- **IP limit**: 10 verification codes per hour per IP
- **Attempt limit**: 3 verification attempts before code expires

### Redis Keys

```
chatfold:verification:code:{email}     - Code data (5 min TTL)
chatfold:verification:rate:{email}     - Email rate limit (1 min TTL)
chatfold:verification:ip:{ip}          - IP rate limit (1 hour TTL)
chatfold:user:{user_id}                - User cache (15 min TTL)
```

## Development Setup

### 1. Install Dependencies

```bash
cd backend
uv sync
```

### 2. Start Redis

```bash
./scripts/local-dev/start.sh
```

### 3. Update Database Schema

Run database migrations to add new User fields:

- `username`
- `hashed_password`
- `onboarding_completed`
- `updated_at`

Or drop and recreate the database for development.

### 4. Start Backend

```bash
cd backend
uv run uvicorn app.main:app --reload --port 8000
```

### 5. Start Frontend

```bash
cd web
npm install  # If new dependencies added
npm run dev
```

### 6. Test Registration

1. Navigate to http://localhost:3000/auth/signup
2. Enter email address
3. Click "Send" - code will appear in backend console logs
4. Fill in the form and submit
5. Should redirect to login page

### 7. Test Login

1. Navigate to http://localhost:3000/auth/login
2. Enter registered email and password
3. Click "Log in"
4. Should redirect to main app with token stored

## API Testing

### Send Verification Code

```bash
curl -X POST http://localhost:8000/api/v1/auth/send-verification-code \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'
```

### Register User

```bash
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "username": "testuser",
    "password": "password123",
    "verification_code": "123456"
  }'
```

### Login

```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

Response:

```json
{
  "access_token": "eyJhbGc...",
  "token_type": "bearer"
}
```

### Get Current User

```bash
curl http://localhost:8000/api/v1/auth/me \
  -H "Authorization: Bearer eyJhbGc..."
```

## Production Deployment Checklist

- [ ] Move `SECRET_KEY` to environment variable
- [ ] Set `EMAIL_DEV_MODE = False`
- [ ] Configure SMTP credentials in environment
- [ ] Use strong `SECRET_KEY` (generate with `openssl rand -hex 32`)
- [ ] Enable HTTPS for frontend
- [ ] Configure CORS origins for production domain
- [ ] Set up email service (Gmail, SendGrid, etc.)
- [ ] Monitor Redis memory usage
- [ ] Set up rate limiting at API gateway level
- [ ] Implement password strength requirements
- [ ] Add email verification for password reset
- [ ] Set up logging and monitoring for auth events

## Future Enhancements

- [ ] Refresh tokens for longer sessions
- [ ] OAuth integration (Google, GitHub)
- [ ] Two-factor authentication (2FA)
- [ ] Password reset via email link
- [ ] Account email change with verification
- [ ] Session management (logout all devices)
- [ ] Login history and security notifications
- [ ] Passwordless login (magic links)

## Troubleshooting

### Verification code not received

- Check backend logs for code (dev mode)
- Verify email rate limiting hasn't triggered
- Check Redis connection
- Verify SMTP credentials (production)

### Login fails with correct credentials

- Check User exists in database
- Verify password was hashed correctly
- Check for bcrypt version compatibility
- Verify database connection

### Token expired errors

- Tokens expire after 15 minutes
- User must login again to get new token
- Consider implementing refresh tokens

### Redis connection errors

- Verify Redis is running: `docker ps | grep redis`
- Check Redis connection settings in [settings.py](../../backend/app/settings.py)
- Fallback to database if Redis unavailable (already implemented)

## References

- InfoAgent authentication: `/Users/chuancheng/Projects/InfoAgent`
- Figma design: [注册登录 Section](https://www.figma.com/design/gjdTkVvIVBd5ou18mWpjbR/SPX-Copy-ChatFold?node-id=424-5112)
- FastAPI security: https://fastapi.tiangolo.com/tutorial/security/
- JWT tokens: https://jwt.io/
- bcrypt: https://github.com/pyca/bcrypt/
