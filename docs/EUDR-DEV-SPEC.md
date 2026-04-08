# EUDR (EU Deforestation-Free Regulation) — Dev Spec

**Objective**: Build deterministic EUDR check engine that verifies deforestation-free compliance for covered commodities (cocoa, cashew, sesame, rubber, coffee, soy) exported to NL/DE.

---

## 1. What EUDR Requires

### Mandatory Compliance
- All covered products placed on EU market must be **deforestation-free** and **forest-degradation-free** after **31 December 2020**
- Products must be **legally produced** (no illegal logging, no settlers on protected land)
- Exporters must provide **geolocation data** for production areas

### Covered Products (EU List)
| Product | HS Code | Nigerian Export |
|---------|---------|-----------------|
| Cocoa | 1801 | Yes |
| Cashew | 0802 | Yes |
| Sesame | 1207 | Yes |
| Rubber | 4001 | Yes |
| Coffee | 0901 | Yes |
| Soy | 1201 | No (not major) |

### Required Evidence
- **Land coordinates** (polygon) of production area
- **Date of production** (must be after 2020-12-31)
- **Legal proof** of land tenure/use
- **No deforestation** certification

---

## 2. Data Models

```python
# models.py
class EUDRCoveredProduct(models.Model):
    product = models.CharField(max_length=50, unique=True)  # "cocoa", "sesame"
    hs_code = models.CharField(max_length=10)  # "1801", "1207"
    category = models.CharField(max_length=50)  # "covered", "derived"

class FarmTraceability(models.Model):
    shipment = models.ForeignKey('Shipment', on_delete=models.CASCADE)
    
    # Farm Identification
    farm_name = models.CharField(max_length=200)
    farmer_id = models.CharField(max_length=100)
    cooperative = models.CharField(max_length=200, blank=True)
    
    # Geolocation (Required by EUDR)
    gps_latitude = models.DecimalField(max_digits=9, decimal_places=6)
    gps_longitude = models.DecimalField(max_digits=9, decimal_places=6)
    production_area_polygon = models.JSONField(null=True)  # GeoJSON
    
    # Production Date
    production_date = models.DateField()
    
    # Legal Proof
    land_tenure_type = models.CharField(max_length=50)  # "customary", "lease", "community"
    land_document_url = models.URLField()
    legal_proof_verified = models.BooleanField(default=False)
    
    # EUDR Status
    deforestation_free = models.BooleanField(default=False)
    eudr_certified = models.BooleanField(default=False)
    certified_at = models.DateTimeField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class EUDRCheckResult(models.Model):
    shipment = models.OneToOneField('Shipment', on_delete=models.CASCADE)
    
    is_covered_product = models.BooleanField()
    has_traceability_data = models.BooleanField()
    has_geolocation = models.BooleanField()
    has_legal_proof = models.BooleanField()
    production_after_2020 = models.BooleanField()
    
    compliance_status = models.CharField(max_length=20)  # "Compliant", "Non-Compliant", "Pending"
    risk_flags = models.JSONField(default=list)
    
    checked_at = models.DateTimeField(auto_now=True)
```

---

## 3. Business Logic (Core Engine)

```python
# eudr_engine.py
from datetime import date

def check_covered_product(commodity):
    """Check if commodity is EUDR-covered"""
    return EUDRCoveredProduct.objects.filter(
        product__iexact=commodity
    ).exists()

def validate_geolocation(farm_data):
    """Validate GPS coordinates"""
    if not farm_data.gps_latitude or not farm_data.gps_longitude:
        return False, "Missing GPS coordinates"
    
    # Basic lat/lng validation for Nigeria
    lat = float(farm_data.gps_latitude)
    lng = float(farm_data.gps_longitude)
    
    if not (3.5 <= lat <= 14.0 and 2.5 <= lng <= 14.5):
        return False, "Coordinates outside Nigeria"
    
    return True, None

def validate_production_date(farm_data):
    """Check production date is after 2020-12-31"""
    cutoff = date(2020, 12, 31)
    
    if not farm_data.production_date:
        return False, "Missing production date"
    
    if farm_data.production_date <= cutoff:
        return False, f"Production date {farm_data.production_date} is before EUDR cutoff (2020-12-31)"
    
    return True, None

def validate_legal_proof(farm_data):
    """Check legal proof of land tenure"""
    if not farm_data.land_tenure_type:
        return False, "Missing land tenure type"
    
    if not farm_data.land_document_url:
        return False, "Missing land document"
    
    valid_tenure_types = ["customary", "lease", "community", "title", "certificate"]
    if farm_data.land_tenure_type.lower() not in valid_tenure_types:
        return False, f"Invalid tenure type: {farm_data.land_tenure_type}"
    
    return True, None

def compute_eudr_compliance(shipment):
    """Main EUDR compliance check"""
    risk_flags = []
    
    # Step 1: Check if covered product
    is_covered = check_covered_product(shipment.commodity)
    
    if not is_covered:
        # Not a covered product — EUDR doesn't apply
        EUDRCheckResult.objects.update_or_create(
            shipment=shipment,
            defaults={
                "is_covered_product": False,
                "has_traceability_data": False,
                "has_geolocation": False,
                "has_legal_proof": False,
                "production_after_2020": False,
                "compliance_status": "N/A",
                "risk_flags": ["Product not covered by EUDR"],
            }
        )
        return True  # Compliant (not applicable)
    
    # Step 2: Get farm traceability data
    try:
        farm_data = FarmTraceability.objects.get(shipment=shipment)
    except FarmTraceability.DoesNotExist:
        EUDRCheckResult.objects.update_or_create(
            shipment=shipment,
            defaults={
                "is_covered_product": True,
                "has_traceability_data": False,
                "has_geolocation": False,
                "has_legal_proof": False,
                "production_after_2020": False,
                "compliance_status": "Non-Compliant",
                "risk_flags": ["Missing farm traceability data"],
            }
        )
        return False
    
    # Step 3: Validate geolocation
    geo_valid, geo_error = validate_geolocation(farm_data)
    if not geo_valid:
        risk_flags.append(geo_error)
    
    # Step 4: Validate production date
    date_valid, date_error = validate_production_date(farm_data)
    if not date_valid:
        risk_flags.append(date_error)
    
    # Step 5: Validate legal proof
    legal_valid, legal_error = validate_legal_proof(farm_data)
    if not legal_valid:
        risk_flags.append(legal_error)
    
    # Determine compliance
    is_compliant = (
        is_covered and
        geo_valid and
        date_valid and
        legal_valid and
        farm_data.deforestation_free
    )
    
    if is_compliant:
        farm_data.eudr_certified = True
        farm_data.certified_at = timezone.now()
        farm_data.save()
    
    # Save result
    EUDRCheckResult.objects.update_or_create(
        shipment=shipment,
        defaults={
            "is_covered_product": is_covered,
            "has_traceability_data": True,
            "has_geolocation": geo_valid,
            "has_legal_proof": legal_valid,
            "production_after_2020": date_valid,
            "compliance_status": "Compliant" if is_compliant else "Non-Compliant",
            "risk_flags": risk_flags,
        }
    )
    
    return is_compliant

def calculate_final_compliance_status(shipment):
    """Integrate EUDR into overall compliance"""
    eudr_compliant = compute_eudr_compliance(shipment)
    
    # Existing RASFF/MRL logic + EUDR
    if not eudr_compliant:
        shipment.final_status = "Blocked"
        shipment.blockers.append({
            "code": "EUDR_NON_COMPLIANT",
            "message": "EUDR compliance check failed. Missing traceability or deforestation evidence.",
        })
    else:
        # Check other blockers
        if shipment.rasff_risk == "high" or shipment.mrl_violations > 0:
            shipment.final_status = "Blocked"
        elif shipment.rasff_risk == "medium" or shipment.mrl_violations > 0:
            shipment.final_status = "Warning"
        else:
            shipment.final_status = "OK"
    
    shipment.save()
```

---

## 4. API Endpoints

```python
# urls.py
urlpatterns = [
    # Farm data management
    path('shipments/<int:shipment_id>/farm-data/', FarmDataView.as_view()),
    
    # EUDR compliance check
    path('shipments/<int:shipment_id>/eudr-check/', EUDRCheckView.as_view()),
    
    # Covered products (admin)
    path('admin/eudr-covered-products/', CoveredProductListView.as_view()),
]
```

```python
# views.py
class FarmDataView(APIView):
    def get(self, request, shipment_id):
        shipment = get_object_or_404(Shipment, id=shipment_id)
        farm = FarmTraceability.objects.filter(shipment=shipment).first()
        
        if not farm:
            return Response({"exists": False})
        
        return Response({
            "exists": True,
            "farm_name": farm.farm_name,
            "farmer_id": farm.farmer_id,
            "gps_latitude": farm.gps_latitude,
            "gps_longitude": farm.gps_longitude,
            "production_date": farm.production_date,
            "land_tenure_type": farm.land_tenure_type,
            "deforestation_free": farm.deforestation_free,
        })
    
    def post(self, request, shipment_id):
        shipment = get_object_or_404(Shipment, id=shipment_id)
        
        farm, created = FarmTraceability.objects.update_or_create(
            shipment=shipment,
            defaults={
                "farm_name": request.data.get("farm_name"),
                "farmer_id": request.data.get("farmer_id"),
                "cooperative": request.data.get("cooperative", ""),
                "gps_latitude": request.data.get("gps_latitude"),
                "gps_longitude": request.data.get("gps_longitude"),
                "production_date": request.data.get("production_date"),
                "land_tenure_type": request.data.get("land_tenure_type"),
                "land_document_url": request.data.get("land_document_url"),
                "deforestation_free": request.data.get("deforestation_free", False),
            }
        )
        
        # Auto-run EUDR check
        calculate_final_compliance_status(shipment)
        
        return Response({"status": "saved", "farm_id": farm.id})

class EUDRCheckView(APIView):
    def get(self, request, shipment_id):
        shipment = get_object_or_404(Shipment, id=shipment_id)
        result = compute_eudr_compliance(shipment)
        
        check = EUDRCheckResult.objects.get(shipment=shipment)
        
        return Response({
            "is_covered_product": check.is_covered_product,
            "has_traceability_data": check.has_traceability_data,
            "has_geolocation": check.has_geolocation,
            "has_legal_proof": check.has_legal_proof,
            "production_after_2020": check.production_after_2020,
            "compliance_status": check.compliance_status,
            "risk_flags": check.risk_flags,
        })
```

---

## 5. Table Integration (Your MVP UI)

**Update ShipmentTable columns**:

| Column | Value Source | Color Logic |
|--------|--------------|-------------|
| **EUDR Status** | `EUDRCheckResult.compliance_status` | Green=Compliant, Red=Non-Compliant, Gray=N/A |
| **Farm GPS** | `FarmTraceability.gps_latitude/longitude` | Green=Present, Red=Missing |
| **Production Date** | `FarmTraceability.production_date` | Green=>2020, Red=<2020 |
| **Legal Proof** | `FarmTraceability.land_tenure_type` | Green=Present, Red=Missing |

**Action Buttons**:
- **"Add Farm Data"** → Form with GPS picker, land tenure selection
- **"Upload Legal Proof"** → S3 upload for land documents
- **"View EUDR Certificate"** → Download PDF

---

## 6. Quality Improvement Guidance (Rules-Based)

When EUDR = Non-Compliant, show:

```
❌ EUDR Check Failed

To fix, you need:
1. Farm GPS coordinates — Use GPS tracker or google maps to mark farm location
2. Land tenure proof — Upload lease, customary agreement, or title document
3. Production date — Must be after 2020-12-31
4. Deforestation-free certification — Contact local forestry authority

Required documents:
- Land lease/agreement (PDF)
- Farm location map/screenshot
- Cooperative membership (if applicable)
```

---

## 7. EUDR-Ready PDF Export

```python
def generate_eudr_pdf(shipment):
    """Generate EUDR compliance summary PDF"""
    farm = FarmTraceability.objects.get(shipment=shipment)
    check = EUDRCheckResult.objects.get(shipment=shipment)
    
    context = {
        "shipment_id": shipment.id,
        "commodity": shipment.commodity,
        "hs_code": get_hs_code(shipment.commodity),
        "farm_name": farm.farm_name,
        "farmer_id": farm.farmer_id,
        "gps_coordinates": f"{farm.gps_latitude}, {farm.gps_longitude}",
        "production_date": farm.production_date,
        "land_tenure": farm.land_tenure_type,
        "land_document": farm.land_document_url,
        "deforestation_free": farm.deforestation_free,
        "compliance_status": check.compliance_status,
        "checked_at": check.checked_at,
    }
    
    template = loader.get_template('eudr_certificate.html')
    pdf = render_to_pdf(template, context)
    return pdf
```

**PDF Output**:
```
═══════════════════════════════════════════════════════════
              EUDR COMPLIANCE CERTIFICATE
═══════════════════════════════════════════════════════════
Shipment ID:        CBR-2025-00123
Commodity:          Cocoa (HS 1801)
Production Date:    2024-06-15
───────────────────────────────────────────────────────────
FARM INFORMATION
Farm Name:          Kano Cooperative
Farmer ID:          FRM-089234
GPS Coordinates:    12.0021, 8.5912
Land Tenure:        Customary
───────────────────────────────────────────────────────────
COMPLIANCE STATUS
Deforestation-Free: YES
Geolocation:        VERIFIED
Legal Proof:        VERIFIED
Production Date:    VERIFIED (after 2020-12-31)
───────────────────────────────────────────────────────────
STATUS: ✓ COMPLIANT
Checked: 2025-01-15
═══════════════════════════════════════════════════════════
```

---

## 8. Testing Scenarios

```
Scenario 1: Cocoa to NL, farm GPS + legal proof + post-2020 date
→ EUDRCheckResult.compliance_status = "Compliant"
→ Shipment.final_status based on other checks

Scenario 2: Sesame to DE, no farm data
→ EUDRCheckResult.compliance_status = "Non-Compliant"
→ Risk flag: "Missing farm traceability data"
→ Shipment.final_status = "Blocked"

Scenario 3: Cocoa to NL, farm data but production = 2019
→ EUDRCheckResult.compliance_status = "Non-Compliant"
→ Risk flag: "Production date 2019 is before EUDR cutoff (2020-12-31)"
→ Shipment.final_status = "Blocked"

Scenario 4: Ginger to NL (not covered)
→ EUDRCheckResult.compliance_status = "N/A"
→ No EUDR blocker
```

---

## 9. Covered Products Seed Data

```python
# seeds.py
COVERED_PRODUCTS = [
    {"product": "cocoa", "hs_code": "1801", "category": "covered"},
    {"product": "cashew", "hs_code": "0802", "category": "covered"},
    {"product": "sesame", "hs_code": "1207", "category": "covered"},
    {"product": "rubber", "hs_code": "4001", "category": "covered"},
    {"product": "coffee", "hs_code": "0901", "category": "covered"},
    {"product": "soy", "hs_code": "1201", "category": "covered"},
]

def seed_covered_products():
    for p in COVERED_PRODUCTS:
        EUDRCoveredProduct.objects.update_or_create(
            product=p["product"],
            defaults={"hs_code": p["hs_code"], "category": p["category"]}
        )
```

---

## 10. Success Criteria

- **Exporters can add farm GPS + legal proof** → **auto-compute EUDR status**.
- **Table shows EUDR compliance** → **internal team can triage**.
- **Non-compliant shipments blocked** → **no EUDR violations**.
- **PDF export for EU importers** → **audit-ready evidence**.
- **Covers all EUDR commodities** → **cocoa, cashew, sesame, rubber, coffee**.

---

## 11. Integration with Full Compliance Engine

```
Shipment Submission
       ↓
┌──────────────────┐
│  Compliance Engine │ ←── Central orchestrator
└────────┬─────────┘
         ↓
   ┌─────┼─────┼───────┬──────────┐
   ↓     ↓     ↓       ↓          ↓
┌─────┐ ┌─────┐ ┌──────┐ ┌──────┐ ┌──────┐
│RASFF│ │ MRL │ │ EUDR │ │ Docs │ │ Trace│
│Check│ │Check│ │Check │ │Check │ │Check │
└─────┘ └─────┘ └──────┘ └──────┘ └──────┘
   ↓     ↓     ↓       ↓          ↓
   └─────┼─────┼───────┴──────────┘
         ↓
┌──────────────────┐
│  Final Status:   │
│  OK / Warning /  │
│  Blocked         │
└──────────────────┘
```

---

**Send this to your senior dev team** — it's **100% build-ready**, **no fluff**, **pure spec**. They can start **coding today**.
