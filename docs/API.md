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
| 403 | `EMAIL_NOT_VERIFIED` | Patient email address must be verified prior to booking |
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

---

### 12. List Users (`GET /users`)
- **Description**: Retrieves a paginated list of clinic users with optional filters for role, status, and text search.
- **Auth**: `Authorization: Bearer <accessToken>` (Admin only)
- **Query Parameters**:
  - `role`: Filter by user role (`patient`, `doctor`, `staff`, `admin`)
  - `status`: Filter by user status (`active`, `pending`, `blocked`)
  - `q`: Search query matching against name, email, or phone
  - `page`: Page number (default: 1)
  - `limit`: Items per page (default: 20, max: 100)
- **Responses**:
  - `200 OK`:
    ```json
    {
      "success": true,
      "data": {
        "users": [
          {
            "_id": "673b22e18d6a36bc6ad5021a",
            "name": "Pooja Sawant",
            "email": "staff@medconsults.example",
            "phone": "+919820011001",
            "role": "staff",
            "status": "active",
            "emailVerified": true,
            "createdAt": "2026-11-18T10:00:00.000Z"
          }
        ],
        "pagination": {
          "total": 1,
          "page": 1,
          "limit": 20,
          "totalPages": 1
        }
      }
    }
    ```
  - `401 Unauthorized` (`UNAUTHORIZED`): Missing or invalid token.
  - `403 Forbidden` (`FORBIDDEN`): Requester is not an administrator.

---

### 13. Create Staff or Admin User (`POST /users`)
- **Description**: Creates a staff or administrator user account with a randomly generated initial password, provisions a password reset token, and dispatches a setup email.
- **Auth**: `Authorization: Bearer <accessToken>` (Admin only)
- **Request Body**:
```json
{
  "name": "Sunil Gavaskar",
  "email": "sunil.g@medconsults.example",
  "phone": "+919820123456",
  "role": "staff"
}
```
- **Responses**:
  - `201 Created`: Created user object (passwords and token hashes omitted).
  - `400 Bad Request` (`VALIDATION_ERROR`): Invalid format or disallowed role (only `staff` or `admin` allowed).
  - `401 Unauthorized` (`UNAUTHORIZED`): Missing or invalid token.
  - `403 Forbidden` (`FORBIDDEN`): Requester is not an administrator.
  - `409 Conflict` (`CONFLICT`): An account with this email address already exists.

---

### 14. Update User (`PATCH /users/:id`)
- **Description**: Updates a user's name, phone number, or role. Prevents administrators from demoting their own role.
- **Auth**: `Authorization: Bearer <accessToken>` (Admin only)
- **Request Body**:
```json
{
  "name": "Sunil Gavaskar Updated",
  "phone": "+919820999988",
  "role": "staff"
}
```
- **Responses**:
  - `200 OK`: Updated user profile.
  - `400 Bad Request` (`VALIDATION_ERROR`): Validation failure.
  - `401 Unauthorized` (`UNAUTHORIZED`): Missing or invalid token.
  - `403 Forbidden` (`CANNOT_SELF_DEMOTE`): Administrator attempting to modify their own role.
  - `404 Not Found` (`NOT_FOUND`): User ID does not exist or has been soft-deleted.

---

### 15. Block User (`POST /users/:id/block`)
- **Description**: Sets the user status to `blocked` and immediately revokes all active session refresh tokens. Prevents administrators from blocking themselves.
- **Auth**: `Authorization: Bearer <accessToken>` (Admin only)
- **Responses**:
  - `200 OK`:
    ```json
    {
      "success": true,
      "data": {
        "message": "User blocked successfully and all active sessions revoked."
      }
    }
    ```
  - `401 Unauthorized` (`UNAUTHORIZED`): Missing or invalid token.
  - `403 Forbidden` (`FORBIDDEN`): Administrator attempting to block their own account.
  - `404 Not Found` (`NOT_FOUND`): User not found.

---

### 16. Unblock User (`POST /users/:id/unblock`)
- **Description**: Restores a blocked user account to `active` status.
- **Auth**: `Authorization: Bearer <accessToken>` (Admin only)
- **Responses**:
  - `200 OK`: Confirmation message.
  - `401 Unauthorized` (`UNAUTHORIZED`): Missing or invalid token.
  - `403 Forbidden` (`FORBIDDEN`): Requester is not an administrator.
  - `404 Not Found` (`NOT_FOUND`): User not found.

---

## Doctors Endpoints (`/api/v1/doctors`)

### 17. List Approved Doctors (`GET /doctors`)
- **Description**: Public directory of approved doctors. Online status is derived from a heartbeat received within the last 2 minutes or the doctor's manual presence toggle. Email, phone, and internal security fields are never exposed.
- **Auth**: Public (Rate-limited)
- **Query Parameters**:
  - `specialty`: Filter by clinical specialty
  - `q`: Search query matching doctor name, bio, or specialty
  - `availableToday`: Boolean (`true` or `false`) to filter doctors holding scheduled availability on current weekday in Asia/Kolkata
  - `page`: Page number (default: 1)
  - `limit`: Items per page (default: 20, max: 100)
- **Responses**:
  - `200 OK`: Paginated list of approved doctors.
  - `429 Too Many Requests` (`RATE_LIMIT_EXCEEDED`): Rate limit exceeded on public doctor directory.

---

### 18. Get Doctor by ID (`GET /doctors/:id`)
- **Description**: Public profile of an approved doctor. Returns 404 if the doctor is pending, blocked, or soft-deleted.
- **Auth**: Public (Rate-limited)
- **Responses**:
  - `200 OK`: Public doctor profile data.
  - `404 Not Found` (`NOT_FOUND`): Doctor not found or not approved.

---

### 19. Get Available Appointment Slots (`GET /doctors/:id/slots`)
- **Description**: Calculates available appointment slots for a doctor on a specific date in the Asia/Kolkata timezone. Computes slots from weekly availability sessions, minus blocked dates, minus active appointments (booked, checked_in, in_consultation, completed), minus times that have already elapsed today.
- **Auth**: Public (Rate-limited)
- **Query Parameters**:
  - `date`: Target date in `YYYY-MM-DD` format (required; cannot be in past, cannot exceed 30 days ahead)
- **Responses**:
  - `200 OK`:
    ```json
    {
      "success": true,
      "data": {
        "doctorId": "673b22e18d6a36bc6ad5021a",
        "date": "2026-11-20",
        "slotMinutes": 15,
        "slots": [
          {
            "start": "2026-11-20T03:30:00.000Z",
            "end": "2026-11-20T03:45:00.000Z",
            "time": "09:00"
          }
        ]
      }
    }
    ```
  - `400 Bad Request` (`INVALID_REQUEST`): Past date, invalid date format, or date exceeds 30-day window.
  - `404 Not Found` (`NOT_FOUND`): Doctor not found or not approved.

---

### 20. Get Own Doctor Profile (`GET /doctors/me`)
- **Description**: Doctor retrieves their own profile and availability configuration.
- **Auth**: `Authorization: Bearer <accessToken>` (Doctor only)
- **Responses**:
  - `200 OK`: Full doctor document.
  - `401 Unauthorized` (`UNAUTHORIZED`): Missing or invalid token.
  - `403 Forbidden` (`FORBIDDEN`): Requester is not a doctor.
  - `404 Not Found` (`NOT_FOUND`): Doctor profile not found.

---

### 21. Update Own Doctor Profile (`PATCH /doctors/me`)
- **Description**: Doctor updates bio, qualifications, spoken languages, consultation fee, or clinic room number.
- **Auth**: `Authorization: Bearer <accessToken>` (Doctor only)
- **Request Body**:
```json
{
  "bio": "Senior Consultant with focus on clinical cardiology.",
  "consultationFee": 1500,
  "clinicRoom": "Room 101-B"
}
```
- **Responses**:
  - `200 OK`: Updated doctor profile.
  - `400 Bad Request` (`VALIDATION_ERROR`): Validation errors.
  - `401 Unauthorized` (`UNAUTHORIZED`): Missing or invalid token.
  - `403 Forbidden` (`FORBIDDEN`): Requester is not a doctor.

---

### 22. Update Weekly Availability (`PUT /doctors/me/availability`)
- **Description**: Doctor configures weekly recurring session times, slot duration (10, 15, 20, or 30 minutes), and blocked dates. Validates that sessions on the same day do not overlap.
- **Auth**: `Authorization: Bearer <accessToken>` (Doctor only)
- **Request Body**:
```json
{
  "slotMinutes": 15,
  "weeklyAvailability": [
    {
      "dayOfWeek": 1,
      "slots": [
        { "start": "09:00", "end": "13:00" },
        { "start": "16:00", "end": "20:00" }
      ]
    }
  ],
  "blockedDates": []
}
```
- **Responses**:
  - `200 OK`: Updated doctor document.
  - `400 Bad Request` (`VALIDATION_ERROR`): Overlapping availability sessions, invalid times, or unsupported slot length.

---

### 23. Update Doctor Online Presence (`PATCH /doctors/me/online`)
- **Description**: Doctor manually toggles active clinical presence.
- **Auth**: `Authorization: Bearer <accessToken>` (Doctor only)
- **Request Body**:
```json
{
  "isOnline": true
}
```
- **Responses**:
  - `200 OK`: Updated presence status and `lastSeenAt` timestamp.

---

### 24. Record Doctor Heartbeat (`POST /doctors/me/heartbeat`)
- **Description**: Lightweight heartbeat endpoint called periodically by the doctor dashboard to keep online status fresh.
- **Auth**: `Authorization: Bearer <accessToken>` (Doctor only)
- **Responses**:
  - `200 OK`: Updated `lastSeenAt` timestamp.

---

### 25. List All Doctors for Administration (`GET /doctors/admin/list`)
- **Description**: Admin directory of all doctors across all approval statuses (`pending`, `approved`, `blocked`), populated with linked user credentials.
- **Auth**: `Authorization: Bearer <accessToken>` (Admin only)
- **Query Parameters**:
  - `approvalStatus`: Filter by approval status
  - `specialty`: Filter by specialty
  - `q`: Search query matching doctor or user details
  - `page`: Page number (default: 1)
  - `limit`: Items per page (default: 20, max: 100)
- **Responses**:
  - `200 OK`: Paginated list of doctors with user metadata.
  - `401 Unauthorized` (`UNAUTHORIZED`): Missing or invalid token.
  - `403 Forbidden` (`FORBIDDEN`): Requester is not an administrator.

---

### 26. List Pending Doctor Registrations (`GET /doctors/admin/pending`)
- **Description**: Retrieves all doctor applications currently in `pending` approval status.
- **Auth**: `Authorization: Bearer <accessToken>` (Admin only)
- **Responses**:
  - `200 OK`: List of pending doctors.
  - `403 Forbidden` (`FORBIDDEN`): Requester is not an administrator.

---

### 27. Approve Doctor Registration (`POST /doctors/:id/approve`)
- **Description**: Approves doctor profile, activates linked user account, and writes an audit log entry.
- **Auth**: `Authorization: Bearer <accessToken>` (Admin only)
- **Responses**:
  - `200 OK`: Success message and approved doctor document.
  - `404 Not Found` (`NOT_FOUND`): Doctor not found.

---

### 28. Block Doctor (`POST /doctors/:id/block`)
- **Description**: Blocks doctor profile, sets linked user account status to `blocked`, revokes all active session tokens, and writes an audit log entry.
- **Auth**: `Authorization: Bearer <accessToken>` (Admin only)
- **Responses**:
  - `200 OK`: Success message and blocked doctor document.
  - `404 Not Found` (`NOT_FOUND`): Doctor not found.

---

## Patients Endpoints (`/api/v1/patients`)

### 29. Get Own Patient Record (`GET /patients/me`)
- **Description**: Retrieves the authenticated patient's own CRM patient record.
- **Auth**: `Authorization: Bearer <accessToken>` (Patient only)
- **Responses**:
  - `200 OK`: Patient document.
  - `401 Unauthorized` (`UNAUTHORIZED`): Missing or invalid token.
  - `403 Forbidden` (`FORBIDDEN`): Requester is not a patient.
  - `404 Not Found` (`NOT_FOUND`): Patient record not found.

---

### 30. List Patients (`GET /patients`)
- **Description**: Paginated directory of patient CRM records with text search and status/source filters.
- **Auth**: `Authorization: Bearer <accessToken>` (Staff and Admin only)
- **Query Parameters**:
  - `q`: Search string matching patient name, phone, email, or patient code
  - `status`: Filter by patient status (`active`, `inactive`, `blocked`)
  - `source`: Filter by acquisition source (`walk_in`, `website`, `referral`, `phone`)
  - `assignedStaffId`: Filter by assigned staff member ID
  - `page`: Page number (default: 1)
  - `limit`: Items per page (default: 20, max: 100)
- **Responses**:
  - `200 OK`: Paginated list of patients.
  - `401 Unauthorized` (`UNAUTHORIZED`): Missing or invalid token.
  - `403 Forbidden` (`FORBIDDEN`): Requester is not staff or admin.

---

### 31. Create Patient CRM Record (`POST /patients`)
- **Description**: Registers a patient CRM record without login credentials. Generates a unique `patientCode` in the format `P-<TIMESTAMP>-<RANDOM>` and stores WhatsApp opt-in consent as a boolean with timestamp. Logs an activity and audit log entry.
- **Auth**: `Authorization: Bearer <accessToken>` (Staff and Admin only)
- **Request Body**:
```json
{
  "name": "Ramesh Gupta",
  "phone": "+919820334455",
  "email": "ramesh.gupta@medconsults.example",
  "dob": "1985-04-12",
  "gender": "male",
  "source": "walk_in",
  "status": "active",
  "whatsappOptIn": true
}
```
- **Responses**:
  - `201 Created`: Created patient record.
  - `400 Bad Request` (`VALIDATION_ERROR`): Validation errors.
  - `401 Unauthorized` (`UNAUTHORIZED`): Missing or invalid token.
  - `403 Forbidden` (`FORBIDDEN`): Requester lacks permission.

---

### 32. Get Patient Details (`GET /patients/:id`)
- **Description**: Retrieves patient contact and demographic details. Accessible to staff, admin, and treating doctors with an appointment. If a doctor has no appointment with the patient, returns 404 NOT_FOUND. Never exposes clinical notes or diagnosis.
- **Auth**: `Authorization: Bearer <accessToken>` (Staff, Admin, or treating Doctor)
- **Responses**:
  - `200 OK`: Patient record.
  - `404 Not Found` (`NOT_FOUND`): Patient not found or accessing doctor does not treat this patient.

---

### 33. Get Patient Interaction Timeline (`GET /patients/:id/timeline`)
- **Description**: Returns chronological activities and interaction history for a patient. Never exposes clinical notes or diagnosis.
- **Auth**: `Authorization: Bearer <accessToken>` (Staff, Admin, or treating Doctor)
- **Responses**:
  - `200 OK`: Patient timeline array of activities.
  - `404 Not Found` (`NOT_FOUND`): Patient not found or doctor does not treat this patient.

---

### 34. Update Patient (`PATCH /patients/:id`)
- **Description**: Updates contact and CRM fields of a patient record. Writes activity and audit log entries.
- **Auth**: `Authorization: Bearer <accessToken>` (Staff and Admin only)
- **Request Body**:
```json
{
  "phone": "+919988776611",
  "source": "referral",
  "whatsappOptIn": true
}
```
- **Responses**:
  - `200 OK`: Updated patient record.
  - `400 Bad Request` (`VALIDATION_ERROR`): Validation failure.
  - `404 Not Found` (`NOT_FOUND`): Patient not found.

---

### 35. Soft Delete Patient (`DELETE /patients/:id`)
- **Description**: Soft deletes a patient record (`isDeleted: true`, `deletedAt: Date`). Writes an audit log entry.
- **Auth**: `Authorization: Bearer <accessToken>` (Admin only)
- **Responses**:
  - `200 OK`: Soft deletion confirmation message.
  - `403 Forbidden` (`FORBIDDEN`): Requester is not an administrator.
  - `404 Not Found` (`NOT_FOUND`): Patient not found.

---

## Audit Logs Endpoints (`/api/v1/audit-logs`)

### 36. List System Audit Logs (`GET /audit-logs`)
- **Description**: Administrative security trail inspecting who viewed, modified, approved, or deleted resources.
- **Auth**: `Authorization: Bearer <accessToken>` (Admin only)
- **Query Parameters**:
  - `actor`: Actor user ID or search string
  - `action`: Specific audit action (e.g. `DOCTOR_APPROVED`, `PATIENT_VIEWED`, `USER_BLOCKED`)
  - `entityType`: Target entity model (e.g. `User`, `Doctor`, `Patient`)
  - `from`: ISO start timestamp
  - `to`: ISO end timestamp
  - `page`: Page number (default: 1)
  - `limit`: Items per page (default: 20, max: 100)
- **Responses**:
  - `200 OK`:
    ```json
    {
      "success": true,
      "data": {
        "auditLogs": [
          {
            "_id": "673b22e18d6a36bc6ad5021a",
            "actorId": {
              "_id": "673b22e18d6a36bc6ad50210",
              "name": "Admin User",
              "email": "admin@medconsults.example",
              "role": "admin"
            },
            "role": "admin",
            "action": "DOCTOR_APPROVED",
            "entityType": "Doctor",
            "entityId": "673b22e18d6a36bc6ad50220",
            "meta": {},
            "at": "2026-11-18T12:00:00.000Z"
          }
        ],
        "pagination": {
          "total": 1,
          "page": 1,
          "limit": 20,
          "totalPages": 1
        }
      }
    }
    ```
  - `401 Unauthorized` (`UNAUTHORIZED`): Missing or invalid token.
  - `403 Forbidden` (`FORBIDDEN`): Requester is not an administrator.

---

## Public Enquiries Endpoints (`/api/v1/public/enquiries`)

### 37. Submit Public Website Enquiry (`POST /public/enquiries`)
- **Description**: Public website enquiry submission. Automatically normalizes Indian phone numbers, protects against spam via honeypot field (`websiteUrl`), rate limits to 5 requests per hour per IP, and appends an activity note to existing open leads instead of creating duplicates.
- **Auth**: Public
- **Rate Limit**: 5 requests per hour per IP (`RATE_LIMIT_EXCEEDED`).
- **Request Body**:
```json
{
  "name": "Sunil Deshmukh",
  "phone": "+919820111222",
  "concern": "Need opinion for recurring chest tightness",
  "email": "sunil.d@example.com",
  "preferredSpecialty": "Cardiology",
  "websiteUrl": ""
}
```
- **Responses**:
  - `200 OK`:
    ```json
    {
      "success": true,
      "message": "Thank you for contacting MedConsults. Our care coordination team will reach out shortly."
    }
    ```
  - `400 Bad Request` (`VALIDATION_ERROR`): Name, phone, or concern validation failure.
  - `429 Too Many Requests` (`RATE_LIMIT_EXCEEDED`): IP rate limit exceeded.

---

## Leads Module Endpoints (`/api/v1/leads`)

### 38. List Leads (`GET /leads`)
- **Description**: Paginated listing of sales leads with filters for stage, source, assigned owner, date range, and text search query.
- **Auth**: `Authorization: Bearer <accessToken>` (Staff or Admin)
- **Query Parameters**:
  - `stage`: Lead stage (`new`, `contacted`, `consultation_booked`, `consulted`, `follow_up`, `closed`, `lost`)
  - `source`: Lead source (`website`, `walk_in`, `referral`, `phone`, `campaign`, `other`)
  - `ownerId`: User ID of assigned staff member
  - `q`: Text search query matching lead name, phone, or email
  - `from`: ISO start date
  - `to`: ISO end date
  - `page`: Page number (default: 1)
  - `limit`: Items per page (default: 20, max: 100)
- **Responses**:
  - `200 OK`:
    ```json
    {
      "success": true,
      "data": {
        "leads": [
          {
            "_id": "673b22e18d6a36bc6ad50301",
            "name": "Sunil Deshmukh",
            "phone": "+919820111222",
            "email": "sunil.d@example.com",
            "stage": "new",
            "source": "website",
            "interest": "Cardiology",
            "createdAt": "2026-11-19T10:00:00.000Z"
          }
        ],
        "pagination": {
          "total": 1,
          "page": 1,
          "limit": 20,
          "totalPages": 1
        }
      }
    }
    ```
  - `401 Unauthorized` (`UNAUTHORIZED`): Missing or invalid token.
  - `403 Forbidden` (`FORBIDDEN`): Role other than staff or admin.

---

### 39. Get Leads Kanban Board (`GET /leads/board`)
- **Description**: Grouped pipeline representation of leads across all 7 stages (`new`, `contacted`, `consultation_booked`, `consulted`, `follow_up`, `closed`, `lost`), providing count per stage and the 20 newest cards per column.
- **Auth**: `Authorization: Bearer <accessToken>` (Staff or Admin)
- **Responses**:
  - `200 OK`:
    ```json
    {
      "success": true,
      "data": {
        "stages": {
          "new": { "count": 12, "cards": [ ... ] },
          "contacted": { "count": 8, "cards": [ ... ] },
          "consultation_booked": { "count": 5, "cards": [ ... ] },
          "consulted": { "count": 4, "cards": [ ... ] },
          "follow_up": { "count": 3, "cards": [ ... ] },
          "closed": { "count": 15, "cards": [ ... ] },
          "lost": { "count": 2, "cards": [ ... ] }
        }
      }
    }
    ```

---

### 40. Create Lead (`POST /leads`)
- **Description**: Creates a new CRM lead. Automatically normalizes Indian phone numbers loosely and writes an activity record.
- **Auth**: `Authorization: Bearer <accessToken>` (Staff or Admin)
- **Request Body**:
```json
{
  "name": "Vikas Mehta",
  "phone": "9820334455",
  "email": "vikas.mehta@example.com",
  "source": "website",
  "interest": "Preventive Cardiac Checkup"
}
```
- **Responses**:
  - `201 Created`: Lead entity with normalized phone `+919820334455` and stage `new`.
  - `400 Bad Request` (`VALIDATION_ERROR`): Invalid input format.

---

### 41. Get Lead by ID (`GET /leads/:id`)
- **Description**: Fetches single lead details including owner and linked patient records.
- **Auth**: `Authorization: Bearer <accessToken>` (Staff or Admin)
- **Responses**:
  - `200 OK`: Lead entity.
  - `404 Not Found` (`NOT_FOUND`): Lead not found or soft deleted.

---

### 42. Update Lead (`PATCH /leads/:id`)
- **Description**: Updates lead details (name, phone, email, interest, source, owner). Normalizes phone if updated.
- **Auth**: `Authorization: Bearer <accessToken>` (Staff or Admin)
- **Request Body**:
```json
{
  "interest": "Comprehensive Cardiology + TMT",
  "ownerId": "673b22e18d6a36bc6ad50210"
}
```
- **Responses**:
  - `200 OK`: Updated lead entity.
  - `404 Not Found` (`NOT_FOUND`): Lead not found.

---

### 43. Change Lead Stage (`POST /leads/:id/stage`)
- **Description**: Moves lead between stages on the pipeline board. Any transition between stages is permitted. Moving to `lost` strictly requires `lostReason`. Every stage move creates an `Activity` record with actor, from, and to details.
- **Auth**: `Authorization: Bearer <accessToken>` (Staff or Admin)
- **Request Body**:
```json
{
  "stage": "lost",
  "lostReason": "Selected a hospital closer to home"
}
```
- **Responses**:
  - `200 OK`: Updated lead entity.
  - `400 Bad Request` (`INVALID_REQUEST`): Missing `lostReason` when transitioning to `lost`.
  - `404 Not Found` (`NOT_FOUND`): Lead not found.

---

### 44. Convert Lead to Patient (`POST /leads/:id/convert`)
- **Description**: Converts lead into a Patient CRM record. If a patient with matching phone or email exists, links to that patient; otherwise generates a new Patient with a unique `patientCode`. Links `patientId` on lead, marks lead stage `closed`, and sets `leadId` on activity trail. Returns the patient record. Converting twice returns `409 CONFLICT`.
- **Auth**: `Authorization: Bearer <accessToken>` (Staff or Admin)
- **Responses**:
  - `200 OK`: `{ "success": true, "data": { "patient": { ... } } }`
  - `404 Not Found` (`NOT_FOUND`): Lead not found.
  - `409 Conflict` (`CONFLICT`): Lead has already been converted to a patient.

---

### 45. Soft Delete Lead (`DELETE /leads/:id`)
- **Description**: Soft deletes a lead (`isDeleted: true`).
- **Auth**: `Authorization: Bearer <accessToken>` (Admin only)
- **Responses**:
  - `200 OK`: Soft deletion confirmation.
  - `403 Forbidden` (`FORBIDDEN`): Staff receives 403 Forbidden.
  - `404 Not Found` (`NOT_FOUND`): Lead not found.

---

## Appointments Module Endpoints (`/api/v1/appointments`)

### 46. Book Appointment (`POST /appointments`)
- **Description**: Books an appointment slot. Patients book for themselves; staff and admin book for any patient (`patientId` required). Validates that doctor is approved, start time is a computed free slot, in future within 30 days. Patients with unverified email get `403 EMAIL_NOT_VERIFIED`. Overlapping active appointments return `409 CONFLICT`. Assigns atomic `tokenNumber` from daily doctor counter and short `appointmentCode`. Sends confirmation email and writes activity.
- **Auth**: `Authorization: Bearer <accessToken>` (Patient, Staff, Admin)
- **Rate Limit**: 20 requests per minute per user.
- **Request Body**:
```json
{
  "doctorId": "673b22e18d6a36bc6ad50220",
  "start": "2026-11-20T09:00:00+05:30",
  "reason": "Routine hypertension checkup",
  "patientId": "673b22e18d6a36bc6ad50230"
}
```
- **Responses**:
  - `201 Created`:
    ```json
    {
      "success": true,
      "data": {
        "appointment": {
          "_id": "673b22e18d6a36bc6ad50401",
          "appointmentCode": "APT-7K9M2Q3X",
          "tokenNumber": 4,
          "status": "booked",
          "start": "2026-11-20T03:30:00.000Z",
          "end": "2026-11-20T03:45:00.000Z",
          "queueDate": "2026-11-20",
          "reason": "Routine hypertension checkup",
          "isWalkIn": false
        },
        "tokenNumber": 4,
        "appointmentCode": "APT-7K9M2Q3X"
      }
    }
    ```
  - `400 Bad Request` (`INVALID_REQUEST`): Slot unavailable, past time, or > 30 days.
  - `403 Forbidden` (`EMAIL_NOT_VERIFIED`): Patient email address unverified.
  - `409 Conflict` (`CONFLICT`): Slot concurrently booked or patient has overlapping active appointment.

---

### 47. List Appointments (`GET /appointments`)
- **Description**: Role-scoped listing of appointments with filters (`date`, `from`, `to`, `doctorId`, `patientId`, `status`), sorted by start time ascending. Patients see own, doctors see own, staff and admin see all. Staff listing includes reception fields only. Admin responses omit reason.
- **Auth**: `Authorization: Bearer <accessToken>`
- **Query Parameters**:
  - `date`: Filter by `YYYY-MM-DD` queueDate
  - `from`: ISO start date
  - `to`: ISO end date
  - `doctorId`: Doctor ID filter
  - `patientId`: Patient ID filter
  - `status`: Appointment status filter
  - `page`: Page number (default: 1)
  - `limit`: Items per page (default: 20, max: 100)
- **Responses**:
  - `200 OK`: Array of appointments and pagination metadata.

---

### 48. Appointments Daily Summary (`GET /appointments/summary`)
- **Description**: Returns count per appointment status for the given date (default today in Asia/Kolkata). Scoped to doctor's own appointments when called by a doctor.
- **Auth**: `Authorization: Bearer <accessToken>` (Doctor, Staff, Admin)
- **Query Parameters**:
  - `date`: `YYYY-MM-DD` (optional, defaults to current Kolkata day)
- **Responses**:
  - `200 OK`:
    ```json
    {
      "success": true,
      "data": {
        "date": "2026-11-20",
        "counts": {
          "booked": 10,
          "checked_in": 4,
          "in_consultation": 1,
          "completed": 8,
          "cancelled": 2,
          "no_show": 1,
          "total": 26
        }
      }
    }
    ```

---

### 49. Walk-In Registration (`POST /appointments/walk-in`)
- **Description**: Registers a walk-in patient at clinic reception. Finds existing patient by phone or creates one. Creates an appointment with `isWalkIn: true`, `start: now`, `status: checked_in`, and the next atomic token number. Walk-ins do not consume bookable calendar slots.
- **Auth**: `Authorization: Bearer <accessToken>` (Staff or Admin)
- **Request Body**:
```json
{
  "doctorId": "673b22e18d6a36bc6ad50220",
  "name": "Ramesh Gupta",
  "phone": "+919820334455",
  "gender": "male",
  "reason": "Acute fever and joint pain"
}
```
- **Responses**:
  - `201 Created`: Appointment entity, `tokenNumber`, and `appointmentCode`.

---

### 50. Get Appointment by ID (`GET /appointments/:id`)
- **Description**: Returns full appointment details. Enforces ownership: patient of appointment, doctor of appointment, staff, and admin. Any other requester receives `404 NOT_FOUND`. Privacy rule: `reason` is omitted from admin responses.
- **Auth**: `Authorization: Bearer <accessToken>`
- **Responses**:
  - `200 OK`: Appointment details with `tokenNumber` and `appointmentCode`.
  - `404 Not Found` (`NOT_FOUND`): Nonexistent appointment or unauthorized owner.

---

### 51. Reschedule Appointment (`POST /appointments/:id/reschedule`)
- **Description**: Reschedules an appointment to a new slot. Validates new slot availability. Completed, cancelled, in_consultation, and no_show appointments cannot be rescheduled (400). Patients must reschedule > 2 hours before scheduled start. Issues a new token for the new doctor and day.
- **Auth**: `Authorization: Bearer <accessToken>` (Patient, Staff, Admin)
- **Request Body**:
```json
{
  "start": "2026-11-21T10:00:00+05:30",
  "doctorId": "673b22e18d6a36bc6ad50220"
}
```
- **Responses**:
  - `200 OK`: Rescheduled appointment entity with new token number.
  - `400 Bad Request` (`INVALID_REQUEST`): Within 2-hour window, invalid slot, or terminal status.

---

### 52. Cancel Appointment (`POST /appointments/:id/cancel`)
- **Description**: Cancels an appointment and frees the slot so it can immediately be booked by other patients. Patients must cancel > 2 hours before scheduled start. Staff and admin may cancel until consultation starts.
- **Auth**: `Authorization: Bearer <accessToken>` (Patient, Staff, Admin)
- **Request Body**:
```json
{
  "reason": "Unexpected schedule conflict"
}
```
- **Responses**:
  - `200 OK`: Cancellation confirmation and updated appointment entity.
  - `400 Bad Request` (`INVALID_REQUEST`): Less than 2 hours before start for patients or terminal status.

---

### 53. Check-In Patient (`POST /appointments/:id/check-in`)
- **Description**: Checks in a booked patient at clinic reception. Permitted strictly on the scheduled appointment date (`queueDate === todayKolkata`). Allowed transition: `booked -> checked_in`. Writes activity and audit log.
- **Auth**: `Authorization: Bearer <accessToken>` (Staff or Admin)
- **Responses**:
  - `200 OK`: Updated appointment with status `checked_in`.
  - `400 Bad Request` (`INVALID_REQUEST`): Not scheduled date or illegal state transition.

---

### 54. Start Consultation (`POST /appointments/:id/start`)
- **Description**: Starts consultation for a checked-in patient. Permitted for the appointment's doctor or an admin. Enforces single consultation limit: only one active `in_consultation` appointment per doctor at a time (returns 409 if another consultation is in progress).
- **Auth**: `Authorization: Bearer <accessToken>` (Doctor, Admin)
- **Responses**:
  - `200 OK`: Updated appointment with status `in_consultation`.
  - `400 Bad Request` (`INVALID_REQUEST`): Illegal transition (e.g. from `booked` directly).
  - `409 Conflict` (`CONFLICT`): Doctor already has an active consultation in progress.

---

### 55. Complete Consultation (`POST /appointments/:id/complete`)
- **Description**: Completes the active consultation and sets consultation end timestamp to current time. Allowed transition: `in_consultation -> completed`.
- **Auth**: `Authorization: Bearer <accessToken>` (Treating Doctor only)
- **Responses**:
  - `200 OK`: Updated appointment with status `completed`.
  - `400 Bad Request` (`INVALID_REQUEST`): Appointment status is not `in_consultation`.

---

### 56. Mark No-Show (`POST /appointments/:id/no-show`)
- **Description**: Marks appointment as no-show. Permitted strictly after the scheduled slot start time. Allowed transitions: `booked -> no_show`, `checked_in -> no_show`. Writes activity and audit log.
- **Auth**: `Authorization: Bearer <accessToken>` (Doctor, Staff, Admin)
- **Responses**:
  - `200 OK`: Updated appointment with status `no_show`.
  - `400 Bad Request` (`INVALID_REQUEST`): Before start time or illegal state transition.

---

## Queue Module Endpoints (`/api/v1/queue`)

### 57. Today Live OPD Queue (`GET /queue/today`)
- **Description**: Live OPD queue display for today in Asia/Kolkata timezone. Scoped to doctor's own queue when called by a doctor; staff and admin provide `doctorId` query parameter. Appointments are ordered strictly: `in_consultation` first, then `checked_in` ordered by token number ascending, then `booked` ordered by start time ascending, then finished appointments (`completed`, `cancelled`, `no_show`). Returns status counts, `nowServing` token, `next` token, and `estimatedWaitMinutes` for waiting patients (average consultation time today or doctor slot length multiplied by patients ahead).
- **Auth**: `Authorization: Bearer <accessToken>` (Doctor, Staff, Admin)
- **Query Parameters**:
  - `doctorId`: Doctor ID (required for staff/admin, optional for doctors)
- **Responses**:
  - `200 OK`:
    ```json
    {
      "success": true,
      "data": {
        "doctorId": "673b22e18d6a36bc6ad50220",
        "date": "2026-11-20",
        "counts": {
          "waiting": 3,
          "inConsultation": 1,
          "done": 5,
          "noShow": 1,
          "total": 10
        },
        "nowServing": 5,
        "next": 6,
        "averageConsultationMinutes": 18,
        "queue": [
          {
            "_id": "673b22e18d6a36bc6ad50501",
            "tokenNumber": 5,
            "status": "in_consultation",
            "estimatedWaitMinutes": 0,
            "patient": { "name": "Aarav Sharma", "phone": "+919820112233" }
          },
          {
            "_id": "673b22e18d6a36bc6ad50502",
            "tokenNumber": 6,
            "status": "checked_in",
            "estimatedWaitMinutes": 18,
            "patient": { "name": "Meera Iyer", "phone": "+919820445566" }
          }
        ]
      }
    }
    ```
  - `400 Bad Request` (`VALIDATION_ERROR`): Missing `doctorId` for staff/admin requests.
  - `401 Unauthorized` (`UNAUTHORIZED`): Missing or invalid token.
  - `403 Forbidden` (`FORBIDDEN`): Role other than doctor, staff, or admin.

