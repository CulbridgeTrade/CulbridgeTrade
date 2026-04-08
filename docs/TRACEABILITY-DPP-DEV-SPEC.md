# Traceability & Digital Product Passport (DPP) — Dev Spec

**Objective**: Build end-to-end traceability engine from farm to port, with DPP PDF generation for EU importers.

---

## 1. Why Traceability Matters

### EU Requirements
- **Full traceability**: Farm → Factory → Port → Importer
- **Digital Product Passports (DPP)**: EU-wide requirement for all food products (2025+)
- DPP must include: origin, production method, MRL/aflatoxin results, EUDR compliance, sustainability

### Nigerian Problems
- **No farm-level GPS** for most exporters
- **No farmer ID** tracking
- **No chain-of-custody** from farm → aggregator → exporter → port
- **Manual records** (paper-based) that can't be verified

### What Culbridge Provides
- **Structured digital traceability** at every node
- **GPS verification** for farms
- **Quality control checkpoints** (storage, fumigation, moisture)
- **One-click DPP export** for EU importers

---

## 2. Data Models

```python
# models.py
class TraceabilityChain(models.Model):
    """Main chain linking all nodes"""
    shipment = models.ForeignKey('Shipment', on_delete=models.CASCADE)
    chain_complete = models.BooleanField(default=False)
    chain_status = models.CharField(max_length=20)  # "Complete", "Incomplete", "Partial"
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class FarmNode(models.Model):
    """Farm-level traceability"""
    chain = models.ForeignKey(TraceabilityChain, on_delete=models.CASCADE)
    
    # Farm Identification
    farm_name = models.CharField(max_length=200)
    farmer_id = models.CharField(max_length=100)  # Unique farmer ID
    cooperative_name = models.CharField(max_length=200, blank=True)
    cooperative_id = models.CharField(max_length=100, blank=True)
    
    # Location
    gps_latitude = models.DecimalField(max_digits=9, decimal_places=6)
    gps_longitude = models.DecimalField(max_digits=9, decimal_places=6)
    state = models.CharField(max_length=50)  # "Kano", "Oyo", "Kogi"
    lga = models.CharField(max_length=50)  # Local Government Area
    
    # Production Details
    crop_variety = models.CharField(max_length=100)  # "cocoa bean", "sesame seed"
    harvest_date = models.DateField()
    farm_size_hectares = models.DecimalField(max_digits=8, decimal_places=2)
    
    # Farm Practices
    irrigation_type = models.CharField(max_length=50)  # "rainfed", "irrigated"
    organic_certified = models.BooleanField(default=False)
    fair_trade_certified = models.BooleanField(default=False)
    
    created_at = models.DateTimeField(auto_now_add=True)

class ProcessingNode(models.Model):
    """Processing facility traceability"""
    chain = models.ForeignKey(TraceabilityChain, on_delete=models.CASCADE)
    
    # Factory Information
    factory_name = models.CharField(max_length=200)
    factory_id = models.CharField(max_length=100)
    gps_latitude = models.DecimalField(max_digits=9, decimal_places=6)
    gps_longitude = models.DecimalField(max_digits=9, decimal_places=6)
    state = models.CharField(max_length=50)
    
    # Processing Details
    processing_method = models.CharField(max_length=100)  # "sun-dried", "roasted", "fermented"
    processing_date = models.DateField()
    batch_number = models.CharField(max_length=100)
    
    # Certifications
    haccp_certified = models.BooleanField(default=False)
    iso_22000_certified = models.BooleanField(default=False)
    
    created_at = models.DateTimeField(auto_now_add=True)

class LogisticsNode(models.Model):
    """Port/logistics traceability"""
    chain = models.ForeignKey(TraceabilityChain, on_delete=models.CASCADE)
    
    # Port Information
    port_name = models.CharField(max_length=100)  # "Apapa", "Tin Can", "Onne"
    port_code = models.CharField(max_length=20)  # "NGAPP", "NGTIN", "NGONN"
    
    # Shipping Details
    departure_date = models.DateField()
    vessel_name = models.CharField(max_length=200, blank=True)
    container_number = models.CharField(max_length=50, blank=True)
    hs_code = models.CharField(max_length=10)
    
    # Documentation
    nxp_number = models.CharField(max_length=50)
    certificate_of_origin = models.CharField(max_length=50)
    
    created_at = models.DateTimeField(auto_now_add=True)

class QualityControl(models.Model):
    """Quality control checkpoints"""
    chain = models.ForeignKey(TraceabilityChain, on_delete=models.CASCADE)
    node_name = models.CharField(max_length=50)  # "farm", "processing", "port"
    
    # Storage Conditions
    storage_type = models.CharField(max_length=50)  # "warehouse", "silo", "container"
    storage_conditions = models.JSONField(default=dict)  # temperature, humidity
    
    # Fumigation
    fumigation_done = models.BooleanField(default=False)
    fumigation_date = models.DateField(null=True, blank=True)
    fumigation_method = models.CharField(max_length=100, blank=True)
    fumigation_chemical = models.CharField(max_length=100, blank=True)
    
    # Moisture Control
    moisture_content = models.DecimalField(max_digits=5, decimal_places=2, null=True)  # percentage
    moisture_tested = models.BooleanField(default=False)
    moisture_tested_date = models.DateField(null=True, blank=True)
    
    # Pest Control
    pest_control_done = models.BooleanField(default=False)
    pest_control_method = models.CharField(max_length=100, blank=True)
    
    # Lab Tests
    lab_tests = models.JSONField(default=list)  # [{test_type, result, lab_name, date}]
    
    created_at = models.DateTimeField(auto_now_add=True)

class TraceabilityCheckResult(models.Model):
    """Computed traceability status"""
    shipment = models.OneToOneField('Shipment', on_delete=models.CASCADE)
    
    has_farm_node = models.BooleanField(default=False)
    has_processing_node = models.BooleanField(default=False)
    has_logistics_node = models.BooleanField(default=False)
    has_quality_control = models.BooleanField(default=False)
    
    chain_complete = models.BooleanField(default=False)
    traceability_status = models.CharField(max_length=20)  # "Complete", "Incomplete", "Partial"
    missing_nodes = models.JSONField(default=list)
    
    checked_at = models.DateTimeField(auto_now=True)
```

---

## 3. Business Logic (Core Engine)

```python
# traceability_engine.py
from datetime import date

def get_or_create_chain(shipment):
    """Get existing chain or create new one"""
    chain, created = TraceabilityChain.objects.get_or_create(
        shipment=shipment,
        defaults={"chain_status": "Incomplete"}
    )
    return chain

def validate_farm_node(farm):
    """Validate farm node has required fields"""
    required = [
        farm.farm_name,
        farm.farmer_id,
        farm.gps_latitude,
        farm.gps_longitude,
        farm.harvest_date,
    ]
    return all(required)

def validate_processing_node(processing):
    """Validate processing node has required fields"""
    required = [
        processing.factory_name,
        processing.factory_id,
        processing.processing_method,
        processing.processing_date,
    ]
    return all(required)

def validate_logistics_node(logistics):
    """Validate logistics node has required fields"""
    required = [
        logistics.port_name,
        logistics.departure_date,
        logistics.hs_code,
        logistics.nxp_number,
    ]
    return all(required)

def compute_traceability(shipment):
    """Main traceability check"""
    chain = get_or_create_chain(shipment)
    missing_nodes = []
    
    # Check Farm Node
    farm = FarmNode.objects.filter(chain=chain).first()
    has_farm = farm and validate_farm_node(farm)
    if not has_farm:
        missing_nodes.append("Farm")
    
    # Check Processing Node
    processing = ProcessingNode.objects.filter(chain=chain).first()
    has_processing = processing and validate_processing_node(processing)
    if not has_processing:
        missing_nodes.append("Processing")
    
    # Check Logistics Node
    logistics = LogisticsNode.objects.filter(chain=chain).first()
    has_logistics = logistics and validate_logistics_node(logistics)
    if not has_logistics:
        missing_nodes.append("Logistics")
    
    # Check Quality Control
    qc = QualityControl.objects.filter(chain=chain).first()
    has_qc = qc is not None
    if not has_qc:
        missing_nodes.append("Quality Control")
    
    # Determine chain status
    chain_complete = has_farm and has_processing and has_logistics and has_qc
    
    if chain_complete:
        chain_status = "Complete"
    elif len(missing_nodes) <= 2:
        chain_status = "Partial"
    else:
        chain_status = "Incomplete"
    
    chain.chain_complete = chain_complete
    chain.chain_status = chain_status
    chain.save()
    
    # Save check result
    TraceabilityCheckResult.objects.update_or_create(
        shipment=shipment,
        defaults={
            "has_farm_node": has_farm,
            "has_processing_node": has_processing,
            "has_logistics_node": has_logistics,
            "has_quality_control": has_qc,
            "chain_complete": chain_complete,
            "traceability_status": chain_status,
            "missing_nodes": missing_nodes,
        }
    )
    
    return chain_complete, chain_status, missing_nodes

def calculate_final_compliance_status(shipment):
    """Integrate traceability into overall compliance"""
    trace_complete, trace_status, missing = compute_traceability(shipment)
    
    # Existing checks + Traceability
    if not trace_complete:
        shipment.final_status = "Blocked"
        shipment.blockers.append({
            "code": "TRACEABILITY_INCOMPLETE",
            "message": f"Missing traceability nodes: {', '.join(missing)}",
            "missing_nodes": missing,
        })
    else:
        # Check other blockers
        if shipment.eudr_compliance_status == "Non-Compliant":
            shipment.final_status = "Blocked"
        elif shipment.rasff_risk == "high" or shipment.mrl_violations > 0:
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
    # Traceability chain
    path('shipments/<int:shipment_id>/traceability/', TraceabilityView.as_view()),
    
    # Individual nodes
    path('shipments/<int:shipment_id>/farm/', FarmNodeView.as_view()),
    path('shipments/<int:shipment_id>/processing/', ProcessingNodeView.as_view()),
    path('shipments/<int:shipment_id>/logistics/', LogisticsNodeView.as_view()),
    path('shipments/<int:shipment_id>/quality/', QualityControlView.as_view()),
    
    # DPP Export
    path('shipments/<int:shipment_id>/dpp-pdf/', DPPPDFView.as_view()),
]
```

```python
# views.py
class FarmNodeView(APIView):
    def get(self, request, shipment_id):
        shipment = get_object_or_404(Shipment, id=shipment_id)
        chain = TraceabilityChain.objects.filter(shipment=shipment).first()
        
        if not chain:
            return Response({"exists": False})
        
        farm = FarmNode.objects.filter(chain=chain).first()
        
        if not farm:
            return Response({"exists": False})
        
        return Response(serialize_farm(farm))
    
    def post(self, request, shipment_id):
        shipment = get_object_or_404(Shipment, id=shipment_id)
        chain = get_or_create_chain(shipment)
        
        farm, created = FarmNode.objects.update_or_create(
            chain=chain,
            defaults={
                "farm_name": request.data.get("farm_name"),
                "farmer_id": request.data.get("farmer_id"),
                "cooperative_name": request.data.get("cooperative_name", ""),
                "gps_latitude": request.data.get("gps_latitude"),
                "gps_longitude": request.data.get("gps_longitude"),
                "state": request.data.get("state"),
                "lga": request.data.get("lga"),
                "crop_variety": request.data.get("crop_variety"),
                "harvest_date": request.data.get("harvest_date"),
                "farm_size_hectares": request.data.get("farm_size_hectares"),
                "irrigation_type": request.data.get("irrigation_type"),
                "organic_certified": request.data.get("organic_certified", False),
                "fair_trade_certified": request.data.get("fair_trade_certified", False),
            }
        )
        
        calculate_final_compliance_status(shipment)
        
        return Response({"status": "saved", "farm_id": farm.id})

class DPPPDFView(APIView):
    def get(self, request, shipment_id):
        shipment = get_object_or_404(Shipment, id=shipment_id)
        chain = TraceabilityChain.objects.filter(shipment=shipment).first()
        
        if not chain:
            return Response({"error": "No traceability chain"}, status=404)
        
        # Generate DPP
        pdf = generate_dpp_pdf(chain, shipment)
        
        return FileResponse(pdf, as_attachment=True, filename=f"DPP_{shipment.id}.pdf")
```

---

## 5. Table Integration (Your MVP UI)

**Update ShipmentTable columns**:

| Column | Value Source | Color Logic |
|--------|--------------|-------------|
| **Traceability** | `TraceabilityCheckResult.traceability_status` | Green=Complete, Yellow=Partial, Red=Incomplete |
| **Farm Data** | `FarmNode.farm_name` | Green=Present, Red=Missing |
| **Processing** | `ProcessingNode.factory_name` | Green=Present, Red=Missing |
| **Quality** | `QualityControl.moisture_content` | Show value or "Not tested" |

**Action Buttons**:
- **"Add Farm"** → GPS picker form
- **"Add Processing"** → Factory details form
- **"Add Logistics"** → Port/shipping form
- **"Add QC"** → Storage/fumigation/moisture form
- **"Export DPP"** → Download PDF

---

## 6. Digital Product Passport (DPP) PDF

```python
def generate_dpp_pdf(chain, shipment):
    """Generate DPP PDF for EU importers"""
    farm = FarmNode.objects.filter(chain=chain).first()
    processing = ProcessingNode.objects.filter(chain=chain).first()
    logistics = LogisticsNode.objects.filter(chain=chain).first()
    qc = QualityControl.objects.filter(chain=chain).first()
    eudr = EUDRCheckResult.objects.filter(shipment=shipment).first()
    mrl = MRLCheckResult.objects.filter(shipment=shipment).first()
    
    context = {
        "shipment_id": shipment.id,
        "reference": shipment.reference_number,
        "commodity": shipment.commodity,
        "destination": shipment.destination,
        
        # Farm
        "farm": {
            "name": farm.farm_name if farm else None,
            "farmer_id": farm.farmer_id if farm else None,
            "gps": f"{farm.gps_latitude}, {farm.gps_longitude}" if farm else None,
            "state": farm.state if farm else None,
            "harvest_date": farm.harvest_date if farm else None,
        } if farm else None,
        
        # Processing
        "processing": {
            "factory": processing.factory_name if processing else None,
            "method": processing.processing_method if processing else None,
            "batch": processing.batch_number if processing else None,
        } if processing else None,
        
        # Logistics
        "logistics": {
            "port": logistics.port_name if logistics else None,
            "departure": logistics.departure_date if logistics else None,
            "hs_code": logistics.hs_code if logistics else None,
            "nxp": logistics.nxp_number if logistics else None,
        } if logistics else None,
        
        # Quality
        "quality": {
            "moisture": qc.moisture_content if qc else None,
            "fumigation": qc.fumigation_done if qc else False,
            "lab_tests": qc.lab_tests if qc else [],
        } if qc else None,
        
        # Compliance
        "eudr": {
            "status": eudr.compliance_status if eudr else "N/A",
            "deforestation_free": eudr.has_geolocation if eudr else False,
        } if eudr else None,
        
        "mrl": {
            "status": mrl.overall_status if mrl else "N/A",
            "violations": mrl.total_violations if mrl else 0,
        } if mrl else None,
        
        "generated_at": timezone.now(),
    }
    
    template = loader.get_template('dpp_certificate.html')
    pdf = render_to_pdf(template, context)
    return pdf
```

**DPP PDF Output**:
```
═══════════════════════════════════════════════════════════════════
              DIGITAL PRODUCT PASSPORT (DPP)
═══════════════════════════════════════════════════════════════════
Shipment ID:        CBR-2025-00123
Reference:         DPP-2025-CBR-00123
Commodity:          Sesame Seeds (HS 1207)
Destination:        Netherlands (NL)
Generated:          2025-01-15
───────────────────────────────────────────────────────────────────
1. ORIGIN (Farm)
───────────────────────────────────────────────────────────────────
Farm Name:          Kano Cooperative
Farmer ID:          FRM-089234
GPS Coordinates:    12.0021, 8.5912
Location:           Kano State, Nigeria
Harvest Date:       2024-08-15
───────────────────────────────────────────────────────────────────
2. PROCESSING
───────────────────────────────────────────────────────────────────
Factory:            Lagos Processing Ltd
Processing Method:  Sun-dried & cleaned
Batch Number:       LPL-2024-0891
───────────────────────────────────────────────────────────────────
3. LOGISTICS
───────────────────────────────────────────────────────────────────
Port:               Apapa Port (Lagos)
Departure Date:     2024-10-01
HS Code:            1207.40
NXP Number:         NXP-NG-2024-0891
CoO:                NG/CO/2024/0891
───────────────────────────────────────────────────────────────────
4. QUALITY CONTROL
───────────────────────────────────────────────────────────────────
Moisture Content:   6.8%
Fumigation:         ✓ Done (2024-09-15)
Lab Tests:          
  - Aflatoxin Total: 2.1 μg/kg (Pass)
  - Aflatoxin B1:    0.8 μg/kg (Pass)
───────────────────────────────────────────────────────────────────
5. COMPLIANCE
───────────────────────────────────────────────────────────────────
EUDR Status:        ✓ Compliant (GPS + Legal Proof)
MRL Status:         ✓ Pass (0 violations)
RASFF Risk:         Low
───────────────────────────────────────────────────────────────────
TRACEABILITY STATUS: ✓ COMPLETE
All nodes verified and chain complete.
═══════════════════════════════════════════════════════════════════
         Culbridge Trade Compliance Platform
═══════════════════════════════════════════════════════════════════
```

---

## 7. Quality Improvement Guidance

When Traceability = Incomplete, show:

```
❌ Traceability Incomplete

Missing: Farm, Processing

To fix, add:
1. Farm Data: Farm name, farmer ID, GPS coordinates, harvest date
2. Processing Data: Factory name, processing method, batch number
3. Logistics Data: Port, departure date, NXP number
4. Quality Control: Moisture test, fumigation record

Tip: Complete traceability for faster EU customs clearance.
```

---

## 8. Testing Scenarios

```
Scenario 1: All nodes complete
→ TraceabilityCheckResult.traceability_status = "Complete"
→ Chain complete, DPP exportable
→ Shipment.final_status based on other checks

Scenario 2: Missing farm node only
→ TraceabilityCheckResult.traceability_status = "Partial"
→ Missing: ["Farm"]
→ Shipment.final_status = "Blocked"

Scenario 3: No chain at all
→ TraceabilityCheckResult.traceability_status = "Incomplete"
→ Missing: ["Farm", "Processing", "Logistics", "Quality Control"]
→ Shipment.final_status = "Blocked"

Scenario 4: DPP export with incomplete chain
→ Return error: "Cannot export DPP. Complete traceability first."
```

---

## 9. What Senior Devs Need to Build

### Phase 1: Data Models & CRUD
- TraceabilityChain, FarmNode, ProcessingNode, LogisticsNode, QualityControl
- REST endpoints for each node type

### Phase 2: Validation Engine
- `validate_farm_node()`, `validate_processing_node()`, etc.
- `compute_traceability()` — determine chain status

### Phase 3: Integration
- Hook into compliance engine
- Block shipments with incomplete traceability

### Phase 4: DPP Export
- PDF generation with all nodes
- EU importer-ready format

---

## 10. Integration with Full Compliance Engine

```
Shipment Submission
       ↓
┌──────────────────┐
│  Compliance Engine │ ←── Central orchestrator
└────────┬─────────┘
         ↓
   ┌─────┼─────┼───────┼───────┬──────────┐
   ↓     ↓     ↓       ↓       ↓          ↓
┌─────┐ ┌─────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│RASFF│ │ MRL │ │ EUDR │ │ Docs │ │Trace │ │Other │
│Check│ │Check│ │Check │ │Check │ │Check │ │Check │
└─────┘ └─────┘ └──────┘ └──────┘ └──────┘ └──────┘
   ↓     ↓     ↓       ↓       ↓
   └─────┼─────┼───────┴───────┘
         ↓
┌──────────────────┐
│  Final Status:   │
│  OK / Warning /  │
│  Blocked         │
└──────────────────┘
         ↓
┌──────────────────┐
│  DPP Export      │
│  (if complete)   │
└──────────────────┘
```

---

## 11. Success Criteria

- **Exporters can add all traceability nodes** → **complete chain**.
- **Table shows chain status** → **internal team can triage**.
- **Incomplete chains blocked** → **no incomplete shipments**.
- **DPP PDF generated** → **EU importer-ready documentation**.
- **Quality checkpoints visible** → **moisture, fumigation, lab tests**.

---

**Send this to your senior dev team** — it's **100% build-ready**, **no fluff**, **pure spec**. They can start **coding today**.
