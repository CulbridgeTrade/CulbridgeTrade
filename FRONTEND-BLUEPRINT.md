# Culbridge MVP Front-End Blueprint

> **Version:** 1.0  
> **Generated:** 2026-03-28  
> **Author:** Culbridge Team  
> **Status:** Production Ready for Implementation

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Backend Module Mapping](#backend-module-mapping)
3. [Exporter-Facing UI](#exporter-facing-ui)
4. [Internal Admin / Compliance UI](#internal-admin--compliance-ui)
5. [Wireframes](#wireframes)
6. [Flow Diagrams](#flow-diagrams)
7. [Edge Cases Handling](#edge-cases-handling)
8. [UX Guidelines](#ux-guidelines)
9. [Integration Hooks](#integration-hooks)
10. [Component Reference](#component-reference)

---

## 1. Executive Summary

### System Overview
Culbridge MVP is a headless results API + backend module system for export compliance. The system handles:
- **HS Code Validation** - Deterministic commodity classification
- **Document Vault** - Multi-part upload, validation, storage
- **Entity Sync** - Exporter/agent validation
- **Compliance Engine** - EUDR, RASFF, lab test enforcement
- **Fee Calculator** - Export fees computation
- **Clean Declaration Builder** - NSW payload generation
- **Digital Signature** - Immutable audit trail
- **NSW ESB Submission** - Nigerian customs integration
- **Webhook Listener** - Port event tracking

### User Personas

| Persona | Role | Access Level |
|---------|------|---------------|
| **Exporter** | External user submitting shipments | Read own shipments, submit new |
| **Compliance Officer** | Internal reviewer | Full shipment access, manual overrides |
| **Admin** | System administrator | Full access, metrics, configuration |
| **Founder (David)** | CEO oversight | Full internal visibility, audit replay |

---

## 2. Backend Module Mapping

Each backend module maps to specific frontend components and API endpoints.

### Module-to-Component Mapping

| Backend Module | Frontend Component | API Endpoint | Data Output |
|----------------|-------------------|--------------|-------------|
| `hs_code_validator` | [`HSCodeInput`](#hscodeinput) | `POST /shipments/:id/evaluate` | `{ topMatch, confidence, alternatives }` |
| `document_vault` | [`DocumentUploader`](#documentuploader) | `POST /documents/upload` | `{ document_id, storage_path, hash }` |
| `entity_sync` | [`EntitySelector`](#entityselector) | `GET /entities/:type` | `{ entity_id, name, status, tier }` |
| `compliance_engine` | [`ComplianceStatusPanel`](#compliancestatuspanel) | `GET /shipments/:id/compliance` | `{ eudr_compliant, rasff_flags, lab_results }` |
| `fee_calculator` | [`FeeBreakdownDisplay`](#feebreakdowndisplay) | `GET /shipments/:id/fees` | `{ total, breakdown[], processing_days }` |
| `clean_declaration_builder` | [`DeclarationPreview`](#declarationpreview) | `GET /shipments/:id/declaration` | `{ nsw_payload, ready_for_submission }` |
| `digital_signature` | [`SignatureStatus`](#signaturestatus) | `GET /shipments/:id/signature` | `{ signature_type, signer_identity, signing_time }` |
| `nsw_esb_submission` | [`SubmissionStatusTracker`](#submissionstatustracker) | `POST /nsw/submit` | `{ sgd_number, submission_status }` |
| `audit_logger` | [`AuditLogViewer`](#auditlogviewer) | `GET /shipments/:id/audit` | `[{ event, timestamp, actor, details }]` |

---

## 3. Exporter-Facing UI

### 3.1 Shipment Submission Flow

#### Input Forms

##### [`HSCodeInput`](frontend/components/hs-code-input.tsx)
```
Component: HSCodeInput
Purpose: HS Code entry with auto-suggestions

Inputs:
  - productDescription: string (min 10 chars)
  - hsCode: string (6-10 digits, validated against HS database)
  - commodityType: enum ['cocoa', 'sesame', 'cashew', 'ginger', 'groundnuts', 'seeds']

Validation Rules (Frontend):
  - HS Code must be 6-10 digits
  - Product description minimum 10 characters
  - Commodity type required
  - Real-time validation feedback

Validation Rules (Backend - deterministic):
  - HS Code must exist in reference database
  - Commodity type must match HS Code category
  - Confidence threshold > 0.7 for auto-suggestions

Outputs:
  - validatedHSCode: { code: string, confidence: number, alternatives: string[] }
  - isValid: boolean
  - errors: string[]

Auto-Suggestions:
  - Trigger after 3+ characters typed
  - Show top 5 matches with confidence scores
  - Allow manual override with warning
```

##### [`DocumentUploader`](frontend/components/document-uploader.tsx)
```
Component: DocumentUploader
Purpose: Multi-part file upload with type validation

Inputs:
  - files: File[] (max 20MB each)
  - documentTypes: enum ['COO', 'phytosanitary', 'health_cert', 'lab_report', 'packing_list', 'invoice']
  - shipmentId: string

Validation Rules:
  - Max file size: 20MB per file
  - Allowed types: PDF, JPG, PNG, DOCX
  - Required documents based on commodity + destination
  - Multi-part upload for files > 5MB

Outputs:
  - uploadedDocuments: [{ document_id, file_name, type, hash, uploaded_at }]
  - uploadProgress: number (0-100)
  - errors: string[]

UI States:
  - Idle: Drop zone visible
  - Uploading: Progress bar + file list
  - Success: Green checkmark + document preview
  - Error: Red indicator + retry button
```

##### [`EntitySelector`](frontend/components/entity-selector.tsx)
```
Component: EntitySelector
Purpose: Select exporter/agent with validation status

Inputs:
  - entityType: enum ['exporter', 'agent', 'lab']
  - searchQuery: string

Validation Rules:
  - Entity must be active (status = 'verified')
  - AEO status displayed but not blocking
  - Tier level shown for trust indication

Outputs:
  - selectedEntity: { entity_id, name, status, tier, aeo_status }
  - isValid: boolean
```

##### [`FeeSummaryCard`](frontend/components/fee-summary-card.tsx)
```
Component: FeeSummaryCard
Purpose: Display computed export fees before submission

Inputs:
  - shipmentId: string
  - certificates: string[] (required certs)

Outputs:
  - totalFee: number (in Naira)
  - breakdown: [{ certificate_id, agency_name, fee_naira, processing_days }]
  - estimatedProcessingDays: [min, max]
  - criticalPathDays: number

UI Requirements:
  - Show agency-by-agency breakdown
  - Display fast-track option toggle
  - Warning if processing time exceeds shipment deadline
```

#### Submission Confirmation

##### [`SubmissionSummaryPanel`](frontend/components/submission-summary-panel.tsx)
```
Component: SubmissionSummaryPanel
Purpose: Pre-submission review with warnings/errors

Inputs:
  - shipmentData: FullShipmentObject

Validation Checklist:
  [ ] HS Code validated
  [ ] All required documents uploaded
  [ ] Entity verified
  [ ] Fees calculated
  [ ] Compliance checks passed

Warnings (non-blocking):
  - Missing optional documents
  - Low confidence HS code match
  - Entity has previous compliance flags

Errors (blocking):
  - Missing required documents
  - HS code validation failed
  - Entity not verified
  - Fee calculation failed

Outputs:
  - readyToSubmit: boolean
  - warnings: WarningObject[]
  - errors: ErrorObject[]
  - submissionToken: string (for idempotency)
```

### 3.2 Status Dashboard

#### [`ShipmentTable`](frontend/components/shipment-table.tsx)
```
Component: ShipmentTable
Purpose: Main dashboard listing all shipments

Columns:
  | Column | Width | Sortable | Filterable |
  |--------|-------|----------|------------|
  | Shipment ID | 120px | Yes | Search |
  | Product | 150px | Yes | Dropdown |
  | Status | 100px | Yes | Multi-select |
  | HS Code | 100px | Yes | Search |
  | Destination | 120px | Yes | Dropdown |
  | Compliance Flags | 80px | No | Yes |
  | Last Review | 140px | Yes | Date range |
  | Timestamp | 140px | Yes | Date range |
  | Actions | 80px | No | No |

Status Values:
  - DRAFT: Grey (#6B7280)
  - PENDING_VALIDATION: Yellow (#F59E0B)
  - VALIDATING: Blue (#3B82F6)
  - READY_TO_SUBMIT: Cyan (#06B6D4)
  - SUBMITTED: Indigo (#6366F1)
  - UNDER_REVIEW: Purple (#8B5CF6)
  - APPROVED: Green (#10B981)
  - REJECTED: Red (#EF4444)
  - SIGNED: Emerald (#059669)

Compliance Flag Colors:
  - BLOCKER: Red (#DC2626)
  - WARNING: Amber (#D97706)
  - INFO: Blue (#2563EB)
  - PASS: Green (#16A34A)
```

#### [`ShipmentDetailView`](frontend/components/shipment-detail-view.tsx)
```
Component: ShipmentDetailView
Purpose: Detailed view of single shipment with module outputs

Tabs:
  1. Overview - Basic info + status
  2. Documents - Uploaded files list
  3. Compliance - Module-by-module results
  4. Fees - Fee breakdown
  5. Audit - Event log timeline
  6. Signature - Digital signature info (if signed)

Module Output Panels:
  - HS Code Validator: code, confidence, alternatives
  - Document Vault: document list with validation status
  - Entity Sync: exporter details, AEO status, tier
  - Compliance Engine: EUDR status, RASFF flags, lab results
  - Fee Calculator: total, breakdown, processing timeline
  - Clean Declaration: NSW payload preview
  - Digital Signature: signature details (if available)
```

### 3.3 Notifications

##### [`NotificationPreferences`](frontend/components/notification-preferences.tsx)
```
Component: NotificationPreferences
Purpose: Configure alert delivery

Notification Types:
  - Shipment Accepted
  - Shipment Rejected
  - Document Requested
  - Fee Updated
  - Compliance Alert
  - System Announcement

Delivery Channels:
  - Email (SMTP)
  - Push (Web Push API)
  - Slack (Webhook)

Configuration:
  - Per-event toggle
  - Quiet hours setting
  - Digest frequency: instant / daily / weekly
```

---

## 4. Internal Admin / Compliance UI

### 4.1 Shipment Oversight Dashboard

#### [`AdminShipmentDashboard`](frontend/components/admin-shipment-dashboard.tsx)
```
Component: AdminShipmentDashboard
Purpose: Real-time overview of all shipments

Layout:
  - Header: Stats cards row
  - Sidebar: Filters panel
  - Main: Shipment table with real-time updates
  - Footer: Activity feed

Stats Cards:
  [Total Shipments Today] - with trend arrow
  [Pending Review] - count + average wait time
  [Approved] - count + rate
  [Rejected] - count + top reasons
  [Queue Depth] - background jobs

Real-Time Updates:
  - WebSocket connection for live status changes
  - Toast notifications for new shipments
  - Auto-refresh every 30 seconds (fallback)
```

### 4.2 Audit & Event Viewer

#### [`AuditLogViewer`](frontend/components/audit-log-viewer.tsx)
```
Component: AuditLogViewer
Purpose: Immutable event log display per shipment

Event Fields:
  - event_id: UUID
  - event_type: string
  - module: string
  - timestamp: ISO 8601
  - actor: { id, name, role }
  - details: JSON
  - previous_state: JSON
  - new_state: JSON
  - hash: SHA-256

Features:
  - Chronological timeline view
  - Filter by module
  - Filter by actor
  - Filter by date range
  - Search in event details
  - Export to CSV/PDF

Replay Simulation:
  - Step-by-step playback button
  - Auto-play with configurable speed
  - State diff highlighting
```

### 4.3 Module Control Panels

#### [`ComplianceEngineControl`](frontend/components/compliance-engine-control.tsx)
```
Component: ComplianceEngineControl
Purpose: Manual override controls for compliance engine

Features:
  - View active rules per commodity
  - Toggle rules on/off
  - Add custom rule (admin only)
  - Override specific shipment result
  - View rule evaluation logs

Override Audit:
  - All overrides logged with reason
  - Actor attribution (David | CEO & Founder | Culbridge)
  - Override expires after 30 days
```

#### [`FeeCalculatorControl`](frontend/components/fee-calculator-control.tsx)
```
Component: FeeCalculatorControl
Purpose: Adjust rates for simulation/testing

Features:
  - View current fee schedules
  - Adjust base fees (sandbox mode)
  - Add new certificate types
  - Configure agency rates
  - Test fee calculations

Sandbox Mode:
  - Clear "SANDBOX" badge
  - All fees marked as estimated
  - No real submissions to agencies
```

#### [`SignatureVerificationPanel`](frontend/components/signature-verification-panel.tsx)
```
Component: SignatureVerificationPanel
Purpose: Verify signatures without exposing keys

Features:
  - View signature metadata
  - Verify payload hash match
  - Check certificate validity
  - View signer identity (no keys exposed)
  - Export verification report
```

### 4.4 Metrics & System Health

#### [`SystemMetricsDashboard`](frontend/components/system-metrics-dashboard.tsx)
```
Component: SystemMetricsDashboard
Purpose: System observability and health monitoring

Metrics:
  Queue Depth: Pending jobs count
  Worker Load: Active workers / total
  API Success Rate: % successful calls
  External API Health: NSW, Remita, NIMC status
  Response Times: p50, p95, p99 latencies
  Error Rate: Errors per minute

Visualizations:
  - Time series charts (last 24h, 7d, 30d)
  - Status code distribution pie chart
  - API endpoint heatmap
  - Exporter activity heatmap

Alerts:
  - Queue depth > 1000
  - Worker load > 80%
  - API success rate < 95%
  - Error rate spike > 10/min
```

---

## 5. Wireframes

### 5.1 Exporter Submission Portal

```
┌─────────────────────────────────────────────────────────────────────────┐
│ CULBRIDGE                                [Logo]     [Exporter: AcmeCo] │
│                                              [Notifications] [Profile] │
├─────────────────────────────────────────────────────────────────────────┤
│ ┌─────────────┐                                                       │ │
│ │ Dashboard   │  NEW SHIPMENT                                         │ │
│ │ ──────────  │  ═══════════════                                      │ │
│ │ + New       │                                                       │ │
│ │   Shipment  │  ┌─────────────────────────────────────────────────┐ │ │
│ │             │  │ STEP 1: Commodity Details                        │ │ │
│ │ Shipments   │  │ ───────────────────────────────────────────────│ │ │
│ │ ──────────  │  │                                                 │ │ │
│ │ • CB-001    │  │ Product Description *                            │ │ │
│ │ • CB-002    │  │ [Enter description of your export...]            │ │ │
│ │ • CB-003    │  │                                                 │ │ │
│ │ • CB-004    │  │ Commodity Type *                                 │ │ │
│ │   (+12)     │  │ [Cocoa beans      ▼]                             │ │ │
│ │             │  │                                                 │ │ │
│ │ Settings    │  │ HS Code *                                        │ │ │
│ │ ──────────  │  │ [1801    ] [🔍 Validate]                         │ │ │
│ │ • Profile   │  │ ┌─ Suggested: 1801.00.10 (Cocoa beans) ─────┐   │ │ │
│ │ • Notifs    │  │ │ Confidence: 95%  [Select] [View All]      │   │ │ │
│ │ • API Keys  │  │ └────────────────────────────────────────────┘   │ │ │
│ │             │  │                                                 │ │ │
│ │             │  └─────────────────────────────────────────────────┘ │ │
│ │             │                                                       │ │
│ │             │  ┌─────────────────────────────────────────────────┐ │ │
│ │             │  │ STEP 2: Documents                               │ │ │
│ │             │  │ ───────────────────────────────────────────────│ │ │
│ │             │  │                                                 │ │ │
│ │             │  │ Required: COO, Phytosanitary, Lab Report       │ │ │
│ │             │  │ ┌───────────────────────────────────────────┐   │ │ │
│ │             │  │ │ 📄 Drop files here or click to upload     │   │ │ │
│ │             │  │ │      (PDF, JPG, PNG, DOCX - max 20MB)      │   │ │ │
│ │             │  │ └───────────────────────────────────────────┘   │ │ │
│ │             │  │                                                 │ │ │
│ │             │  │ Uploaded:                                        │ │ │
│ │             │  │ ✅ Certificate of Origin - COO-2024-001.pdf      │ │ │
│ │             │  │ ✅ Phytosanitary Cert - PHY-2024-001.pdf        │ │ │
│ │             │  │ ⚠️ Lab Report - Pending lab submission         │ │ │
│ │             │  │                                                 │ │ │
│ │             │  └─────────────────────────────────────────────────┘ │ │
│ │             │                                                       │ │
│ │             │  ┌─────────────────────────────────────────────────┐ │ │
│ │             │  │ STEP 3: Exporter & Agent                         │ │ │
│ │             │  │ ───────────────────────────────────────────────│ │ │
│ │             │  │                                                 │ │ │
│ │             │  │ Exporter *                                      │ │ │
│ │             │  │ [🔍 Search exporter...]                         │ │ │
│ │             │  │ ┌─ Acme Export Ltd ★★★ (Tier 1, Verified) ──┐ │ │ │
│ │             │  │ └────────────────────────────────────────────┘ │ │ │
│ │             │  │                                                 │ │ │
│ │             │  │ Agent (Optional)                                │ │ │
│ │             │  │ [🔍 Search agent...]                            │ │ │
│ │             │  │                                                 │ │ │
│ │             │  └─────────────────────────────────────────────────┘ │ │
│ │             │                                                       │ │
│ │             │  ┌─────────────────────────────────────────────────┐ │ │
│ │             │  │ STEP 4: Review & Submit                         │ │ │
│ │             │  │ ───────────────────────────────────────────────│ │ │
│ │             │  │                                                 │ │ │
│ │             │  │ Summary:                                        │ │ │
│ │             │  │ • HS Code: 1801.00.10 (validated, 95%)         │ │ │
│ │             │  │ • Documents: 2/3 uploaded                      │ │ │
│ │             │  │ • Exporter: Acme Export Ltd (Tier 1)            │ │ │
│ │             │  │                                                 │ │ │
│ │             │  │ ⚠️ Missing Lab Report - submission will be      │ │ │
│ │             │  │    held until received                          │ │ │
│ │             │  │                                                 │ │ │
│ │             │  │ 💰 Estimated Fees: ₦45,000                     │ │ │
│ │             │  │    Processing: 5-7 days                         │ │ │
│ │             │  │                                                 │ │ │
│ │             │  │ [Save Draft]                    [Submit Shipment]│ │ │
│ │             │  │                                                 │ │ │
│ │             │  └─────────────────────────────────────────────────┘ │ │
│ └─────────────┘                                                       │ │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Exporter Status Dashboard

```
┌─────────────────────────────────────────────────────────────────────────┐
│ CULBRIDGE                                [Logo]     [Exporter: AcmeCo] │
│                                              [Notifications] [Profile] │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  MY SHIPMENTS                                         [+ New Shipment] │
│  ═══════════════                                                           │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ Filter: [All Status ▼] [Date Range] [Product]    [Search...]    Q │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌──────┬────────────┬──────────┬────────┬───────────┬─────────────┐  │
│  │ ID   │ Product    │ Status   │ Flags  │ Last Upd  │ Actions     │  │
│  ├──────┼────────────┼──────────┼────────┼───────────┼─────────────┤  │
│  │CB-010│ Cocoa      │✅ APPROVED│ PASS   │ 2 hrs ago │ [View][↓]  │  │
│  │CB-009│ Sesame     │📋 PENDING │ ⚠️ INFO│ 5 hrs ago │ [View][✏️] │  │
│  │CB-008│ Cashew     │❌ REJECTED│ 🔴 BLOCK│ 1 day ago │ [View][?]  │  │
│  │CB-007│ Cocoa      │📤 SUBMITED│ PASS   │ 2 days    │ [View]     │  │
│  │CB-006│ Ginger     │📋 READY   │ ⚠️ WARN│ 3 days    │ [View][✏️] │  │
│  └──────┴────────────┴──────────┴────────┴───────────┴─────────────┘  │
│                                                                         │
│  Showing 5 of 24 shipments                              [Load More]    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Internal Admin Dashboard

```
┌─────────────────────────────────────────────────────────────────────────┐
│ CULBRIDGE ADMIN                      [🔔 3]    [👤 David ▼]            │
├─────────────────────────────────────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────────────────────────────────────────────────────┐ │
│ │ OVERVIEW│ │  TODAY'S METRICS                                       │ │
│ │─────────│ │  ═══════════════                                       │ │
│ │📊 Dashboard│ │                                                         │ │
│ │🚢 Shipments│ │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │ │
│ │🔍 Review │ │  │156        │ │23         │ │98%       │ │12      │ │ │
│ │📋 Audit │  │  │Shipments  │ │Pending    │ │Approval  │ │Queue   │ │ │
│ │⚙️ Modules│ │  │(+12% ▲)   │ │Review     │ │Rate      │ │Depth   │ │ │
│ │📈 Metrics│ │  └──────────┘ └──────────┘ └──────────┘ └────────┘ │ │
│ │⚠️ Alerts │ │                                                         │ │
│ │         │ │                                                         │ │
│ │─────────│ │  RECENT ACTIVITY                                       │ │
│ │⚙️ Settings│ │  ───────────────                                      │ │
│ │         │ │  • CB-156 submitted by Acme Export                     │ │
│ │         │ │  • CB-155 APPROVED by Compliance Team                  │ │
│ │         │ │  • CB-154 REJECTED - Lab test failure                  │ │
│ │         │ │  • CB-153 submitted by Global Traders                  │ │
│ │         │ │                                                         │ │
│ │         │ │  ALL SHIPMENTS (Live)                    [Filters ▼]   │ │
│ │         │ │  ───────────────────────────────────                   │ │
│ │         │ │  ┌──────┬────────┬─────────┬──────┬────────┬───────┐ │ │
│ │         │ │  │ID    │Status  │Product  │Flags │Updated │Actions│ │ │
│ │         │ │  ├──────┼────────┼─────────┼──────┼────────┼───────┤ │ │
│ │         │ │  │CB-156│🟡PENDIN│Cocoa    │INFO  │Now     │[Review│ │ │
│ │         │ │  │CB-155│🟢APPROV│Sesame   │PASS  │2m ago  │[View] │ │ │
│ │         │ │  │CB-154│🔴REJECT│Cashew   │BLOCK │5m ago  │[View] │ │ │
│ │         │ │  │CB-153│🔵SUBMT │Ginger   │PASS  │12m ago │[View] │ │ │
│ │         │ │  └──────┴────────┴─────────┴──────┴────────┴───────┘ │ │
│ └─────────┘ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.4 Audit Log Viewer

```
┌─────────────────────────────────────────────────────────────────────────┐
│ AUDIT LOG: CB-154                                         [⬅ Back]    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  SHIPMENT OVERVIEW                                                     │
│  ─────────────────                                                     │
│  Product: Cashew nuts (RBF)          Status: 🔴 REJECTED              │
│  Exporter: Kano Agro Ltd             Submitted: 2026-03-28 10:30 AM   │
│  HS Code: 0801.32.00                 Rejected: 2026-03-28 02:15 PM    │
│                                                                         │
│  ════════════════════════════════════════════════════════════════════  │
│                                                                         │
│  EVENT TIMELINE                                            [▶ Play]   │
│  ───────────────                                              [⟳ Auto] │
│                                                                         │
│  10:30:15  📤 SUBMITTED     Agent: john@kanoagro.com                    │
│           → Shipment created, documents uploaded                      │
│           ─────────────────────────────────────────────                │
│                                                                         │
│  10:30:45  🔍 VALIDATING   System                                        │
│           → HS Code validation: 0801.32.00 (95% confidence)           │
│           → Document vault: 3/4 required documents                     │
│           ─────────────────────────────────────────────                │
│                                                                         │
│  10:31:20  ⚠️  WARNING     System                                        │
│           → Lab report aflatoxin B1: 3.2 μg/kg (limit: 2.0)           │
│           → Lab report aflatoxin total: 6.5 μg/kg (limit: 4.0)       │
│           ─────────────────────────────────────────────                │
│                                                                         │
│  10:32:00  🚫 BLOCKED     Compliance Engine                            │
│           → EUDR: FAIL - Lab test non-compliance                       │
│           → RASFF: HISTORY - Previous exporter flag                    │
│           ─────────────────────────────────────────────                │
│                                                                         │
│  14:15:00  ❌ REJECTED    Reviewer: David | CEO & Founder | Culbridge   │
│           → Manual confirmation of auto-rejection                       │
│           → Reason: Lab test failure - aflatoxin exceed limits         │
│           ─────────────────────────────────────────────                │
│                                                                         │
│  [Export PDF]  [Export CSV]  [Share Link]                              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Flow Diagrams

### 6.1 End-to-End Shipment Journey

```
┌─────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────────┐
│ Exporter│     │ Submission  │     │  Validation │     │  Compliance  │
│ Creates │────▶│   Portal    │────▶│   Engine    │────▶│   Engine     │
│ Shipment│     │              │     │              │     │              │
└─────────┘     └──────────────┘     └─────────────┘     └──────────────┘
       │               │                    │                    │
       │               │                    │                    │
       ▼               ▼                    ▼                    ▼
┌─────────────┐  ┌──────────────┐    ┌─────────────┐     ┌──────────────┐
│ • HS Code  │  │ • Validate  │    │ • HS Code   │     │ • EUDR      │
│ • Documents│  │   inputs     │    │   validation│     │   Check     │
│ • Entity   │  │ • Check req │    │ • Document  │     │ • RASFF     │
│ • Fees     │  │   docs      │    │   validation│     │   History   │
│            │  │ • Calculate │    │ • Entity    │     │ • Lab Test  │
│            │  │   fees      │    │   verification│   │   Review    │
└─────────────┘  └──────────────┘    └─────────────┘     └──────────────┘
                                                                │
                              ┌────────────────────────────────┤
                              │                                │
                              ▼                                ▼
                       ┌──────────────┐               ┌──────────────┐
                       │   APPROVED   │               │   REJECTED  │
                       │              │               │              │
                       │ • Sign      │               │ • Log reason│
                       │   digitally │               │ • Notify    │
                       │ • Generate  │               │   exporter  │
                       │   NSW       │               │ • Archive   │
                       │   payload   │               │              │
                       │ • Submit to │               │              │
                       │   NSW/      │               │              │
                       │   Remita    │               │              │
                       └──────────────┘               └──────────────┘
                              │                                │
                              │                                │
                              ▼                                ▼
                       ┌──────────────┐               ┌──────────────┐
                       │  Port Event │               │  Appeal      │
                       │  Tracking   │               │  Process     │
                       │             │               │              │
                       │ • Cargo     │               │ • Request    │
                       │   arrived   │               │   review     │
                       │ • Scanning  │               │ • Submit new │
                       │ • Exit note │               │   evidence  │
                       └──────────────┘               └──────────────┘
```

### 6.2 Module Processing Flow

```
                           ┌─────────────────┐
                           │  Shipment       │
                           │  Submitted      │
                           └────────┬────────┘
                                    │
                                    ▼
                    ┌───────────────────────────┐
                    │  HS Code Validator        │
                    │  ────────────────────     │
                    │  Input: description       │
                    │  Output: hs_code,         │
                    │          confidence      │
                    └────────────┬──────────────┘
                                 │
                    ┌────────────┴─────────────┐
                    │                          │
              ┌─────▼──────┐            ┌──────▼──────┐
              │ Valid (>70%)│            │ Invalid     │
              └─────┬──────┘            └──────┬──────┘
                    │                          │
                    ▼                          ▼
        ┌───────────────────┐        ┌─────────────────────┐
        │ Document Vault   │        │ Return Error        │
        │ ───────────────── │        │ - Invalid HS Code  │
        │ Upload docs       │        │ - Try alternatives │
        │ Validate types    │        │ - Flag for review  │
        │ Check required    │        └─────────────────────┘
        └────────┬──────────┘
                 │
        ┌────────┴─────────┐
        │                  │
  ┌─────▼──────┐    ┌──────▼──────┐
  │ All docs   │    │ Missing     │
  │ present    │    │ docs        │
  └─────┬──────┘    └──────┬──────┘
        │                  │
        ▼                  ▼
┌─────────────────┐  ┌─────────────────────┐
│ Entity Sync     │  │ Request Upload      │
│ ──────────────  │  │ - Specific docs     │
│ Verify exporter │  │ - Set deadline      │
│ Check AEO tier  │  │ - Notify exporter   │
└────────┬────────┘  └─────────────────────┘
         │
┌────────┴─────────┐
│                  │
│   ┌─────▼──────┐ │
│   │ Fee Calc   │ │
│   │ ─────────  │ │
│   │ Sum cert  │ │
│   │ fees       │ │
│   │ Est. days  │ │
│   └─────┬──────┘ │
│         │        │
│         ▼        │
│ ┌──────────────┐ │
│ │ Compliance   │ │
│ │ Engine       │ │
│ │ ──────────── │ │
│ │ EUDR check   │ │
│ │ RASFF lookup │ │
│ │ Lab test     │ │
│ │ validation   │ │
│ └──────┬───────┘ │
│        │          │
│  ┌─────▼──────┐   │
│  │ All PASS   │   │
│  └─────┬──────┘   │
│        │          │
│        ▼          │
│ ┌──────────────┐   │
│ │ Declaration  │   │
│ │ Builder      │   │
│ │ ──────────── │   │
│ │ Generate     │   │
│ │ NSW payload  │   │
│ └──────┬───────┘   │
│        │           │
│        ▼           │
│ ┌──────────────┐   │
│ │ Digital      │   │
│ │ Signature    │   │
│ │ ──────────── │   │
│ │ Sign payload│   │
│ │ Immutable   │   │
│ └──────────────┘   │
│        │           │
│        ▼           │
│ ┌──────────────┐   │
│ │ NSW/Remita  │   │
│ │ Submit      │   │
│ └──────────────┘   │
```

---

## 7. Edge Cases Handling

### 7.1 Invalid Payloads

| Scenario | Detection | Frontend Action | Backend Action |
|----------|-----------|-----------------|----------------|
| Missing required field | Schema validation | Highlight field, show inline error | Return 400 with field list |
| Invalid HS code format | Regex check | Show format hint, suggest corrections | Return validation error |
| HS code not in database | Lookup failure | Offer alternative matches | Return "not found" with suggestions |
| Document type mismatch | Type validation | Show allowed types, reject file | Return error, log attempt |
| Entity not found | Entity lookup | Show "not found" message | Return 404 with search suggestions |
| Fee calculation overflow | Numeric validation | Cap at maximum, show warning | Return max value + warning |

### 7.2 Duplicate Submission

| Scenario | Detection | Frontend Action | Backend Action |
|----------|-----------|-----------------|----------------|
| Exact duplicate (idempotency) | Token match | Show "already submitted" message | Return existing result |
| Partial duplicate | HS code + entity + date | Show warning, require confirmation | Flag for review |
| Retried submission | Retry with same token | Show progress of original | Return original status |

**Idempotency Implementation:**
```typescript
// Frontend: Generate submission token
const submissionToken = crypto.randomUUID();

// Send with submission
POST /shipments { ..., idempotency_key: submissionToken }

// Backend: Check before processing
const existing = await db.query(
  'SELECT * FROM Submissions WHERE idempotency_key = ?',
  [idempotency_key]
);

if (existing) {
  return existing.result; // Return cached result
}
```

### 7.3 API Failures

| Scenario | Detection | Frontend Action | Backend Action |
|----------|-----------|-----------------|----------------|
| NSW API timeout | 30s timeout | Show "submission queued" + retry button | Queue for retry with exponential backoff |
| NSW API error | Non-2xx response | Show error details (sanitized) | Log full error, return sanitized |
| Remita failure | Error response | Show "payment may be delayed" | Queue webhook callback |
| LLM extraction timeout | 60s timeout | Show "processing" + progress | Return partial with "needs review" |
| Database connection failure | Connection error | Show "temporary error" + retry | Log, alert on 3+ failures |

**Retry Strategy:**
- Max retries: 3
- Backoff: exponential (2s, 4s, 8s)
- Queue for background processing if user closes page

### 7.4 Edge Case UI Patterns

#### Timeout During Upload
```
┌─────────────────────────────────────┐
│ ⚠️ Upload Timeout                  │
│ ───────────────────────────────────│
│                                     │
│ The document upload is taking longer│
│ than expected.                      │
│                                     │
│ ⏳ Progress: 75% (3.2 MB / 4.3 MB) │
│ ████████████░░░░░░░░░░░░░░░░░░░░░░  │
│                                     │
│ What would you like to do?         │
│                                     │
│ [Retry Upload]  [Continue Anyway]  │
│                                     │
└─────────────────────────────────────┘
```

#### Partial Validation Failure
```
┌─────────────────────────────────────┐
│ ⚠️ Validation Issues Found         │
│ ───────────────────────────────────│
│                                     │
│ Your shipment has the following    │
│ issues that need attention:        │
│                                     │
│ 🔴 HS Code: Not in database         │
│    • Try: 1801.00.10 (Cocoa beans)  │
│    • Try: 1801.00.20 (Cocoa paste)  │
│                                     │
│ 🟡 Document: Lab Report missing     │
│    • Required for cocoa exports     │
│    • Upload now or continue         │
│                                     │
│ [Fix HS Code]  [Upload Lab Report] │
│ [Continue Anyway - Will be held]   │
│                                     │
└─────────────────────────────────────┘
```

---

## 8. UX Guidelines

### 8.1 Form Layouts

#### Input Field Standards
```
Label:     Product Description *
Field:     ┌─────────────────────────────┐
           │ Enter product description   │
           │ for customs classification  │
           └─────────────────────────────┘
Help:      Minimum 10 characters
Error:     🔴 Description too short (8/10)
```

#### Spacing System
- Base unit: 4px
- Component padding: 16px (4 units)
- Section margin: 24px (6 units)
- Page padding: 32px (8 units)

#### Responsive Breakpoints
| Breakpoint | Width | Layout |
|------------|-------|--------|
| Mobile | < 640px | Single column, stacked |
| Tablet | 640-1024px | Two column where appropriate |
| Desktop | > 1024px | Full layout with sidebar |

### 8.2 Feedback Patterns

#### Loading States
```
┌─────────────────────────────────────┐
│ Processing Shipment...             │
│ ───────────────────────────────────│
│                                     │
│ ⏳ Validating HS Code...            │
│    ████████████░░░░░░░ 60%         │
│                                     │
│ ⏳ Checking documents...           │
│    Pending                          │
│                                     │
│ ⏳ Calculating fees...              │
│    Pending                          │
│                                     │
│ [Cancel]                            │
└─────────────────────────────────────┘
```

#### Success States
```
┌─────────────────────────────────────┐
│ ✅ Shipment Submitted Successfully │
│ ───────────────────────────────────│
│                                     │
│ Shipment ID: CB-2026-0315-001      │
│                                     │
│ Your submission has been received  │
│ and is being processed.            │
│                                     │
│ 📋 Next Steps:                      │
│ • Await compliance review (1-2 days)│
│ • Monitor status in dashboard       │
│ • You'll receive email on decision │
│                                     │
│ [View Shipment]  [Return to Dashboard]│
└─────────────────────────────────────┘
```

#### Error States
```
┌─────────────────────────────────────┐
│ ❌ Submission Failed               │
│ ───────────────────────────────────│
│                                     │
│ We encountered an error processing │
│ your shipment.                      │
│                                     │
│ Error Code: ERR_NSW_003            │
│ Message: External service timeout   │
│                                     │
│ Your data has been saved as draft.  │
│                                     │
│ What would you like to do?          │
│                                     │
│ [Retry Now]  [Contact Support]      │
└─────────────────────────────────────┘
```

### 8.3 Alert Styles

| Type | Icon | Color | Usage |
|------|------|-------|-------|
| **Info** | ℹ️ | Blue (#2563EB) | General information, hints |
| **Success** | ✅ | Green (#16A34A) | Completed actions |
| **Warning** | ⚠️ | Amber (#D97706) | Non-blocking issues |
| **Error** | ❌ | Red (#DC2626) | Blocking issues |
| **Critical** | 🚫 | Dark Red (#991B1B) | System failures |

#### Alert Component
```
┌──────────────────────────────────────────┐
│ ⚠️ Missing Required Documents           │
│ ──────────────────────────────────────  │
│                                          │
│ The following documents are required    │
│ for submission:                          │
│                                          │
│ • Certificate of Origin                 │
│ • Phytosanitary Certificate              │
│ • Lab Test Report                       │
│                                          │
│ [Upload Now]  [Learn More]              │
└──────────────────────────────────────────┘
```

### 8.4 Color System

| Name | Hex | Usage |
|------|-----|-------|
| Primary | #0F766E | Main actions, CTAs |
| Primary Hover | #0D9488 | Button hover states |
| Secondary | #64748B | Secondary actions |
| Background | #F8FAFC | Page background |
| Surface | #FFFFFF | Card backgrounds |
| Border | #E2E8F0 | Input borders, dividers |
| Text Primary | #1E293B | Main text |
| Text Secondary | #64748B | Helper text |
| Text Muted | #94A3B8 | Placeholders |

### 8.5 Typography

| Element | Font | Size | Weight |
|---------|------|------|--------|
| H1 | Inter | 32px | 700 |
| H2 | Inter | 24px | 600 |
| H3 | Inter | 20px | 600 |
| Body | Inter | 16px | 400 |
| Small | Inter | 14px | 400 |
| Caption | Inter | 12px | 400 |
| Monospace | JetBrains Mono | 14px | 400 |

---

## 9. Integration Hooks

### 9.1 API Endpoints

#### Authentication
```
Header: Authorization: Bearer <token>
Header: X-HMAC-Verification: <hmac> (optional)

GET /auth/login
POST /auth/refresh
POST /auth/logout
```

#### Shipments
```
GET    /shipments                    - List user's shipments
POST   /shipments                    - Create new shipment
GET    /shipments/:id                 - Get shipment details
PUT    /shipments/:id                - Update shipment
DELETE /shipments/:id                - Delete draft shipment
POST   /shipments/:id/submit         - Submit for processing

GET    /shipments/:id/evaluations    - Get module evaluations
GET    /shipments/:id/fees           - Get fee calculation
GET    /shipments/:id/compliance     - Get compliance status
GET    /shipments/:id/audit          - Get audit log
GET    /shipments/:id/signature      - Get signature status
```

#### Documents
```
POST   /documents/upload             - Upload document
GET    /documents/:id                - Get document metadata
DELETE /documents/:id                - Delete document
```

#### Admin
```
GET    /admin/shipments              - All shipments (admin)
GET    /admin/shipments/:id/override - Override compliance
GET    /admin/analytics              - System analytics
POST   /admin/fees/update            - Update fee schedule
```

#### Webhooks
```
POST   /webhooks/shipment-status     - Receive status updates
POST   /webhooks/nsw-events          - NSW port events
```

### 9.2 HMAC Headers

```typescript
// Request signing (optional for exporters)
const timestamp = Date.now();
const payload = JSON.stringify({ ... });
const signature = crypto
  .createHmac('sha256', HMAC_SECRET)
  .update(`${timestamp}.${payload}`)
  .digest('hex');

fetch('/shipments', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'X-Timestamp': timestamp.toString(),
    'X-Signature': signature,
    'Content-Type': 'application/json'
  },
  body: payload
});

// Response verification
const responseHMAC = response.headers.get('X-Response-HMAC');
const expectedHMAC = crypto
  .createHmac('sha256', HMAC_SECRET)
  .update(JSON.stringify(responseData))
  .digest('hex');

if (responseHMAC === expectedHMAC) {
  // Response is verified
}
```

### 9.3 RBAC Visibility

| Feature | Exporter | Compliance | Admin | Founder |
|---------|----------|------------|-------|---------|
| View own shipments | ✅ | ✅ | ✅ | ✅ |
| Create shipment | ✅ | ✅ | ✅ | ✅ |
| Submit shipment | ✅ | ✅ | ✅ | ✅ |
| View all shipments | ❌ | ✅ | ✅ | ✅ |
| Manual override | ❌ | ✅ | ✅ | ✅ |
| View audit logs | Own | All | All | All |
| View metrics | ❌ | Limited | Full | Full |
| Modify fees | ❌ | ❌ | ✅ | ✅ |
| System config | ❌ | ❌ | ✅ | ✅ |
| View founder attribution | ❌ | ❌ | ✅ | ✅ |
| Replay audit | ❌ | ✅ | ✅ | ✅ |

### 9.4 WebSocket Events

```typescript
// Client subscribes to shipment updates
const ws = new WebSocket('wss://api.culbridge.com/ws');

ws.onopen = () => {
  ws.send(JSON.stringify({
    action: 'subscribe',
    shipment_ids: ['CB-001', 'CB-002']
  }));
};

ws.onmessage = (event) => {
  const update = JSON.parse(event.data);
  // {
  //   shipment_id: 'CB-001',
  //   event: 'status_changed',
  //   from: 'PENDING',
  //   to: 'VALIDATING',
  //   timestamp: '2026-03-28T10:30:00Z'
  // }
};
```

### 9.5 Rate Limiting

```
Endpoint               Limit       Window
─────────────────────────────────────────────
POST /shipments        10          1 minute
POST /documents/upload 20          1 minute
GET  /shipments        100         1 minute
GET  /admin/*         200         1 minute

Rate limit headers:
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 8
X-RateLimit-Reset: 1700000000
```

---

## 10. Component Reference

### 10.1 Exporter Components

| Component | File | Props | Events |
|-----------|------|-------|--------|
| [`HSCodeInput`](#hscodeinput) | `components/hs-code-input.tsx` | `productDescription, onValidated` | `onChange, onValidate, onSelectSuggestion` |
| [`DocumentUploader`](#documentuploader) | `components/document-uploader.tsx` | `shipmentId, requiredTypes, onUploadComplete` | `onUpload, onRemove, onError` |
| [`EntitySelector`](#entityselector) | `components/entity-selector.tsx` | `entityType, onSelect` | `onSearch, onSelect` |
| [`ShipmentTable`](#shipmenttable) | `components/shipment-table.tsx` | `shipments[], filters, sortBy` | `onSort, onFilter, onRowClick` |
| [`ShipmentDetailView`](#shipmentdetailview) | `components/shipment-detail-view.tsx` | `shipmentId, activeTab` | `onTabChange, onAction` |
| [`FeeSummaryCard`](#feesummarycard) | `components/fee-summary-card.tsx` | `shipmentId, certificates[]` | `onToggleFastTrack` |
| [`SubmissionSummaryPanel`](#submissionsummarypanel) | `components/submission-summary-panel.tsx` | `shipmentData` | `onSubmit, onSaveDraft` |
| [`NotificationPreferences`](#notificationpreferences) | `components/notification-preferences.tsx` | `userId, preferences` | `onUpdate` |

### 10.2 Admin Components

| Component | File | Props | Events |
|-----------|------|-------|--------|
| [`AdminShipmentDashboard`](#adminshipmentdashboard) | `components/admin-shipment-dashboard.tsx` | `filters, timeRange` | `onFilterChange, onShipmentAction` |
| [`AuditLogViewer`](#auditlogviewer) | `components/audit-log-viewer.tsx` | `shipmentId, filters` | `onReplay, onExport` |
| [`ComplianceEngineControl`](#complianceenginecontrol) | `components/compliance-engine-control.tsx` | `commodityType` | `onToggleRule, onOverride` |
| [`FeeCalculatorControl`](#feecalculatorcontrol) | `components/fee-calculator-control.tsx` | `sandboxMode` | `onUpdateRates, onTestCalculation` |
| [`SignatureVerificationPanel`](#signatureverificationpanel) | `components/signature-verification-panel.tsx` | `shipmentId` | `onVerify, onExport` |
| [`SystemMetricsDashboard`](#systemmetricsdashboard) | `components/system-metrics-dashboard.tsx` | `timeRange, metrics[]` | `onAlertConfig` |

---

## Appendix A: Data Models

### Shipment Object
```typescript
interface Shipment {
  id: string;                    // CB-2026-0315-001
  status: ShipmentStatus;
  exporter_id: string;
  agent_id?: string;
  product_description: string;
  commodity_type: CommodityType;
  hs_code: string;
  hs_code_confidence: number;
  destination_country: string;
  destination_port: string;
  batch_number: string;
  weight_kg: number;
  value_usd: number;
  required_certificates: CertificateRef[];
  documents: Document[];
  compliance_flags: ComplianceFlag[];
  total_fees_naira: number;
  created_at: string;           // ISO 8601
  updated_at: string;
  submitted_at?: string;
  signed_at?: string;
  rejected_at?: string;
  rejection_reason?: string;
  reviewer_id?: string;
  digital_signature?: DigitalSignature;
}

type ShipmentStatus = 
  | 'DRAFT'
  | 'PENDING_VALIDATION'
  | 'VALIDATING'
  | 'READY_TO_SUBMIT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'SIGNED';
```

### Audit Event Object
```typescript
interface AuditEvent {
  event_id: string;
  shipment_id: string;
  event_type: string;
  module: ModuleName;
  timestamp: string;
  actor: {
    id: string;
    name: string;
    role: string;
    organization: string;
  };
  previous_state: Record<string, any>;
  new_state: Record<string, any>;
  details: Record<string, any>;
  hash: string;                  // SHA-256 for integrity
}
```

---

## Appendix B: Security Considerations

1. **No sensitive financial data on exporter UI** - Only show fee totals, not raw calculations
2. **Founder attribution internal only** - David | CEO & Founder | Culbridge visible only to internal users
3. **HMAC verification optional** - Exporters can verify response integrity
4. **Rate limiting enforced** - Prevent abuse
5. **Audit log immutability** - All events hashed, cannot be modified
6. **RBAC enforced** - Strict visibility controls

---

## Appendix C: PDF Generation System

### C.1 Overview

The PDF Generator is a critical interoperability layer that converts validated shipment data into a submission-ready format usable by exporters, clearing agents, and regulatory workflows.

| Property | Value |
|----------|-------|
| Module | `services/pdf-generator.js` |
| Library | `reportlab.platypus` (NOT canvas-based) |
| Output | `/storage/pdfs/{shipment_id}.pdf` |
| Endpoint | `GET /v1/shipment-results/:id/pdf` |

### C.2 Non-Negotiable Principles

1. **Deterministic Output** - Same input → identical PDF output (byte-level consistency)
2. **Readability First** - Human-usable, agents must understand instantly
3. **Completeness** - No missing required fields if marked COMPLIANT
4. **Integrity-Bound** - Must reflect exact signed payload (no divergence)

### C.3 Trigger Conditions

PDF generation ONLY occurs when:

```javascript
if (deterministic_flags.all_verified === true 
    && state === 'READY_FOR_SUBMISSION' 
    && digital_signature exists) {
    // Generate PDF
}
```

### C.4 Lock Dependency

```
Payload Signed → PDF Generated → NSW Submission
```

PDF must be generated AFTER payload is locked (digital signature applied) and BEFORE NSW submission to prevent mismatch.

### C.5 PDF Structure (5 Pages + Integrity)

#### Page 1 — Executive Summary

```
┌─────────────────────────────────────────────────────────────┐
│ CULBRIDGE EXPORT SUBMISSION PACKAGE                        │
│ Shipment ID: CB-001                                        │
│ Timestamp: 2026-03-28T10:30:00Z                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ╔═══════════════════════════════════════════════════════╗  │
│ ║  Shipment Ready for Submission ✅                      ║  │
│ ║                                                           ║  │
│ ║  ✔ All required documents verified                     ║  │
│ ║  ✔ No compliance violations detected                    ║  │
│ ║  ✔ HS code validated                                    ║  │
│ ║  ✔ Financials consistent                                 ║  │
│ ╚═══════════════════════════════════════════════════════╝  │
│                                                             │
│  Exporter Name:        [Acme Export Ltd]                   │
│  RC Number / TIN:      [RC-123456 / TIN-789012]           │
│  Destination Country:  [Germany]                          │
│  Port of Exit:         [Apapa Port, Lagos]                │
│  Commodity Description:[Raw Cocoa Beans]                   │
│  HS Code:              [1801.00.10]                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Page 2 — Compliance Breakdown

```
┌─────────────────────────────────────────────────────────────┐
│ COMPLIANCE BREAKDOWN                                        │
├─────────────────────────────────────────────────────────────┤
│ Module               │ Status │ Notes                      │
│ ─────────────────────┼────────┼───────────────────────────│
│ HS Code Validator   │   ✅   │ 1801.00.10 (95% conf)     │
│ Compliance Engine   │   ✅   │ EUDR rules satisfied       │
│ Document Vault      │   ✅   │ All certificates present   │
│ Entity Sync         │   ✅   │ AEO ACTIVE, Tier 1        │
│ Fee Calculator      │   ✅   │ ₦45,000 total             │
│ Digital Signature   │   ✅   │ Signed at 10:30:00Z       │
└─────────────────────────────────────────────────────────────┘
```

#### Page 3 — Certificate References

```
┌─────────────────────────────────────────────────────────────┐
│ CERTIFICATE REFERENCES                                      │
├─────────────────────────────────────────────────────────────┤
│ Document Type                  │ Reference Number          │
│ ───────────────────────────────┼───────────────────────────│
│ NAQS Phytosanitary Certificate │ NAQS-2026-001234          │
│ NAFDAC Certificate            │ NAFDAC-2026-005678        │
│ SONCAP                        │ SONCAP-2026-009012        │
│ Certificate of Origin         │ COO-2026-003456          │
│ Lab Test Report               │ LAB-2026-007890          │
└─────────────────────────────────────────────────────────────┘
```

#### Page 4 — Financial Summary

```
┌─────────────────────────────────────────────────────────────┐
│ FINANCIAL SUMMARY                                           │
├─────────────────────────────────────────────────────────────┤
│ Item                        │ Amount (₦)                   │
│ ────────────────────────────┼──────────────────────────────│
│ NES Levy                    │ 15,000.00                   │
│ Import/Export Duties        │ 12,500.00                   │
│ Agency Fees (NAQS)          │ 10,000.00                   │
│ Agency Fees (NAFDAC)        │  5,000.00                   │
│ Agency Fees (SONCAP)         │  2,500.00                   │
│ ────────────────────────────┼──────────────────────────────│
│ TOTAL ESTIMATED COST         │ 45,000.00                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Financial Integrity: VERIFIED ✅                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Page 5 — Declaration Statement

```
┌─────────────────────────────────────────────────────────────┐
│ DECLARATION STATEMENT                                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ This shipment has been validated against structured         │
│ regulatory rules. All required compliance conditions        │
│ have been satisfied based on provided data.                 │
│                                                             │
│ Final clearance remains subject to regulatory authority     │
│ review.                                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Final Section — Integrity Marker

```
┌─────────────────────────────────────────────────────────────┐
│ CULBRIDGE INTEGRITY VERIFICATION                           │
├─────────────────────────────────────────────────────────────┤
│ Payload Hash:     a1b2c3d4e5f6... (SHA-256)                │
│ Signature ID:     SIG-2026-0315-001                        │
│ Timestamp:        2026-03-28T10:30:00Z                    │
│ Generated by:     Culbridge Export Compliance System        │
└─────────────────────────────────────────────────────────────┘
```

### C.6 Implementation Details

#### Library Requirements
```javascript
// MANDATORY: Use reportlab.platypus
const { SimpleDocTemplate, Paragraph, Table, TableStyle, Spacer } = require('reportlab.platypus');

// NOT ALLOWED: Canvas-based drawing (pdfkit, etc.)
```

#### Storage Structure
```javascript
{
  "shipment_id": "CB-001",
  "pdf_path": "/storage/pdfs/CB-001.pdf",
  "pdf_hash": "sha256:...",
  "generated_at": "2026-03-28T10:30:00Z"
}
```

#### Database Schema
```sql
CREATE TABLE IF NOT EXISTS GeneratedPdfs (
  shipment_id VARCHAR(50) PRIMARY KEY,
  pdf_path VARCHAR(255) NOT NULL,
  pdf_hash VARCHAR(64) NOT NULL,
  payload_hash VARCHAR(64) NOT NULL,
  generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  generated_by VARCHAR(50),
  INDEX idx_shipment (shipment_id),
  INDEX idx_hash (pdf_hash)
);
```

#### PASS_HANDLER Integration
The PDF generator can now include proven compliance data from PASS_HANDLER:

```javascript
// Get proven patterns for this shipment type
const provenPatterns = await passHandler.getProvenTemplates(route, product_id);

// Include in PDF under confidence section
const confidenceSection = {
  confidence_score: confidenceScores[route]?.confidence_score || 0,
  proven_shipments: confidenceScores[route]?.proven_shipments || 0,
  similar_shipments_passed: provenPatterns.length,
  recommendation: confidence_score > 0.8 ? 'HIGHLY TRUSTED' : 'STANDARD'
};
```

### C.7 Access Control

| Role | Access |
|------|--------|
| Admin | Full access to all PDFs |
| Exporter | Own shipments only (owner only) |
| Compliance | Read access |
| Founder | Full access |

### C.8 API Endpoint

```
GET /v1/shipment-results/{id}/pdf

Response:
- 200: PDF binary (Content-Type: application/pdf)
- 403: Not authorized
- 404: PDF not generated or shipment not found
- 409: Shipment not in READY_FOR_SUBMISSION state
```

### C.9 Testing Requirements

| Test | Criteria |
|------|----------|
| **Determinism** | Same input → identical PDF hash |
| **Integrity Match** | PDF hash corresponds to signed payload |
| **Missing Data Prevention** | No PDF if missing certificate or failed module |
| **Load Test** | 100 PDFs generated concurrently without failure |

### C.10 Failure Conditions (Blockers)

If ANY occur, system is UNSAFE:
- PDF shows compliant but system is NOT compliant
- PDF differs from signed payload
- Missing critical fields
- Hash mismatch

---

## Appendix E: Core Compliance Modules

### E.1 Compliance Engine (Deterministic)

```javascript
const { ComplianceEngine } = require('./engine/compliance-engine');

// Full evaluation
POST /v1/shipments/:shipment_id/compliance/evaluate

// Quick status
GET /v1/shipments/:shipment_id/compliance/status
```

**Rule Layers:**

| Layer | Description | Data Source |
|-------|-------------|-------------|
| Substance Rules | MRLs (Aflatoxin, Pesticides, Heavy metals) | EFSA |
| Document Rules | Required certificates (NAQS, NAFDAC, SONCAP) | EUR-Lex |
| Country Rules | EUDR, destination-specific | RASFF, National |
| HS Code Rules | Structural correctness | Codex |

**Output:**
```json
{
  "status": "COMPLIANT | NON_COMPLIANT",
  "violations": [
    {
      "type": "MRL_EXCEEDED",
      "substance": "Dichlorvos",
      "limit": "0.01 mg/kg",
      "detected": "0.12 mg/kg",
      "source": "EFSA",
      "severity": "CRITICAL"
    }
  ],
  "warnings": [],
  "checked_rules": []
}
```

**Hard Constraint:** NO probabilistic output - If rule violated → FAIL → BLOCK

### E.2 Document Completeness Engine

```javascript
const { DocumentCompletenessEngine } = require('./engine/document-completeness');

// Check completeness
POST /v1/shipments/:shipment_id/documents/check

// Get required documents
GET /v1/shipments/:shipment_id/documents/required
```

**Logic:**
```javascript
required_docs = getRequiredDocs(product, destination)
missing = required_docs - uploaded_docs
invalid = validateDocs(uploaded_docs)

if (missing.length > 0) → BLOCK
```

### E.3 State Machine + Invariant Integration

```javascript
const { STATES, stateValidationMiddleware, invariantCheckMiddleware } = require('./middleware/state-validator');

// Can only proceed if all modules pass
app.post('/shipments/:shipment_id/transition', 
  stateValidationMiddleware(STATES.DOCUMENTS_VERIFIED),
  invariantCheckMiddleware(STATES.COMPLIANCE_PASSED),
  handleComplianceTransition
);
```

### E.4 Full Pipeline

```
User Input
   ↓
[Schema Validation]
   ↓
[HS Code Validator]
   ↓
[Document Completeness] ← BLOCK if missing docs
   ↓
[Compliance Engine] ← BLOCK if violations
   ↓
[State Machine] ← BLOCK if not sequential
   ↓
[Invariant Engine] ← BLOCK if corrupted
   ↓
[Submission Package Generator]
   ↓
[Signature]
   ↓
Output (PDF)
   ↓
Real World
   ↓
[PASS_HANDLER] ← Learns
```

---

*End of Blueprint*
