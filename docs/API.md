# MedConsults CRM - API Specification

Base Path: `/api/v1`  
Protocol: `HTTP/REST (JSON)`  
Authentication: `Authorization: Bearer <accessToken>` (15-minute access JWT)  
Session Cookie: `refreshToken` (HttpOnly, Secure in production, SameSite=Strict, Path=/api/v1/auth, 7-day lifespan)

---

## Global Response Formats

### Standard Success Response
```json
{
  "success": true,
  "data": { ... }
}
```

### Standard Error Response
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable description",
    "fields": {
      "fieldName": "Specific validation failure message"
    }
  }
}
```

### Standard Error Codes
| HTTP Status | Code | Meaning |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Schema validation failure (includes `fields` object) |
| 400 | `INVALID_REQUEST` | Business rule or token consumption failure |
| 401 | `UNAUTHORIZED` | Missing, expired, or invalid credentials |
| 401 | `TOKEN_EXPIRED` | Access JWT has expired |
| 401 | `TOKEN_INVALID` | Malformed or tampered token |
| 401 | `REFRESH_TOKEN_INVALID` | Invalid refresh token or token reuse detected |
| 403 | `FORBIDDEN` | Insufficient role permissions or blocked account |
| 404 | `NOT_FOUND` | Resource not found (also returned on wrong-owner access) |
| 409 | `CONFLICT` | Resource identifier already in use (e.g. duplicate email) |
| 423 | `ACCOUNT_LOCKED` | Account locked for 15 minutes due to 5 consecutive login failures |
| 429 | `RATE_LIMIT_EXCEEDED` | Request frequency limit exceeded |
| 500 | `INTERNAL_ERROR` | Unexpected server failure |

---

## Authentication Endpoints (`/api/v1/auth`)

### 1. Patient Registration (`POST /auth/register`)
- **Description**: Registers a new patient account, generates a linked Patient CRM record with a unique `patientCode`, and dispatches an email verification token.
- **Auth**: Public
- **Rate Limit**: 10 failed requests per minute per IP.
- **Request Body**:
```json
{
  "name": "Aarav Sharma",
  "email": "aarav.sharma@example.com",
  "phone": "+919820112233",
  "password": "SecurePassword123!"
}
```
- **Responses**:
  - `201 Created`:
    ```json
    {
      "success": true,
      "data": {
        "message": "Registration successful. Please check your email to verify your account.",
        "user": {
          "_id": "673b22e18d6a36bc6ad5021a",
          "name": "Aarav Sharma",
          "email": "aarav.sharma@example.com",
          "role": "patient",
          "emailVerified": false,
          "status": "active"
        }
      }
    }
    ```
  - `400 Bad Request` (`VALIDATION_ERROR`): Invalid format, weak password, or missing required fields.
  - `409 Conflict` (`CONFLICT`): An account with this email address already exists.
  - `429 Too Many Requests` (`RATE_LIMIT_EXCEEDED`): Rate limit exceeded.

---

### 2. Doctor Registration (`POST /auth/register-doctor`)
- **Description**: Registers a doctor profile. The user account is set to `status: pending` and the doctor record to `approvalStatus: pending` until reviewed by an administrator.
- **Auth**: Public
- **Request Body**:
```json
{
  "name": "Dr. Ananya Rao",
  "email": "dr.ananya@example.com",
  "phone": "+919820199999",
  "password": "DoctorPassword123!",
  "specialty": "Cardiology",
  "qualifications": ["MBBS", "MD Cardiology"],
  "registrationNo": "MMC-2015-8849",
  "experienceYears": 12,
  "consultationFee": 1000,
  "clinicRoom": "Room 204",
  "bio": "Senior Cardiologist specializing in preventive heart care.",
  "languages": ["English", "Hindi", "Marathi"]
}
```
- **Responses**:
  - `201 Created`: Doctor created in pending state.
  - `400 Bad Request` (`VALIDATION_ERROR`): Validation errors in fields.
  - `409 Conflict` (`CONFLICT`): Email already exists.

---

### 3. Verify Email (`POST /auth/verify-email`)
- **Description**: Validates and consumes the 48-byte opaque verification token, setting `emailVerified = true`.
- **Auth**: Public
- **Request Body**:
```json
{
  "token": "7a9f82d1c68e4a90875e6d23fb410c5a..."
}
```
- **Responses**:
  - `200 OK`:
    ```json
    {
      "success": true,
      "data": {
        "message": "Email verified successfully."
      }
    }
    ```
  - `400 Bad Request` (`INVALID_REQUEST`): Token is invalid, expired (>15 minutes), or already consumed.

---

### 4. Resend Verification Email (`POST /auth/resend-verification`)
- **Description**: Issues a fresh verification link if the account exists and is unverified. Enforces a strict 60-second cooldown per user.
- **Auth**: Public
- **Rate Limit**: Sensitive endpoint limit (5 per 15 min per IP) + 60-second per-user cooldown.
- **Request Body**:
```json
{
  "email": "aarav.sharma@example.com"
}
```
- **Responses**:
  - `200 OK`:
    ```json
    {
      "success": true,
      "data": {
        "message": "If that email is registered and unverified, a verification email has been sent."
      }
    }
    ```
  - `429 Too Many Requests` (`RATE_LIMIT_EXCEEDED`): Attempted before 60 seconds have elapsed.

---

### 5. Login (`POST /auth/login`)
- **Description**: Authenticates user via email and password. Returns a 15-minute access JWT in JSON and sets a 7-day rotated refresh token in an HttpOnly, Secure, SameSite=Strict cookie scoped to `/api/v1/auth`.
- **Auth**: Public
- **Business Rules**:
  - Failed logins are incremented on incorrect password.
  - On the 5th consecutive failure, the account is locked for 15 minutes (`423 ACCOUNT_LOCKED`) and an audit log entry is written.
  - Successful login resets the failure counter.
  - Maximum of 5 concurrent active refresh sessions per user.
  - Blocked users receive `403 FORBIDDEN`.
- **Request Body**:
```json
{
  "email": "aarav.sharma@example.com",
  "password": "SecurePassword123!"
}
```
- **Responses**:
  - `200 OK`:
    ```json
    {
      "success": true,
      "data": {
        "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
        "user": {
          "_id": "673b22e18d6a36bc6ad5021a",
          "name": "Aarav Sharma",
          "email": "aarav.sharma@example.com",
          "role": "patient",
          "emailVerified": false,
          "status": "active"
        }
      }
    }
    ```
  - `401 Unauthorized` (`UNAUTHORIZED`): Generic `"Invalid email or password."` message.
  - `403 Forbidden` (`FORBIDDEN`): Account is blocked.
  - `423 Locked` (`ACCOUNT_LOCKED`): Account is locked due to 5 failed attempts.

---

### 6. Refresh Token (`POST /auth/refresh`)
- **Description**: Reads the HttpOnly `refreshToken` cookie, rotates the token (issues a new one, invalidates the old one), and returns a fresh access JWT.
- **Auth**: Public (Cookie-based session)
- **Business Rules**:
  - If a refresh token that was already rotated is presented, **all sessions** for that user are immediately revoked, an audit log is recorded, and `REFRESH_TOKEN_INVALID` is returned.
- **Responses**:
  - `200 OK`:
    ```json
    {
      "success": true,
      "data": {
        "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
      }
    }
    ```
  - `401 Unauthorized` (`REFRESH_TOKEN_INVALID`): Invalid token or token reuse detected.

---

### 7. Logout (`POST /auth/logout`)
- **Description**: Clears the `refreshToken` cookie and removes the active session's hash from the database.
- **Auth**: Any active session
- **Responses**:
  - `200 OK`:
    ```json
    {
      "success": true,
      "data": {
        "message": "Logged out successfully."
      }
    }
    ```

---

### 8. Forgot Password (`POST /auth/forgot-password`)
- **Description**: Dispatches a 15-minute single-use password reset email.
- **Auth**: Public
- **Business Rules**:
  - Returns identical generic 200 message regardless of whether the email exists to prevent user enumeration.
- **Request Body**:
```json
{
  "email": "aarav.sharma@example.com"
}
```
- **Responses**:
  - `200 OK`:
    ```json
    {
      "success": true,
      "data": {
        "message": "If that email is registered, a password reset link has been sent."
      }
    }
    ```

---

### 9. Reset Password (`POST /auth/reset-password`)
- **Description**: Consumes the reset token, updates the password hash, and revokes all active refresh sessions for that user.
- **Auth**: Public
- **Request Body**:
```json
{
  "token": "7a9f82d1c68e4a90875e6d23fb410c5a...",
  "password": "NewStrongPassword456!"
}
```
- **Responses**:
  - `200 OK`:
    ```json
    {
      "success": true,
      "data": {
        "message": "Password reset successfully. Please log in with your new password."
      }
    }
    ```
  - `400 Bad Request` (`INVALID_REQUEST`): Token is invalid, expired, or already consumed.

---

## User Profile Endpoints (`/api/v1/users`)

### 10. Get Current Profile (`GET /users/me`)
- **Description**: Returns the authenticated user's own profile details.
- **Auth**: `Authorization: Bearer <accessToken>`
- **Responses**:
  - `200 OK`:
    ```json
    {
      "success": true,
      "data": {
        "user": {
          "_id": "673b22e18d6a36bc6ad5021a",
          "name": "Aarav Sharma",
          "email": "aarav.sharma@example.com",
          "phone": "+919820112233",
          "role": "patient",
          "emailVerified": true,
          "status": "active"
        }
      }
    }
    ```
  - `401 Unauthorized` (`UNAUTHORIZED`): Missing or invalid Bearer token.
  - `403 Forbidden` (`FORBIDDEN`): User account is blocked.

---

### 11. Update Current Profile (`PATCH /users/me`)
- **Description**: Updates the authenticated user's own `name` and/or `phone`. If the user is a patient, synchronizes these updates with the linked Patient record.
- **Auth**: `Authorization: Bearer <accessToken>`
- **Request Body**:
```json
{
  "name": "Aarav Sharma",
  "phone": "+919820112244"
}
```
- **Responses**:
  - `200 OK`: Updated user profile.
  - `400 Bad Request` (`VALIDATION_ERROR`): Invalid format or disallowed properties passed.
  - `401 Unauthorized` (`UNAUTHORIZED`): Missing or invalid token.
