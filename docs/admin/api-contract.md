# Admin Control Plane API Contract (v1)

Base URL: `/api/admin/v1`

All requests require either:
- Header: `x-admin-key: <ADMIN_API_KEY>`
- Header: `Authorization: Bearer <ADMIN_API_KEY>`
- An active session belonging to the verified Owner account.

---

## 1. List Products
- **Endpoint**: `GET /products`
- **Description**: Returns all managed software products.
- **Response**:
```json
{
  "success": true,
  "products": [
    {
      "id": "prod_tracker",
      "name": "Tracker OS",
      "slug": "tracker",
      "status": "ACTIVE",
      "environment": "production",
      "integrationMetadata": {
        "version": "2.0.0",
        "capabilities": ["advanced_calendar", "advanced_journal", "unlimited_notes"],
        "provider": "RAZORPAY"
      }
    }
  ]
}
```

---

## 2. List Users
- **Endpoint**: `GET /users?limit=50&offset=0&search=john`
- **Description**: Returns paginated user accounts with current plan and suspension status.
- **Response**:
```json
{
  "success": true,
  "users": [
    {
      "id": "usr_123",
      "username": "john_doe",
      "email": "john@example.com",
      "createdAt": "2026-01-15T10:00:00.000Z",
      "isSuspended": false,
      "plan": "PRO_MONTHLY",
      "isPro": true
    }
  ],
  "total": 1
}
```

---

## 3. Get User Details
- **Endpoint**: `GET /users/:userId`
- **Description**: Returns comprehensive administrative profile: profile, suspension details, active subscription, entitlements, usage statistics, payment history, and audit log.
- **Response**:
```json
{
  "success": true,
  "data": {
    "user": { "id": "usr_123", "username": "john_doe", "email": "john@example.com" },
    "accountStatus": { "isSuspended": false, "suspendedAt": null, "reason": null },
    "subscription": { "id": "sub_1", "plan": "PRO_MONTHLY", "status": "ACTIVE" },
    "entitlements": { "tier": "PRO", "isPro": true, "features": { ... } },
    "usageStats": { "activeActivities": 5, "notesCount": 12, "journalEntriesCount": 42 },
    "billingHistory": [ ... ],
    "auditHistory": [ ... ]
  }
}
```

---

## 4. Cancel Subscription (At Period End)
- **Endpoint**: `POST /users/:userId/cancel-subscription`
- **Description**: Schedules subscription cancellation on the provider gateway at cycle end while retaining Pro benefits until `currentPeriodEnd`.
- **Request Body**:
```json
{
  "reason": "Customer request via support ticket #1024"
}
```
- **Response**:
```json
{
  "success": true,
  "message": "Subscription scheduled for cancellation at period end.",
  "effectiveDate": "2026-10-15T10:00:00.000Z"
}
```

---

## 5. Cancel Subscription Immediately (Revoke Access)
- **Endpoint**: `POST /users/:userId/cancel-immediately`
- **Description**: Terminates subscription immediately on payment provider, sets status to `CANCELLED`, truncates current period end to now, and reverts user to `FREE`.
- **Request Body**:
```json
{
  "reason": "Suspected payment fraud / immediate test reset"
}
```
- **Response**:
```json
{
  "success": true,
  "message": "Subscription terminated immediately and Pro access revoked.",
  "isPro": false,
  "subscriptionId": "sub_1",
  "status": "CANCELLED"
}
```

---

## 6. Suspend User
- **Endpoint**: `POST /users/:userId/suspend`
- **Description**: Flags account as suspended, blocking authenticated application mutations.
- **Request Body**:
```json
{
  "reason": "Terms of service violation"
}
```
- **Response**:
```json
{
  "success": true,
  "message": "User usr_123 has been suspended.",
  "isSuspended": true
}
```

---

## 7. Restore User
- **Endpoint**: `POST /users/:userId/restore`
- **Description**: Clears account suspension flag, restoring normal access.
- **Request Body**:
```json
{
  "reason": "Appeal accepted"
}
```
- **Response**:
```json
{
  "success": true,
  "message": "User usr_123 has been restored.",
  "isSuspended": false
}
```

---

## 8. Query Audit Logs
- **Endpoint**: `GET /audit?limit=50&userId=usr_123`
- **Description**: Fetches audit events across all users or filtered by user.
- **Response**:
```json
{
  "success": true,
  "logs": [
    {
      "id": "aud_1",
      "userId": "usr_123",
      "action": "ADMIN_SUBSCRIPTION_CANCELLED_IMMEDIATELY",
      "performedBy": "admin_api_key",
      "reason": "Administrative test reset",
      "createdAt": "2026-09-24T23:50:00.000Z"
    }
  ]
}
```
