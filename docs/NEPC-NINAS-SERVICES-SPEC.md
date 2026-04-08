# 🔧 NEPC & NINAS Services – Dev Spec (Culbridge MVP)

## 1. NEPCVerificationService
**Endpoint**: POST /shipment/{id}/verify-nepc

**Input**: `{"exporter_name": "Olam Ltd"}`

**Output**: `{"status":"Valid", "expiry":"2026-12-31", "cert_type":"Non-Oil"}`

**Model**: `NEPCVerification(shipmentId, exporterName, status, expiryDate, certType, lastCheckedAt)`

**Logic**: Scrape nepc.gov.ng → parse → save → return.

## 2. NINASLabNetworkService
**Models**:
```
LabProvider(id, name="SGS", ninasAccredited, tests=["aflatoxin"])
LabBooking(shipmentId, labProviderId, testType, scheduledAt, status="Pending")
```

**Endpoints**:
- GET /lab-providers → list
- POST /shipment/{id}/book-lab `{"lab_provider_id":1, "test_type":"aflatoxin"}` → create booking.

## 3. Integration
Document upload → verify_nepc → if invalid BLOCKED.
"Book Lab" button → create LabBooking → status Pending → lab uploads TestResult.

**Timeline**: 1 day.
