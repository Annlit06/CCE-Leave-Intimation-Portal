# CCE Leave Intimation Portal — Backend API Contract

**Institution**: Christ College of Engineering (Autonomous), Irinjalakuda  
**Base URL**: `http://localhost:3000`  
**Data Format**: JSON (`Content-Type: application/json`)  
**Status**: Development Only (Not Production-Ready)

---

## 1. Overview & Frontend Integration Guide

This document defines the REST API contract implemented in `server.js` for the CCE Leave Intimation Portal backend.

### Key Integration Principles
- **No Frontend Redesign Needed**: The backend directly returns the field names expected by your frontend (`from`, `to`, `by`, and `log` as an array).
- **CORS Enabled**: The backend includes Cross-Origin Resource Sharing (`cors`) headers, allowing your separate frontend to call the API directly from any local port or `file://` context without browser blocking.
- **Base URL Configuration**: Configure your frontend's API calls to target:
  ```javascript
  const API_BASE_URL = 'http://localhost:3000';
  ```

---

## 2. Field Mapping (Database to Frontend)

The backend SQLite database (`leave_management.db`) stores normalized columns, but automatically maps them to frontend-compatible field names in all API responses:

| Database Column | Response Field | Data Type | Notes |
| :--- | :--- | :--- | :--- |
| `id` | `id` | `String` | Unique leave record ID (e.g., `L1793166392728_278`) |
| `sid` | `sid` | `String` | Student ID (e.g., `u1`, `u2`, `u3`) |
| `from_date` | `from` | `String` | Start date in `YYYY-MM-DD` format |
| `to_date` | `to` | `String` | End date in `YYYY-MM-DD` format |
| `type` | `type` | `String` | Leave category (e.g., `Personal`, `Medical`, `Duty`) |
| `reason` | `reason` | `String` | Explanation provided by student |
| `proof` | `proof` | `String` | Attachment filename/URL (empty string if none) |
| `status` | `status` | `String` | Current status (`Pending`, `Approved`, `Rejected`, `Cancelled`) |
| `remark` | `remark` | `String` | Mentor/HOD remark (empty string initially) |
| `by_user` | `by` | `String` | User ID or name of last decision maker |
| `locked` | `locked` | `Boolean` | `true` if finalized/immutable; `false` otherwise |
| `created` | `created` | `String` | ISO 8601 creation timestamp |
| `log` | `log` | `Array<Object>` | JSON-parsed audit trail array |

---

## 3. Demo User Accounts

The backend pre-seeds six development accounts in the `users` table without inventing unverified class, batch, or mentor assignments:

| Role | Name | Email | Password | ID |
| :--- | :--- | :--- | :--- | :--- |
| Student | Nikhil Menon | `nikhil@cce.edu` | `cce123` | `u1` |
| Student | Sneha Thomas | `sneha@cce.edu` | `cce123` | `u2` |
| Student | Arjun Das | `arjun@cce.edu` | `cce123` | `u3` |
| Mentor | Dr. Meera Nair | `meera@cce.edu` | `cce123` | `m1` |
| Mentor | Prof. Joseph Paul | `joseph@cce.edu` | `cce123` | `m2` |
| HOD | Dr. Suresh Kumar | `hod@cce.edu` | `cce123` | `h1` |

---

## 4. Endpoints

### 4.1 System Health
`GET /api/health`

Verifies that the backend server is running.

- **Response `200 OK`**:
  ```json
  {
    "status": "ok",
    "service": "CCE Leave Intimation Portal API",
    "environment": "development",
    "timestamp": "2026-10-28T05:46:11.477Z"
  }
  ```

---

### 4.2 Get Demo Users
`GET /api/users`

Retrieves registered users for frontend authentication or role simulation.

- **Response `200 OK`**:
  ```json
  [
    { "id": "u1", "name": "Nikhil Menon", "email": "nikhil@cce.edu", "role": "Student" },
    { "id": "u2", "name": "Sneha Thomas", "email": "sneha@cce.edu", "role": "Student" },
    { "id": "u3", "name": "Arjun Das", "email": "arjun@cce.edu", "role": "Student" },
    { "id": "m1", "name": "Dr. Meera Nair", "email": "meera@cce.edu", "role": "Mentor" },
    { "id": "m2", "name": "Prof. Joseph Paul", "email": "joseph@cce.edu", "role": "Mentor" },
    { "id": "h1", "name": "Dr. Suresh Kumar", "email": "hod@cce.edu", "role": "HOD" }
  ]
  ```

---

### 4.3 Get Leaves
`GET /api/leaves`

Returns all leave records sorted by creation timestamp descending.

- **Optional Query Parameter**:
  - `sid` (`String`): Filter records by student ID (e.g., `GET /api/leaves?sid=u1`).

- **Response `200 OK`**:
  ```json
  [
    {
      "id": "L1793166392728_278",
      "sid": "u1",
      "from": "2026-11-10",
      "to": "2026-11-12",
      "type": "Personal",
      "reason": "Family function",
      "proof": "",
      "status": "Pending",
      "remark": "",
      "by": "",
      "locked": false,
      "created": "2026-10-28T05:46:32.728Z",
      "log": [
        {
          "action": "Applied",
          "status": "Pending",
          "by": "u1",
          "timestamp": "2026-10-28T05:46:32.728Z",
          "remark": "Leave request submitted"
        }
      ]
    }
  ]
  ```

- **Error Responses**:
  - `500 Internal Server Error`: `{ "error": "Failed to retrieve leave records from database" }`

---

### 4.4 Submit Leave Request
`POST /api/leaves`

Submits a new leave request. Generates record ID on the server, initializes status as `Pending`, `locked: false`, and sets the initial activity log.

- **Request Body**:
  ```json
  {
    "sid": "u1",
    "from": "2026-11-10",
    "to": "2026-11-12",
    "type": "Personal",
    "reason": "Family function",
    "proof": ""
  }
  ```

- **Validation Rules**:
  - `sid`: Must be non-empty and match an existing student in `users` (`role === 'Student'`).
  - `from`: Must be a valid date in `YYYY-MM-DD` format.
  - `to`: Must be a valid date in `YYYY-MM-DD` format.
  - Date order: `from` must be less than or equal to `to`.
  - `type`: Must be a non-empty string.
  - `reason`: Must be a non-empty string.
  - `proof`: Optional string (defaults to `""`).

- **Response `201 Created`**: Returns the complete created record in frontend format.

- **Error Responses**:
  - `400 Bad Request`:
    - `{ "error": "Student ID (sid) is required and must be a valid string" }`
    - `{ "error": "Invalid student ID: \"u99\". Must belong to a registered student." }`
    - `{ "error": "Valid start date (from) in YYYY-MM-DD format is required" }`
    - `{ "error": "Valid end date (to) in YYYY-MM-DD format is required" }`
    - `{ "error": "Start date (from) cannot be later than end date (to)" }`
    - `{ "error": "Leave type is required" }`
    - `{ "error": "Reason for leave is required" }`
  - `500 Internal Server Error`: `{ "error": "Internal server error while creating leave request" }`

---

### 4.5 Update Leave Status (Approve / Reject / Cancel)
`PATCH /api/leaves/:id`

Updates the status of an existing leave request, validates lifecycle transitions, appends an entry to the activity log, and returns the complete updated record.

- **URL Parameter**:
  - `id`: The unique ID of the leave record (e.g., `L1793166392728_278`).

- **Request Body**:
  ```json
  {
    "status": "Approved",
    "remark": "Approved for genuine reason",
    "by": "m1"
  }
  ```

- **Status Transition Matrix (Code Verified from `server.js`)**:
  | Current Status | Target Status | Allowed? | Resulting `locked` | Behavior / Code Rationale |
  | :--- | :--- | :--- | :--- | :--- |
  | `Pending` | `Approved` | **Yes** | `false` | Mentor/HOD approves the pending request. Leaves request open for potential eligible cancellation. |
  | `Pending` | `Rejected` | **Yes** | `true` | Mentor/HOD rejects the request. Terminal state; record is locked against future modifications. |
  | `Pending` | `Cancelled` | **Yes** | `true` | Student cancels their pending application. Terminal state; record is locked. |
  | `Approved` | `Cancelled` | **Yes** | `true` | Eligible cancellation: Once approved, cancellation is the **only** permitted transition. Sets `locked: true`. |
  | `Approved` | `Approved` | **No** | - | Rejected (400): `Leave request is already Approved and cannot be changed to Approved`. |
  | `Approved` | `Rejected` | **No** | - | Rejected (400): `Leave request is already Approved and cannot be changed to Rejected`. |
  | `Rejected` | Any | **No** | - | Rejected (400): Terminal state. Record has `locked = 1` and cannot be modified. |
  | `Cancelled` | Any | **No** | - | Rejected (400): Terminal state. Record has `locked = 1` and cannot be modified. |

> [!NOTE]
> **Clarification on Earlier Summary Phrasing**:
> The Stage 2 summary phrase *"only permits cancellation on approved requests"* described line 345 of `server.js`: once a leave is in the `Approved` state, cancellation is the **only** permitted action (an approved leave cannot be flipped to `Rejected`). Cancellation is also fully permitted while a request is `Pending` (`Pending` $\rightarrow$ `Cancelled`).

- **Response `200 OK`**: Returns the complete updated leave record with the newly appended `log` entry.

- **Error Responses**:
  - `400 Bad Request`:
    - `{ "error": "Target status is required" }`
    - `{ "error": "Invalid status \"...\". Allowed statuses: Approved, Rejected, Cancelled" }`
    - `{ "error": "Leave request \"...\" is locked and cannot be modified" }`
    - `{ "error": "Leave request \"...\" is already Rejected and cannot transition to ..." }`
    - `{ "error": "Leave request \"...\" is already Cancelled and cannot transition to ..." }`
    - `{ "error": "Leave request \"...\" is already Approved and cannot be changed to ..." }`
  - `404 Not Found`: `{ "error": "Leave request with ID \"...\" not found" }`
  - `500 Internal Server Error`: `{ "error": "Internal server error while updating leave request" }`

---

### 4.6 Development Migration Endpoint
`POST /api/leaves/migrate-demo`

**Strictly for development initial data import**. Accepts an array of original sample records from the separate frontend, preserves original values, and uses `INSERT OR IGNORE` to prevent duplicate primary key conflicts.

> [!WARNING]
> This endpoint returns header `X-Environment-Warning: Development-only endpoint. Must be disabled before production.` It must be removed or disabled before production deployment.

- **Request Body**:
  ```json
  {
    "leaves": [
      {
        "id": "L1",
        "sid": "u1",
        "from": "2026-10-01",
        "to": "2026-10-03",
        "type": "Personal",
        "reason": "Sample record",
        "proof": "",
        "status": "Approved",
        "remark": "Approved by mentor",
        "by": "m1",
        "locked": false,
        "created": "2026-09-30T10:00:00.000Z",
        "log": []
      }
    ]
  }
  ```

- **Empty Payload Behavior**:
  If `{ "leaves": [] }` is submitted, it returns:
  ```json
  {
    "message": "Migration received 0 records. No sample data has been migrated.",
    "totalReceived": 0,
    "inserted": 0,
    "ignored": 0,
    "sampleMigrated": false
  }
  ```

- **Successful Migration Response `200 OK`**:
  ```json
  {
    "message": "Migration processed: 4 inserted, 0 ignored (duplicates/unmodified).",
    "totalReceived": 4,
    "inserted": 4,
    "ignored": 0,
    "sampleMigrated": true
  }
  ```

---

## 5. Activity Log Schema

The `log` field is an array of sequential audit entries:
```json
[
  {
    "action": "Applied",
    "status": "Pending",
    "by": "u1",
    "timestamp": "2026-10-28T05:46:32.728Z",
    "remark": "Leave request submitted"
  },
  {
    "action": "Approved",
    "status": "Approved",
    "by": "m1",
    "timestamp": "2026-10-28T05:54:44.494Z",
    "remark": "Approved for genuine reason"
  }
]
```

---

## 6. Security & Production Checklist (Not Production Ready)

The current backend is strictly configured for local testing. The following must be resolved before production:

1. **Password Encryption**: Passwords in `users` table are currently in plaintext for development convenience. Must be hashed using `bcrypt` or `argon2`.
2. **Session / JWT Authentication**: Identity is currently passed in the request body (`by` field). Production must issue signed HTTP-only cookies or Bearer tokens upon login.
3. **Role-Based Authorization (RBAC)**: The backend does not yet enforce server-side role checks on `PATCH` (e.g., verifying that the calling user actually holds the `Mentor` or `HOD` role, or that student owns the record being cancelled).
4. **Rate Limiting**: `express-rate-limit` must be enabled to mitigate brute-force attempts.
5. **Route Protection**: `POST /api/leaves/migrate-demo` must be conditionally blocked when `NODE_ENV === 'production'`.
