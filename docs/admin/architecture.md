# Administrative Control Plane Architecture

## 1. System Vision & Boundary

The Tracker Administrative Control Plane is designed as a **separate, product-agnostic administrative system**.

```
┌────────────────────────────────────────────────────────┐
│               Admin Control Plane UI                   │
│        (Standalone Admin Web App / Dashboard)          │
└───────────────────────────┬────────────────────────────┘
                            │ REST / Admin v1 API
                            ▼
┌────────────────────────────────────────────────────────┐
│                      Tracker OS                        │
│                                                        │
│  ┌───────────────────┐        ┌─────────────────────┐  │
│  │  /api/admin/v1/   │ ◄────► │    AdminService     │  │
│  └─────────┬─────────┘        └──────────┬──────────┘  │
│            │                             │             │
│            ▼                             ▼             │
│  ┌───────────────────┐        ┌─────────────────────┐  │
│  │   Auth / Policy   │        │   Billing / Audit   │  │
│  └───────────────────┘        └─────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

### Strict Non-Negotiable Boundaries:
- **No Admin Tab in Tracker UI**: The Tracker user interface (sidebar, settings, navigation) contains zero admin tabs or developer control toggles.
- **No Shared Client Bundles**: Normal users never load admin UI components or privileged operational tools.
- **Product Agnostic**: Admin contracts model products generically (`AdminProduct`). Tracker OS is currently integrated as Product #1 (`prod_tracker`). Future applications can register alongside Tracker without altering control plane schemas.

---

## 2. Authentication & Authorization Chain

Every administrative request passes through a multi-tier defense:

```
Incoming Request
    │
    ▼
Header Inspection (x-admin-key / Authorization Bearer)
    │
    ├─► Valid ADMIN_API_KEY? ──► Authorized (Actor: "admin_api_key")
    │
    └─► Invalid Key? ──► Session Inspection
                             │
                             ├─► Authenticated Owner User? ──► Authorized (Actor: "owner:<username>")
                             │
                             └─► Unauthorized (401 / 403 Response)
```

Administrative endpoints refuse to execute if:
- API key is absent or mismatching and no Owner session exists.
- Normal/Free/Pro non-owner users attempt access.
- Target user cannot be resolved in the database.

---

## 3. Subscription Operations

The control plane explicitly distinguishes between two cancellation modes:

| Operation | Provider Gateway | Tracker Local State | Entitlement Effect | Use Case |
| :--- | :--- | :--- | :--- | :--- |
| **Cancel Subscription** | `cancelAtPeriodEnd: true` | `cancelAtPeriodEnd = true`, `canceledAt = now` | Pro retained until period end (`currentPeriodEnd`) | User-requested cancellation via support |
| **Cancel Immediately** | `cancelAtPeriodEnd: false` | `status = 'CANCELLED'`, `currentPeriodEnd = now` | Immediate downgrade to `FREE` | Fraud, chargebacks, policy violations, manual testing |

---

## 4. Account Lifecycle & Suspension

Account suspension is handled through an authoritative account status record in `UserSetting` (`module: 'ACCOUNT_STATUS'`).
- **Suspension**: When suspended, the user record is flagged with timestamp and administrative reason.
- **Restoration**: Admins can restore suspended users at any time.
- **Auditing**: Every suspension and restoration emits an immutable `AuditLog` entry.

---

## 5. Audit Logging Standard

Every sensitive administrative action is persisted to `AuditLog`:
- **Actor**: Specific administrative identity (`admin_api_key` or `owner:<username>`).
- **Target**: User ID or entity ID.
- **Action**: Canonical event string (e.g. `ADMIN_USER_SUSPENDED`, `ADMIN_SUBSCRIPTION_CANCELLED_IMMEDIATELY`).
- **Data Protection**: Secrets (passwords, payment keys, tokens) are never included in audit payloads.
