# 📄 Document Management & Versioning – Dev Spec (Culbridge MVP)

## 1. Models
```
Document(id, shipmentId, type="invoice", url=S3, status="Uploaded|Verified", uploadedBy, versionId)
DocumentVersion(id, documentId, previousVersionId=null, url, status, reason="Fixed...", createdAt)
```

## 2. APIs
**POST /shipment/{id}/document** `{"file":bytes, "type":"lab_report"}` → create first version.

**GET /shipment/{id}/documents** → list w/ current version.

**PATCH /document/{id}/version** `{"file":bytes, "reason":"Fixed HS"}` → new version chain.

**POST /document/{id}/status** `{"status":"Verified"}`.

## 3. Logic
Upload → S3 → create Document + Version1.
Replace → new S3 → Version2 (previous=Version1) → update Document.versionId.

## 4. UI
Shipment docs list:
1. Invoice [Verified] [View PDF] [Replace]
Version history inline.

## 5. Checklist
[x] Models
[x] 4 APIs
[x] S3 upload
[x] UI list/preview

**Timeline**: 1 day.
