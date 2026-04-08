/**
 * Deterministic Evaluation Engine - Phase 1 Complete
 * 
 * Covers: 5 Products × 2 Corridors = 10 Rule Sets
 * Products: Cocoa, Sesame, Ginger, Shea Butter, Beans
 * Corridors: Nigeria→Netherlands (Rotterdam), Nigeria→Germany (Hamburg)
 * 
 * Returns PASS | BLOCKED | RISK | PENDING_REVIEW | UNCERTAIN
 */

const RULE_REGISTRY = {
  // ============================================
  // COCOA BEANS - ROTTERDAM (NL)
  // ============================================
  'cocoa_beans-netherlands': [
    {
      rule_id: 'eu_cocoa_ochratoxin_v1', type: 'requirement',
      conditions: [{ field: 'lab_results.ochratoxin_a', operator: '<=', value: 2.0 }],
      fail_if: 'lab_results.ochratoxin_a > 2.0', failure_reason: 'ochratoxin_exceeds_limit',
      source: 'EU Reg 2023/915', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_cocoa_cadmium_v1', type: 'requirement',
      conditions: [{ field: 'lab_results.cadmium', operator: '<=', value: 0.3 }],
      fail_if: 'lab_results.cadmium > 0.3', failure_reason: 'cadmium_exceeds_limit',
      source: 'EU Reg 2023/915', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_cocoa_aflatoxin_b1_v1', type: 'requirement',
      conditions: [{ field: 'lab_results.aflatoxin_b1', operator: '<=', value: 2.0 }],
      fail_if: 'lab_results.aflatoxin_b1 > 2.0', failure_reason: 'aflatoxin_b1_exceeds_limit',
      source: 'EU Reg 2023/915', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_cocoa_aflatoxin_total_v1', type: 'requirement',
      conditions: [{ field: 'lab_results.aflatoxin_total', operator: '<=', value: 4.0 }],
      fail_if: 'lab_results.aflatoxin_total > 4.0', failure_reason: 'aflatoxin_total_exceeds_limit',
      source: 'EU Reg 2023/915', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_cocoa_moisture_v1', type: 'requirement',
      conditions: [{ field: 'lab_results.moisture', operator: '<=', value: 7.5 }],
      fail_if: 'lab_results.moisture > 7.5', failure_reason: 'moisture_exceeds_limit',
      source: 'EU Reg 2023/915', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_cocoa_salmonella_v1', type: 'requirement',
      conditions: [{ field: 'lab_results.salmonella', operator: '==', value: false }],
      fail_if: 'lab_results.salmonella === true', failure_reason: 'salmonella_detected',
      source: 'EU Reg 2019/2072', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_cocoa_coo_v1', type: 'document', requires: ['certificate_of_origin'],
      failure_reason: 'certificate_of_origin_missing',
      source: 'NEPC/Chambers', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_cocoa_phyto_v1', type: 'document', requires: ['phytosanitary_certificate'],
      failure_reason: 'phytosanitary_certificate_missing',
      source: 'EU 2019/2072', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_cocoa_cci_v1', type: 'document', requires: ['cci'],
      failure_reason: 'cci_missing',
      source: 'Nigeria Customs', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_cocoa_eur1_v1', type: 'document', requires: ['eur1_certificate'],
      failure_reason: 'eur1_certificate_missing',
      source: 'Nigeria Customs', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_cocoa_form_nxp_v1', type: 'document', requires: ['form_nxp'],
      failure_reason: 'form_nxp_missing',
      source: 'Central Bank of Nigeria', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    }
  ],

  // ============================================
  // COCOA BEANS - HAMBURG (DE)
  // ============================================
  'cocoa_beans-germany': [
    {
      rule_id: 'eu_cocoa_ochratoxin_v1_de', type: 'requirement',
      conditions: [{ field: 'lab_results.ochratoxin_a', operator: '<=', value: 2.0 }],
      fail_if: 'lab_results.ochratoxin_a > 2.0', failure_reason: 'ochratoxin_exceeds_limit',
      source: 'EU Reg 2023/915', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_cocoa_cadmium_v1_de', type: 'requirement',
      conditions: [{ field: 'lab_results.cadmium', operator: '<=', value: 0.3 }],
      fail_if: 'lab_results.cadmium > 0.3', failure_reason: 'cadmium_exceeds_limit',
      source: 'EU Reg 2023/915', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_cocoa_aflatoxin_b1_v1_de', type: 'requirement',
      conditions: [{ field: 'lab_results.aflatoxin_b1', operator: '<=', value: 2.0 }],
      fail_if: 'lab_results.aflatoxin_b1 > 2.0', failure_reason: 'aflatoxin_b1_exceeds_limit',
      source: 'EU Reg 2023/915', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_cocoa_aflatoxin_total_v1_de', type: 'requirement',
      conditions: [{ field: 'lab_results.aflatoxin_total', operator: '<=', value: 4.0 }],
      fail_if: 'lab_results.aflatoxin_total > 4.0', failure_reason: 'aflatoxin_total_exceeds_limit',
      source: 'EU Reg 2023/915', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_cocoa_pesticide_v1_de', type: 'requirement',
      conditions: [{ field: 'lab_results.pesticide_residue', operator: '<=', value: 0.1 }],
      fail_if: 'lab_results.pesticide_residue > 0.1', failure_reason: 'pesticide_exceeds_mrl',
      source: 'EU Reg 396/2005', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_cocoa_salmonella_v1_de', type: 'requirement',
      conditions: [{ field: 'lab_results.salmonella', operator: '==', value: false }],
      fail_if: 'lab_results.salmonella === true', failure_reason: 'salmonella_detected',
      source: 'EU Reg 2019/2072', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_cocoa_coo_v1_de', type: 'document', requires: ['certificate_of_origin'],
      failure_reason: 'certificate_of_origin_missing',
      source: 'NEPC/Chambers', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_cocoa_phyto_v1_de', type: 'document', requires: ['phytosanitary_certificate'],
      failure_reason: 'phytosanitary_certificate_missing',
      source: 'EU 2019/2072', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_cocoa_cci_v1_de', type: 'document', requires: ['cci'],
      failure_reason: 'cci_missing',
      source: 'Nigeria Customs', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_cocoa_pesticide_test_de', type: 'document', requires: ['pesticide_test_report'],
      failure_reason: 'pesticide_test_report_missing',
      source: 'EU Reg 396/2005', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    }
  ],

  // ============================================
  // SESAME - ROTTERDAM (NL) + RASFF FLAG
  // ============================================
  'sesame-netherlands': [
    {
      rule_id: 'eu_sesame_rasff_2025', type: 'conditional',
      conditions: [],
      failure_reason: 'active_rasff_alert',
      source: 'RASFF Window 2024-2025', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null },
      triggers_review: true, review_reason: 'Active RASFF alerts for Nigerian sesame'
    },
    {
      rule_id: 'eu_sesame_aflatoxin_b1_v1', type: 'requirement',
      conditions: [{ field: 'lab_results.aflatoxin_b1', operator: '<=', value: 5.0 }],
      fail_if: 'lab_results.aflatoxin_b1 > 5.0', failure_reason: 'aflatoxin_b1_exceeds_limit',
      source: 'EU Reg 2023/915', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_sesame_aflatoxin_total_v1', type: 'requirement',
      conditions: [{ field: 'lab_results.aflatoxin_total', operator: '<=', value: 10.0 }],
      fail_if: 'lab_results.aflatoxin_total > 10.0', failure_reason: 'aflatoxin_total_exceeds_limit',
      source: 'EU Reg 2023/915', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_sesame_ethylene_oxide_v1', type: 'requirement',
      conditions: [{ field: 'lab_results.ethylene_oxide', operator: '<=', value: 0.02 }],
      fail_if: 'lab_results.ethylene_oxide > 0.02', failure_reason: 'ethylene_oxide_exceeds_limit',
      source: 'EU Reg 396/2005', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_sesame_salmonella_v1', type: 'requirement',
      conditions: [{ field: 'lab_results.salmonella_detected', operator: '==', value: false }],
      fail_if: 'lab_results.salmonella_detected === true', failure_reason: 'salmonella_detected',
      source: 'EU Reg 2073/2005', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_sesame_phyto_v1', type: 'document', requires: ['phytosanitary_certificate'],
      failure_reason: 'phytosanitary_certificate_missing',
      source: 'NAQS Nigeria', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_sesame_eur1_v1', type: 'document', requires: ['eur1_certificate'],
      failure_reason: 'eur1_certificate_missing',
      source: 'Nigeria Customs', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_sesame_form_nxp_v1', type: 'document', requires: ['form_nxp'],
      failure_reason: 'form_nxp_missing',
      source: 'CBN', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_sesame_aflatoxin_test_v1', type: 'document', requires: ['aflatoxin_test_report'],
      failure_reason: 'aflatoxin_test_report_missing',
      source: 'EU Reg 2023/915', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_sesame_eto_test_v1', type: 'document', requires: ['ethylene_oxide_test_report'],
      failure_reason: 'ethylene_oxide_test_report_missing',
      source: 'EU Reg 396/2005', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_sesame_salmonella_test_v1', type: 'document', requires: ['salmonella_test_report'],
      failure_reason: 'salmonella_test_report_missing',
      source: 'EU Reg 2073/2005', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_sesame_health_cert_v1', type: 'document', requires: ['health_certificate'],
      failure_reason: 'health_certificate_missing',
      source: 'NAFDAC', confidence: 'medium', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    }
  ],

  // ============================================
  // SESAME - HAMBURG (DE)
  // ============================================
  'sesame-germany': [
    {
      rule_id: 'eu_sesame_rasff_2025_de', type: 'conditional',
      conditions: [],
      failure_reason: 'active_rasff_alert',
      source: 'RASFF Window 2024-2025', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null },
      triggers_review: true, review_reason: 'Active RASFF alerts for Nigerian sesame'
    },
    {
      rule_id: 'eu_sesame_aflatoxin_b1_v1_de', type: 'requirement',
      conditions: [{ field: 'lab_results.aflatoxin_b1', operator: '<=', value: 5.0 }],
      fail_if: 'lab_results.aflatoxin_b1 > 5.0', failure_reason: 'aflatoxin_b1_exceeds_limit',
      source: 'EU Reg 2023/915', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_sesame_aflatoxin_total_v1_de', type: 'requirement',
      conditions: [{ field: 'lab_results.aflatoxin_total', operator: '<=', value: 10.0 }],
      fail_if: 'lab_results.aflatoxin_total > 10.0', failure_reason: 'aflatoxin_total_exceeds_limit',
      source: 'EU Reg 2023/915', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_sesame_ethylene_oxide_v1_de', type: 'requirement',
      conditions: [{ field: 'lab_results.ethylene_oxide', operator: '<=', value: 0.02 }],
      fail_if: 'lab_results.ethylene_oxide > 0.02', failure_reason: 'ethylene_oxide_exceeds_limit',
      source: 'EU Reg 396/2005', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_sesame_salmonella_v1_de', type: 'requirement',
      conditions: [{ field: 'lab_results.salmonella_detected', operator: '==', value: false }],
      fail_if: 'lab_results.salmonella_detected === true', failure_reason: 'salmonella_detected',
      source: 'EU Reg 2073/2005', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_sesame_phyto_v1_de', type: 'document', requires: ['phytosanitary_certificate'],
      failure_reason: 'phytosanitary_certificate_missing',
      source: 'NAQS Nigeria', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_sesame_eur1_v1_de', type: 'document', requires: ['eur1_certificate'],
      failure_reason: 'eur1_certificate_missing',
      source: 'Nigeria Customs', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_sesame_form_nxp_v1_de', type: 'document', requires: ['form_nxp'],
      failure_reason: 'form_nxp_missing',
      source: 'CBN', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    }
  ],

  // ============================================
  // GINGER - ROTTERDAM (NL)
  // ============================================
  'ginger-netherlands': [
    {
      rule_id: 'eu_ginger_ethylene_oxide_v1', type: 'requirement',
      conditions: [{ field: 'lab_results.ethylene_oxide', operator: '<=', value: 0.02 }],
      fail_if: 'lab_results.ethylene_oxide > 0.02', failure_reason: 'ethylene_oxide_exceeds_limit',
      source: 'EU Reg 396/2005', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_ginger_chlorpyrifos_v1', type: 'requirement',
      conditions: [{ field: 'lab_results.chlorpyrifos', operator: '<=', value: 0.01 }],
      fail_if: 'lab_results.chlorpyrifos > 0.01', failure_reason: 'chlorpyrifos_exceeds_limit',
      source: 'EU Reg 396/2005', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_ginger_dimethoate_v1', type: 'requirement',
      conditions: [{ field: 'lab_results.dimethoate', operator: '<=', value: 0.01 }],
      fail_if: 'lab_results.dimethoate > 0.01', failure_reason: 'dimethoate_exceeds_limit',
      source: 'EU Reg 396/2005', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_ginger_aflatoxin_b1_v1', type: 'requirement',
      conditions: [{ field: 'lab_results.aflatoxin_b1', operator: '<=', value: 5.0 }],
      fail_if: 'lab_results.aflatoxin_b1 > 5.0', failure_reason: 'aflatoxin_b1_exceeds_limit',
      source: 'EU Reg 2023/915', confidence: 'medium', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_ginger_salmonella_v1', type: 'requirement',
      conditions: [{ field: 'lab_results.salmonella_detected', operator: '==', value: false }],
      fail_if: 'lab_results.salmonella_detected === true', failure_reason: 'salmonella_detected',
      source: 'EU Reg 2073/2005', confidence: 'medium', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_ginger_phyto_v1', type: 'document', requires: ['phytosanitary_certificate'],
      failure_reason: 'phytosanitary_certificate_missing',
      source: 'NAQS Nigeria', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_ginger_eur1_v1', type: 'document', requires: ['eur1_certificate'],
      failure_reason: 'eur1_certificate_missing',
      source: 'Nigeria Customs', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_ginger_form_nxp_v1', type: 'document', requires: ['form_nxp'],
      failure_reason: 'form_nxp_missing',
      source: 'CBN', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_ginger_pesticide_test_v1', type: 'document', requires: ['pesticide_test_report'],
      failure_reason: 'pesticide_test_report_missing',
      source: 'EU Reg 396/2005', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_ginger_eto_test_v1', type: 'document', requires: ['ethylene_oxide_test_report'],
      failure_reason: 'ethylene_oxide_test_report_missing',
      source: 'EU Reg 396/2005', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    }
  ],

  // ============================================
  // GINGER - HAMBURG (DE) - Enhanced Inspection
  // ============================================
  'ginger-germany': [
    {
      rule_id: 'eu_ginger_hamburg_enhanced_inspection', type: 'conditional',
      conditions: [],
      failure_reason: 'enhanced_inspection_required',
      source: 'BVL Germany', confidence: 'medium', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null },
      triggers_review: true, review_reason: 'Germany BVL enhanced inspection for Nigerian ginger'
    },
    {
      rule_id: 'eu_ginger_ethylene_oxide_v1_de', type: 'requirement',
      conditions: [{ field: 'lab_results.ethylene_oxide', operator: '<=', value: 0.02 }],
      fail_if: 'lab_results.ethylene_oxide > 0.02', failure_reason: 'ethylene_oxide_exceeds_limit',
      source: 'EU Reg 396/2005', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_ginger_chlorpyrifos_v1_de', type: 'requirement',
      conditions: [{ field: 'lab_results.chlorpyrifos', operator: '<=', value: 0.01 }],
      fail_if: 'lab_results.chlorpyrifos > 0.01', failure_reason: 'chlorpyrifos_exceeds_limit',
      source: 'EU Reg 396/2005', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_ginger_dimethoate_v1_de', type: 'requirement',
      conditions: [{ field: 'lab_results.dimethoate', operator: '<=', value: 0.01 }],
      fail_if: 'lab_results.dimethoate > 0.01', failure_reason: 'dimethoate_exceeds_limit',
      source: 'EU Reg 396/2005', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_ginger_phyto_v1_de', type: 'document', requires: ['phytosanitary_certificate'],
      failure_reason: 'phytosanitary_certificate_missing',
      source: 'NAQS Nigeria', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_ginger_eur1_v1_de', type: 'document', requires: ['eur1_certificate'],
      failure_reason: 'eur1_certificate_missing',
      source: 'Nigeria Customs', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_ginger_form_nxp_v1_de', type: 'document', requires: ['form_nxp'],
      failure_reason: 'form_nxp_missing',
      source: 'CBN', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    }
  ],

  // ============================================
  // SHEA BUTTER - ROTTERDAM (NL) - Codex Med Confidence
  // ============================================
  'shea_butter-netherlands': [
    {
      rule_id: 'eu_shea_ffa_v1', type: 'requirement',
      conditions: [{ field: 'lab_results.free_fatty_acids', operator: '<=', value: 1.5 }],
      fail_if: 'lab_results.free_fatty_acids > 1.5', failure_reason: 'ffa_exceeds_limit',
      source: 'Codex 326-2017', confidence: 'medium', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null },
      triggers_review: true, review_reason: 'Codex standard - EU regulation not verified'
    },
    {
      rule_id: 'eu_shea_peroxide_v1', type: 'requirement',
      conditions: [{ field: 'lab_results.peroxide_value', operator: '<=', value: 10 }],
      fail_if: 'lab_results.peroxide_value > 10', failure_reason: 'peroxide_exceeds_limit',
      source: 'Codex 326-2017', confidence: 'medium', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null },
      triggers_review: true, review_reason: 'Codex standard - EU regulation not verified'
    },
    {
      rule_id: 'eu_shea_moisture_v1', type: 'requirement',
      conditions: [{ field: 'lab_results.moisture', operator: '<=', value: 0.2 }],
      fail_if: 'lab_results.moisture > 0.2', failure_reason: 'moisture_exceeds_limit',
      source: 'Codex 326-2017', confidence: 'medium', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null },
      triggers_review: true, review_reason: 'Codex standard - EU regulation not verified'
    },
    {
      rule_id: 'eu_shea_aflatoxin_total_v1', type: 'requirement',
      conditions: [{ field: 'lab_results.aflatoxin_total', operator: '<=', value: 4.0 }],
      fail_if: 'lab_results.aflatoxin_total > 4.0', failure_reason: 'aflatoxin_total_exceeds_limit',
      source: 'EU Reg 2023/915', confidence: 'medium', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_shea_phyto_v1', type: 'document', requires: ['phytosanitary_certificate'],
      failure_reason: 'phytosanitary_certificate_missing',
      source: 'NAQS Nigeria', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_shea_eur1_v1', type: 'document', requires: ['eur1_certificate'],
      failure_reason: 'eur1_certificate_missing',
      source: 'Nigeria Customs', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_shea_form_nxp_v1', type: 'document', requires: ['form_nxp'],
      failure_reason: 'form_nxp_missing',
      source: 'CBN', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_shea_quality_report_v1', type: 'document', requires: ['quality_analysis_report'],
      failure_reason: 'quality_analysis_report_missing',
      source: 'EU Approved Lab', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_shea_coo_v1', type: 'document', requires: ['certificate_of_origin'],
      failure_reason: 'certificate_of_origin_missing',
      source: 'NEPC/Chambers', confidence: 'medium', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    }
  ],

  // ============================================
  // SHEA BUTTER - HAMBURG (DE)
  // ============================================
  'shea_butter-germany': [
    {
      rule_id: 'eu_shea_ffa_v1_de', type: 'requirement',
      conditions: [{ field: 'lab_results.free_fatty_acids', operator: '<=', value: 1.5 }],
      fail_if: 'lab_results.free_fatty_acids > 1.5', failure_reason: 'ffa_exceeds_limit',
      source: 'Codex 326-2017', confidence: 'medium', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null },
      triggers_review: true, review_reason: 'Codex standard - EU regulation not verified'
    },
    {
      rule_id: 'eu_shea_peroxide_v1_de', type: 'requirement',
      conditions: [{ field: 'lab_results.peroxide_value', operator: '<=', value: 10 }],
      fail_if: 'lab_results.peroxide_value > 10', failure_reason: 'peroxide_exceeds_limit',
      source: 'Codex 326-2017', confidence: 'medium', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null },
      triggers_review: true, review_reason: 'Codex standard - EU regulation not verified'
    },
    {
      rule_id: 'eu_shea_phyto_v1_de', type: 'document', requires: ['phytosanitary_certificate'],
      failure_reason: 'phytosanitary_certificate_missing',
      source: 'NAQS Nigeria', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_shea_eur1_v1_de', type: 'document', requires: ['eur1_certificate'],
      failure_reason: 'eur1_certificate_missing',
      source: 'Nigeria Customs', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_shea_form_nxp_v1_de', type: 'document', requires: ['form_nxp'],
      failure_reason: 'form_nxp_missing',
      source: 'CBN', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null }
    },
    {
      rule_id: 'eu_shea_german_importer_reg_v1', type: 'document', requires: ['german_importer_registration'],
      failure_reason: 'german_importer_registration_missing',
      source: 'German importer', confidence: 'low', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2025-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null },
      blocking: false, triggers_review: true, review_reason: 'Varies by importer - requires verification'
    }
  ],

  // ============================================
  // BEANS - NL/DE - HARD BLOCK (EU BAN)
  // ============================================
  'beans-netherlands': [
    {
      rule_id: 'eu_beans_ng_import_ban', type: 'hard_block',
      conditions: [],
      failure_reason: 'eu_import_ban_active',
      source: 'EU Commission Decision 2015+', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2015-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null },
      blocking: true, override_permitted: false,
      exporter_message: 'Dried beans from Nigeria currently face active EU import restrictions. This shipment cannot proceed through Culbridge at this time. Please contact the Culbridge compliance team for guidance.',
      internal_message: 'EU import ban on Nigerian dried beans — Dichlorvos (DDVP) contamination. Ban first imposed 2015. Verify current status before any manual override is considered.'
    }
  ],
  'beans-germany': [
    {
      rule_id: 'eu_beans_ng_import_ban_de', type: 'hard_block',
      conditions: [],
      failure_reason: 'eu_import_ban_active',
      source: 'EU Commission Decision 2015+', confidence: 'high', last_verified: '2025-01-15',
      versioning: { current_version: 'v1.0', effective_from: '2015-01-01', deprecated: false, deprecated_on: null, deprecated_reason: null, superseded_by: null },
      blocking: true, override_permitted: false,
      exporter_message: 'Dried beans from Nigeria currently face active EU import restrictions. This shipment cannot proceed through Culbridge at this time. Please contact the Culbridge compliance team for guidance.',
      internal_message: 'EU import ban on Nigerian dried beans — Dichlorvos (DDVP) contamination. Ban first imposed 2015. Verify current status before any manual override is considered.'
    }
  ]
};

/**
 * Lab accreditation registry (Phase 1 - manually maintained)
 */
const ACCREDITED_LABS = {
  'LAB_NEPC_001': {
    lab_id: 'LAB_NEPC_001',
    lab_name: 'Nigerian Export Promotion Council Laboratory',
    accreditation_number: 'ISO17025-2024-001',
    country: 'NG',
    accreditation_body: 'SON',
    valid_until: '2026-12-31',
    products_covered: ['cocoa_beans', 'sesame', 'ginger'],
    active: true
  },
  'LAB_SGS_001': {
    lab_id: 'LAB_SGS_001',
    lab_name: 'SGS Nigeria Ltd',
    accreditation_number: 'ISO17025-2023-089',
    country: 'NG',
    accreditation_body: 'SON',
    valid_until: '2026-06-30',
    products_covered: ['cocoa_beans', 'sesame'],
    active: true
  },
  'LAB_EU_001': {
    lab_id: 'LAB_EU_001',
    lab_name: 'Eurofins Scientific',
    accreditation_number: 'ISO17025-ENAC-042',
    country: 'NL',
    accreditation_body: 'ENAC',
    valid_until: '2027-03-31',
    products_covered: ['cocoa_beans', 'sesame', 'ginger', 'groundnuts'],
    active: true
  }
};

/**
 * Main evaluation function
 */
function evaluateDeterministic(shipment) {
  const failures = [];
  const missing = [];
  const warnings = [];
  const next_actions = [];
  const evidence_required = [];
  const rules_applied = [];
  
  const { product, form, origin, destination, lab_results, documents } = shipment;
  
  // Hard Constraint A: No missing inputs
  if (!product || !origin || !destination) {
    return {
      status: 'BLOCKED',
      failures: [{ rule: 'required_fields', reason: 'missing_required_input' }],
      missing: ['product', 'origin', 'destination'].filter(f => !shipment[f]),
      next_actions: [],
      evidence_required: [],
      rules_applied: []
    };
  }
  
  // Determine applicable rules
  const routeKey = `${product}-${destination}`.toLowerCase().replace(' ', '_');
  const rules = RULE_REGISTRY[routeKey] || [];
  
  if (rules.length === 0) {
    return {
      status: 'BLOCKED',
      failures: [{ rule: 'route_not_supported', reason: `No rules for ${routeKey}` }],
      missing: [],
      next_actions: [],
      evidence_required: [],
      rules_applied: []
    };
  }
  
  // Evaluate each rule
  for (const rule of rules) {
    rules_applied.push({
      rule_id: rule.rule_id,
      rule_version: rule.versioning?.current_version || 'v1.0',
      rule_effective_from: rule.versioning?.effective_from || '2025-01-01',
      outcome: 'EVALUATED'
    });
    
    // Handle different rule types
    if (rule.type === 'hard_block') {
      // BEANS - EU Import Ban - cannot be overridden
      failures.push({
        rule: rule.rule_id,
        reason: rule.failure_reason,
        blocking: true,
        override_permitted: rule.override_permitted !== false,
        exporter_message: rule.exporter_message,
        internal_message: rule.internal_message
      });
      continue;
    }
    
    if (rule.type === 'conditional') {
      // RASFF alerts, enhanced inspection flags - trigger review but don't block
      if (rule.triggers_review) {
        warnings.push({
          rule: rule.rule_id,
          reason: rule.review_reason || rule.failure_reason,
          requires_review: true,
          confidence: rule.confidence || 'high'
        });
      }
      continue;
    }
    
    if (rule.type === 'requirement') {
      evaluateConditions(rule, shipment, failures, missing, warnings);
    } else if (rule.type === 'document') {
      const isBlocking = rule.blocking !== false;
      evaluateDocuments(rule, shipment, missing, next_actions, evidence_required, isBlocking, warnings);
    }
  }
  
  // Hard Constraint B: No assumptions - must have lab_results
  if (!lab_results) {
    if (!missing.includes('lab_results')) {
      missing.push('lab_results');
    }
    if (!next_actions.find(a => a.action === 'conduct_lab_test')) {
      next_actions.push({ step: 1, action: 'conduct_lab_test' });
    }
    if (!evidence_required.includes('lab_results')) {
      evidence_required.push('lab_results');
    }
  }
  
  // Generate next_actions for missing documents
  generateNextActions(documents, missing, next_actions);
  
  // Determine status
  let status = determineStatus(failures, missing);
  
  // Apply confidence-based review triggers (warnings)
  if (status === 'PASS' && warnings.length > 0) {
    status = 'PENDING_REVIEW';
  }
  
  // RISK flag for elevated but under-limit values
  const riskAdjusted = applyRiskThreshold(shipment, status);
  
  // If PASS but has medium-confidence rules, flag for review
  if (riskAdjusted === 'PASS') {
    const hasMediumConfidence = rules.some(r => r.confidence === 'medium');
    if (hasMediumConfidence) {
      return {
        status: 'PENDING_REVIEW',
        failures,
        missing,
        next_actions: sortByStep(next_actions),
        evidence_required,
        rules_applied,
        review_reason: 'Medium confidence rules applied - compliance officer review required',
        warnings,
        exporter_message: generatePendingReviewMessage(product, destination, warnings),
        internal_notes: 'Review required per Addendum 2 confidence escalation rules. Verify rule confidence levels with compliance team before approval.'
      };
    }
  }
  
  // Generate exporter-friendly output
  const exporterOutput = formatOutput(riskAdjusted, failures, missing, next_actions, evidence_required, rules_applied, warnings, product, destination);
  
  return exporterOutput;
}

/**
 * Evaluate condition-based rules
 */
function evaluateConditions(rule, shipment, failures, missing, warnings) {
  for (const condition of rule.conditions) {
    const fieldValue = getNestedValue(shipment, condition.field);
    
    // If field is not provided, treat as missing, not failed
    if (fieldValue === undefined) {
      const fieldName = condition.field.split('.').pop();
      if (!missing.includes(fieldName)) {
        missing.push(fieldName);
      }
      
      // If this is a medium confidence rule with missing data, trigger review instead of hard block
      if (rule.confidence === 'medium' && rule.triggers_review) {
        if (!warnings.find(w => w.rule === rule.rule_id)) {
          warnings.push({
            rule: rule.rule_id,
            reason: rule.review_reason || 'Medium confidence rule - data required for evaluation',
            requires_review: true,
            confidence: 'medium'
          });
        }
      }
      continue;
    }
    
    let passed = true;
    switch (condition.operator) {
      case '==':
        passed = fieldValue === condition.value;
        break;
      case '!=':
        passed = fieldValue !== condition.value;
        break;
      case '<':
        passed = fieldValue < condition.value;
        break;
      case '<=':
        passed = fieldValue <= condition.value;
        break;
      case '>':
        passed = fieldValue > condition.value;
        break;
      case '>=':
        passed = fieldValue >= condition.value;
        break;
    }
    
    if (!passed) {
      // Medium confidence failures trigger PENDING_REVIEW instead of hard block
      if (rule.confidence === 'medium') {
        if (!warnings.find(w => w.rule === rule.rule_id)) {
          warnings.push({
            rule: rule.rule_id,
            reason: rule.failure_reason,
            requires_review: true,
            confidence: 'medium',
            field: condition.field,
            value: fieldValue,
            expected: condition.value
          });
        }
      } else {
        failures.push({
          rule: rule.rule_id,
          reason: rule.failure_reason,
          field: condition.field,
          value: fieldValue,
          expected: condition.value
        });
      }
    }
  }
}

/**
 * Evaluate document requirements
 */
function evaluateDocuments(rule, shipment, missing, next_actions, evidence_required, isBlocking, warnings) {
  for (const requiredDoc of rule.requires) {
    const docValue = getNestedValue(shipment.documents, requiredDoc);
    
    if (!docValue) {
      // Non-blocking documents with low confidence don't cause BLOCKED
      if (!isBlocking && rule.confidence === 'low' && rule.triggers_review) {
        if (!warnings.find(w => w.rule === rule.rule_id)) {
          warnings.push({
            rule: rule.rule_id,
            reason: rule.review_reason || `${requiredDoc} may be required by specific importers`,
            requires_review: true,
            confidence: 'low'
          });
        }
      } else {
        if (!missing.includes(requiredDoc)) {
          missing.push(requiredDoc);
        }
        if (!evidence_required.includes(requiredDoc)) {
          evidence_required.push(requiredDoc);
        }
      }
    }
  }
}

/**
 * Generate ordered next_actions based on missing items
 */
function generateNextActions(documents, missing, next_actions) {
  const actionOrder = [
    { doc: 'lab_results', action: 'conduct_lab_test' },
    { doc: 'certificate_of_origin', action: 'apply_certificate_of_origin' },
    { doc: 'phytosanitary_certificate', action: 'book_naqs_inspection' },
    { doc: 'cci', action: 'complete_trms_registration' }
  ];
  
  let step = next_actions.length + 1;
  
  for (const { doc, action } of actionOrder) {
    if (missing.includes(doc)) {
      if (!next_actions.find(a => a.action === action)) {
        next_actions.push({ step: step++, action });
      }
    }
  }
}

/**
 * Determine final status
 */
function determineStatus(failures, missing) {
  if (failures.length > 0 || missing.length > 0) {
    return 'BLOCKED';
  }
  return 'PASS';
}

/**
 * Apply risk threshold (elevated but under-limit values)
 */
function applyRiskThreshold(shipment, currentStatus) {
  if (currentStatus !== 'PASS') return currentStatus;
  
  const { lab_results } = shipment;
  if (!lab_results) return currentStatus;
  
  // Elevated pesticide (between 0.05 and 0.1 = RISK)
  if (lab_results.pesticide_residue !== undefined && 
      lab_results.pesticide_residue > 0.05 && 
      lab_results.pesticide_residue <= 0.1) {
    return 'RISK';
  }
  
  // Elevated moisture (between 6.5 and 7.5 = RISK)
  if (lab_results.moisture !== undefined && 
      lab_results.moisture > 6.5 && 
      lab_results.moisture <= 7.5) {
    return 'RISK';
  }
  
  return currentStatus;
}

/**
 * Sort next_actions by step
 */
function sortByStep(actions) {
  return [...actions].sort((a, b) => a.step - b.step);
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj, path) {
  if (!obj) return undefined;
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Validate shipment input schema
 */
function validateInputSchema(shipment) {
  const required = ['product', 'origin', 'destination'];
  const errors = [];
  
  for (const field of required) {
    if (!shipment[field]) {
      errors.push({ field, reason: 'required' });
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Detect rule conflicts
 */
function detectConflicts(rules) {
  const conflicts = [];
  const requirements = {};
  
  for (const rule of rules) {
    if (rule.type === 'document' && rule.requires) {
      for (const req of rule.requires) {
        if (requirements[req]) {
          conflicts.push({
            type: 'document_conflict',
            field: req,
            rules: [requirements[req], rule.rule_id]
          });
        }
        requirements[req] = rule.rule_id;
      }
    }
  }
  
  return conflicts;
}

module.exports = {
  evaluateDeterministic,
  validateInputSchema,
  detectConflicts,
  RULE_REGISTRY,
  ACCREDITED_LABS,
  validateLabAccreditation,
  evaluateLabResult,
  evaluateBDL,
  normalizeUnit,
  applyConfidenceEscalation,
  getRuleVersionSnapshot
};

/**
 * Validate lab accreditation (Addendum 4)
 */
function validateLabAccreditation(labId, product) {
  const lab = ACCREDITED_LABS[labId];
  
  if (!lab) {
    return {
      valid: false,
      reason: 'Lab accreditation could not be verified. Only EU-approved laboratories are accepted.',
      lab_id: labId
    };
  }
  
  if (!lab.active) {
    return {
      valid: false,
      reason: 'Lab accreditation is inactive.',
      lab_id: labId
    };
  }
  
  const validUntil = new Date(lab.valid_until);
  if (validUntil < new Date()) {
    return {
      valid: false,
      reason: 'Lab accreditation has expired.',
      lab_id: labId,
      expired_on: lab.valid_until
    };
  }
  
  if (!lab.products_covered.includes(product)) {
    return {
      valid: false,
      reason: `Lab is not accredited for ${product}.`,
      lab_id: labId,
      covered_products: lab.products_covered
    };
  }
  
  return {
    valid: true,
    lab: lab
  };
}

/**
 * Evaluate lab result with BDL handling (Addendum 4)
 */
function evaluateLabResult(labResult) {
  if (!labResult || !labResult.parameters) {
    return { evaluation: 'UNCERTAIN', reason: 'No lab parameters provided' };
  }
  
  const failures = [];
  const warnings = [];
  
  for (const param of labResult.parameters) {
    const euMax = param.eu_maximum;
    const unit = normalizeUnit(param.unit);
    const reportedValue = param.reported_value;
    
    // Handle BDL case
    if (param.below_detection_limit) {
      const bdlResult = evaluateBDL(param.detection_limit, euMax, unit);
      if (bdlResult.evaluation === 'UNCERTAIN') {
        failures.push({
          substance: param.substance,
          ...bdlResult
        });
      } else {
        warnings.push({
          substance: param.substance,
          ...bdlResult
        });
      }
      continue;
    }
    
    // Normal evaluation
    if (reportedValue > euMax) {
      failures.push({
        substance: param.substance,
        reported_value: reportedValue,
        eu_maximum: euMax,
        evaluation: 'FAIL',
        reason: `Reported value ${reportedValue}${unit} exceeds EU maximum ${euMax}${unit}`
      });
    }
  }
  
  const overall = failures.length > 0 ? 'FAIL' : warnings.length > 0 ? 'WARNING' : 'PASS';
  
  return {
    evaluation: overall,
    failures,
    warnings
  };
}

/**
 * Evaluate Below Detection Limit results (Addendum 4)
 */
function evaluateBDL(detectionLimit, euMaximum, unit) {
  // Detection limit is already normalized to canonical unit
  
  if (detectionLimit <= euMaximum) {
    return {
      evaluation: 'PASS',
      reason: 'Detection limit is below EU maximum. Substance not detected at reportable levels.',
      detection_limit: detectionLimit,
      eu_maximum: euMaximum
    };
  }
  
  return {
    evaluation: 'UNCERTAIN',
    reason: 'Lab detection limit exceeds EU maximum. Result cannot be confirmed as compliant. Request re-test from lab with lower detection limit.',
    detection_limit: detectionLimit,
    eu_maximum: euMaximum
  };
}

/**
 * Normalize lab units to canonical (Addendum 4)
 */
function normalizeUnit(inputUnit) {
  const unitMap = {
    'µg/kg': 'µg/kg',
    'ug/kg': 'µg/kg',
    'mg/kg': 'mg/kg',
    'ppb': 'µg/kg',
    'ppm': 'mg/kg'
  };
  
  return unitMap[inputUnit?.toLowerCase()] || null;
}

/**
 * Apply confidence escalation trigger (Addendum 2)
 */
function applyConfidenceEscalation(rule, evaluationResult, shipmentId) {
  if (rule.confidence === 'high') {
    return { status: 'AUTO_PROCEED', action: 'execute_rule' };
  }
  
  if (rule.confidence === 'medium') {
    // Flag for internal review but continue
    return { 
      status: 'FLAG_FOR_REVIEW', 
      action: 'proceed_with_monitoring',
      internal_alert: {
        shipment_id: shipmentId,
        rule_id: rule.rule_id,
        reason: 'MEDIUM_CONFIDENCE_RULE',
        alert_to: 'assigned_compliance_officer'
      }
    };
  }
  
  if (rule.confidence === 'low') {
    // Block until human approval
    return {
      status: 'PENDING_REVIEW',
      action: 'block_until_approved',
      internal_alert: {
        shipment_id: shipmentId,
        rule_id: rule.rule_id,
        reason: 'LOW_CONFIDENCE_RULE_REQUIRES_HUMAN_REVIEW',
        alert_to: 'compliance_officer,admin'
      }
    };
  }
  
  return { status: 'UNKNOWN_CONFIDENCE', action: 'require_manual_review' };
}

/**
 * Get rule version snapshot for audit (Addendum 1)
 */
function getRuleVersionSnapshot(shipmentId, rules) {
  const timestamp = new Date().toISOString();
  
  const rulesApplied = rules.map(rule => ({
    rule_id: rule.rule_id,
    rule_version: rule.versioning?.current_version || 'v1.0',
    rule_effective_from: rule.versioning?.effective_from || '2025-01-01',
    outcome: 'EVALUATED' // Will be updated after evaluation
  }));
  
  return {
    shipment_id: shipmentId,
    evaluated_at: timestamp,
    rules_applied: rulesApplied
  };
}

/**
 * Generate plain English error messages for exporters
 * Pillar 3: Error messages are never error codes. They are plain English instructions.
 */
function generateExporterMessage(rule, fieldValue, expected, product, destination) {
  const messages = {
    // Cocoa contaminants
    'ochratoxin_exceeds_limit': {
      issue: `Your lab report shows ochratoxin A at ${fieldValue} µg/kg. The EU limit for cocoa beans entering ${destination === 'Germany' ? 'Hamburg' : 'Rotterdam'} is ${expected} µg/kg. You need a new lab test before this shipment can proceed.`,
      next_step: 'Contact an EU-approved laboratory and request a new ochratoxin A test. Upload the new result when it is available.'
    },
    'cadmium_exceeds_limit': {
      issue: `Your lab report shows cadmium at ${fieldValue} mg/kg. The EU limit for cocoa beans entering ${destination === 'Germany' ? 'Hamburg' : 'Rotterdam'} is ${expected} mg/kg. You need a new lab test before this shipment can proceed.`,
      next_step: 'Contact an EU-approved laboratory and request a new cadmium test. Upload the new result when it is available.'
    },
    'aflatoxin_b1_exceeds_limit': {
      issue: `Your lab report shows aflatoxin B1 at ${fieldValue} µg/kg. The EU limit for cocoa beans is ${expected} µg/kg. This shipment cannot proceed until you have a passing test result.`,
      next_step: 'Contact an EU-approved laboratory and request a new aflatoxin B1 test.'
    },
    'aflatoxin_total_exceeds_limit': {
      issue: `Your lab report shows total aflatoxins at ${fieldValue} µg/kg. The EU limit is ${expected} µg/kg. This shipment cannot proceed until you have a passing test result.`,
      next_step: 'Contact an EU-approved laboratory and request a new aflatoxin test.'
    },
    'moisture_exceeds_limit': {
      issue: `Your lab report shows moisture content at ${fieldValue}%. The maximum allowed for cocoa beans is ${expected}%. Your shipment exceeds the moisture limit.`,
      next_step: 'The cocoa beans need to be dried further before export. Contact your quality control team to reduce moisture content.'
    },
    'salmonella_detected': {
      issue: 'Your lab test detected salmonella in the sample. Salmonella must not be present in any quantity for cocoa beans entering the EU.',
      next_step: 'This is a critical safety issue. The shipment cannot proceed. Contact your laboratory to discuss sanitization options and retesting.'
    },
    'pesticide_exceeds_mrl': {
      issue: `Your lab report shows pesticide residue at ${fieldValue} mg/kg. The EU maximum residue limit for this product entering ${destination === 'Germany' ? 'Hamburg' : 'Rotterdam'} is ${expected} mg/kg.`,
      next_step: 'Contact your laboratory to identify which pesticide exceeded limits and request guidance on treatment or sourcing.'
    },
    
    // Sesame
    'ethylene_oxide_exceeds_limit': {
      issue: `Your lab report shows ethylene oxide at ${fieldValue} mg/kg. The EU limit for sesame seeds is ${expected} mg/kg. This is a commonly detected issue with sesame from Nigeria.`,
      next_step: 'Contact an EU-approved laboratory for retesting. Consider whether the supplier can provide sesame with lower ethylene oxide levels.'
    },
    
    // Ginger
    'chlorpyrifos_exceeds_limit': {
      issue: `Your lab report shows chlorpyrifos at ${fieldValue} mg/kg. The EU limit is ${expected} mg/kg. This pesticide is commonly flagged for Nigerian ginger.`,
      next_step: 'Contact your laboratory to verify which pesticides were detected. You may need to switch suppliers or request treatment documentation.'
    },
    'dimethoate_exceeds_limit': {
      issue: `Your lab report shows dimethoate at ${fieldValue} mg/kg. The EU limit is ${expected} mg/kg. This pesticide is commonly flagged for Nigerian ginger.`,
      next_step: 'Contact your laboratory to verify which pesticides were detected. You may need to switch suppliers or request treatment documentation.'
    },
    
    // Shea Butter
    'ffa_exceeds_limit': {
      issue: `Your quality report shows free fatty acids at ${fieldValue}% (as oleic acid). The maximum allowed is ${expected}%. High free fatty acids indicate the shea butter is of lower quality.`,
      next_step: 'Contact your quality control team. This may indicate the shea nuts were stored too long or processed incorrectly.'
    },
    'peroxide_exceeds_limit': {
      issue: `Your quality report shows peroxide value at ${fieldValue} mEq O2/kg. The maximum allowed is ${expected} mEq O2/kg. High peroxide indicates oxidative degradation.`,
      next_step: 'Contact your quality control team. This may indicate improper storage or age of the product.'
    },
    
    // Documents
    'certificate_of_origin_missing': {
      issue: 'Your shipment is missing the Certificate of Origin. This document proves where your goods were produced.',
      next_step: 'Apply for a Certificate of Origin from the Nigerian Export Promotion Council (NEPC) or your local Chamber of Commerce.'
    },
    'phytosanitary_certificate_missing': {
      issue: 'Your shipment is missing the Phytosanitary Certificate. This document confirms your goods have been inspected by Nigerian authorities and are free from pests.',
      next_step: 'Book an inspection with the Nigerian Agricultural Quarantine Service (NAQS). They will issue the phytosanitary certificate after inspection.'
    },
    'cci_missing': {
      issue: 'Your shipment is missing the Clean Certificate of Inspection (CCI). This is required by Nigeria Customs for all agricultural exports.',
      next_step: 'Register your shipment on the TRMS system and complete the inspection process with Nigeria Customs Service.'
    },
    'eur1_certificate_missing': {
      issue: 'Your shipment is missing the EUR.1 Movement Certificate. This document allows preferential tariff treatment under the EU-Nigeria trade agreement.',
      next_step: 'Apply for an EUR.1 certificate from the Nigerian Customs Service or your designated Chamber of Commerce.'
    },
    'form_nxp_missing': {
      issue: 'Your shipment is missing Form NXP. This is required by the Central Bank of Nigeria for all exports.',
      next_step: 'Apply for Form NXP through your bank. Your bank will issue it once they verify the transaction.'
    },
    'health_certificate_missing': {
      issue: 'Your shipment is missing the Health Certificate. NAFDAC issues this document to confirm the product is safe for human consumption.',
      next_step: 'Apply for a Health Certificate from NAFDAC (National Agency for Food and Drug Administration and Control).'
    },
    'quality_analysis_report_missing': {
      issue: 'Your shipment is missing the Quality Analysis Report. This document confirms the shea butter meets quality standards.',
      next_step: 'Send a sample to an EU-approved laboratory for quality analysis. They will issue the report after testing.'
    },
    'aflatoxin_test_report_missing': {
      issue: 'Your shipment is missing the Aflatoxin Test Report. This is required for sesame seeds entering the EU.',
      next_step: 'Send a sample to an EU-approved laboratory for aflatoxin testing. This is a mandatory requirement.'
    },
    'ethylene_oxide_test_report_missing': {
      issue: 'Your shipment is missing the Ethylene Oxide Test Report. This is a critical test for sesame seeds due to frequent detections.',
      next_step: 'Send a sample to an EU-approved laboratory for ethylene oxide testing. This is a mandatory requirement.'
    },
    'salmonella_test_report_missing': {
      issue: 'Your shipment is missing the Salmonella Test Report. Salmonella must not be present in sesame seeds.',
      next_step: 'Send a sample to an EU-approved laboratory for salmonella testing. This is a mandatory microbiological test.'
    },
    'pesticide_test_report_missing': {
      issue: 'Your shipment is missing the Pesticide Residue Test Report. This is required to verify your product is below EU pesticide limits.',
      next_step: 'Send a sample to an EU-approved laboratory for comprehensive pesticide residue testing.'
    },
    
    // Hard block - Beans
    'eu_import_ban_active': {
      issue: 'Dried beans from Nigeria currently face active EU import restrictions. This shipment cannot be processed at this time.',
      next_step: 'Please contact the Culbridge compliance team for guidance on current regulatory status. Email: compliance@culbridge.com'
    },
    
    // Missing data
    'missing_required_input': {
      issue: 'Your submission is missing required information. Please complete all fields before resubmitting.',
      next_step: 'Review your submission and ensure product, origin country, and destination are all provided.'
    },
    'route_not_supported': {
      issue: `We do not currently support shipments of ${product} to ${destination}. This may be added in a future update.`,
      next_step: 'Contact Culbridge to discuss your specific route requirements.'
    },
    
    // Generic fallback
    'default': {
      issue: `Your shipment has an issue that is blocking processing. The specific rule that failed is: ${rule}`,
      next_step: 'Please review your submission and ensure all required documents and lab results are provided.'
    }
  };
  
  const msg = messages[rule] || messages['default'];
  
  return {
    status: 'BLOCKED',
    issue: msg.issue,
    next_step: msg.next_step,
    regulation_reference: getRegulationReference(rule)
  };
}

/**
 * Get regulation reference for internal admin view only
 */
function getRegulationReference(rule) {
  const references = {
    'ochratoxin_exceeds_limit': 'EU Regulation 2023/915 Annex I',
    'cadmium_exceeds_limit': 'EU Regulation 2023/915 Annex I',
    'aflatoxin_b1_exceeds_limit': 'EU Regulation 2023/915',
    'aflatoxin_total_exceeds_limit': 'EU Regulation 2023/915',
    'moisture_exceeds_limit': 'EU Regulation 2023/915',
    'salmonella_detected': 'EU Regulation 2019/2072',
    'pesticide_exceeds_mrl': 'EU Regulation 396/2005',
    'ethylene_oxide_exceeds_limit': 'EU Regulation 396/2005',
    'chlorpyrifos_exceeds_limit': 'EU Regulation 396/2005',
    'dimethoate_exceeds_limit': 'EU Regulation 396/2005',
    'ffa_exceeds_limit': 'Codex Standard 326-2017',
    'peroxide_exceeds_limit': 'Codex Standard 326-2017',
    'eu_import_ban_active': 'EU Commission Decision 2015+ (Dichlorvos/DDVP)',
    'certificate_of_origin_missing': 'EU 2017/625',
    'phytosanitary_certificate_missing': 'EU 2019/2072',
    'cci_missing': 'Nigeria Customs Service',
    'eur1_certificate_missing': 'EU-Nigeria Trade Agreement',
    'form_nxp_missing': 'Central Bank of Nigeria',
    'health_certificate_missing': 'NAFDAC Nigeria',
    'quality_analysis_report_missing': 'EU Approved Lab Standards',
    'aflatoxin_test_report_missing': 'EU Regulation 2023/915',
    'ethylene_oxide_test_report_missing': 'EU Regulation 396/2005',
    'salmonella_test_report_missing': 'EU Regulation 2073/2005',
    'pesticide_test_report_missing': 'EU Regulation 396/2005'
  };
  
  return references[rule] || 'See compliance team';
}

/**
 * Format output for exporter - plain English, no technical codes
 * Pillar 3: Error messages are never error codes. They are plain English instructions.
 */
function formatOutput(status, failures, missing, next_actions, evidence_required, rules_applied, warnings, product, destination) {
  const result = {
    status,
    rules_applied
  };
  
  // Format failures into plain English for exporters
  if (failures.length > 0 && status === 'BLOCKED') {
    const firstFailure = failures[0];
    const msg = generateExporterMessage(firstFailure.reason, firstFailure.value, firstFailure.expected, product, destination);
    
    result.issue = msg.issue;
    result.next_step = msg.next_step;
    
    // Also include regulatory reference for admin/internal use
    result.internal_data = {
      failures,
      regulation_reference: msg.regulation_reference
    };
  }
  
  // Format missing documents into plain English
  if (missing.length > 0 && status === 'BLOCKED') {
    const missingMsg = formatMissingDocuments(missing, product, destination);
    if (missingMsg) {
      result.issue = result.issue ? result.issue + ' ' + missingMsg.issue : missingMsg.issue;
      result.next_step = result.next_step ? result.next_step + ' ' + missingMsg.next_step : missingMsg.next_step;
    }
    
    result.missing_documents = missing;
    result.internal_data = result.internal_data || {};
    result.internal_data.missing_fields = missing;
  }
  
  // Add next actions in plain English
  if (next_actions.length > 0) {
    const actionSteps = next_actions.map(a => `${a.step}. ${formatActionToEnglish(a.action)}`).join(' ');
    result.what_to_do_next = actionSteps;
  }
  
  // Add evidence required
  if (evidence_required.length > 0) {
    result.evidence_required = evidence_required;
  }
  
  // Add warnings/info for PENDING_REVIEW
  if (warnings && warnings.length > 0) {
    result.warnings = warnings.map(w => ({
      reason: w.reason,
      requires_review: w.requires_review
    }));
  }
  
  // Add review reason if applicable
  if (status === 'PENDING_REVIEW') {
    result.exporter_message = generatePendingReviewMessage(product, destination, warnings);
  }
  
  // Add success message for PASS
  if (status === 'PASS') {
    result.exporter_message = `Your shipment of ${product} to ${destination === 'Germany' ? 'Hamburg' : 'Rotterdam'} meets all current EU requirements. You may proceed with export.`;
    result.next_step = 'Submit your completed shipment for final clearance. Ensure all documents are uploaded and valid.';
  }
  
  return result;
}

/**
 * Convert action codes to plain English
 */
function formatActionToEnglish(action) {
  const actions = {
    'conduct_lab_test': 'Get your product tested at an EU-approved laboratory',
    'apply_certificate_of_origin': 'Apply for a Certificate of Origin from NEPC or your Chamber of Commerce',
    'book_naqs_inspection': 'Book an inspection with NAQS (Nigerian Agricultural Quarantine Service)',
    'complete_trms_registration': 'Register your shipment on the TRMS system with Nigeria Customs',
    'upload_lab_results': 'Upload your laboratory test results to your exporter dashboard',
    'apply_phytosanitary': 'Apply for Phytosanitary Certificate from NAQS',
    'get_health_certificate': 'Get a Health Certificate from NAFDAC',
    'apply_eur1_certificate': 'Apply for EUR.1 Movement Certificate from Customs',
    'complete_form_nxp': 'Complete Form NXP through your bank'
  };
  
  return actions[action] || action;
}

/**
 * Generate PENDING_REVIEW message for exporters
 */
function generatePendingReviewMessage(product, destination, warnings) {
  const port = destination === 'Germany' ? 'Hamburg' : 'Rotterdam';
  
  // Check for RASFF flag
  const hasRasffWarning = warnings && warnings.some(w => w.reason && w.reason.includes('RASFF'));
  if (hasRasffWarning) {
    return `Your shipment of ${product} to ${port} requires additional review by the Culbridge compliance team. This is because there are active food safety alerts for products from Nigeria. You will be notified within 24 hours.`;
  }
  
  // Check for BVL enhanced inspection (Germany)
  const hasBvlWarning = warnings && warnings.some(w => w.reason && w.reason.includes('BVL'));
  if (hasBvlWarning) {
    return `Your shipment of ${product} to ${port} requires additional review by the Culbridge compliance team. Germany has enhanced inspection requirements for this product. You will be notified within 24 hours.`;
  }
  
  // Check for medium confidence (Codex rules)
  const hasMediumConfidence = warnings && warnings.some(w => w.confidence === 'medium');
  if (hasMediumConfidence) {
    return `Your shipment of ${product} to ${port} requires additional review by the Culbridge compliance team. Some of the rules applied are based on international standards that require verification. You will be notified within 24 hours.`;
  }
  
  // Default review message
  return `Your shipment of ${product} to ${port} requires additional review by the Culbridge compliance team. You will be notified within 24 hours.`;
}
function formatMissingDocuments(missing, product, destination) {
  if (missing.length === 0) return null;
  
  const docMessages = {
    'certificate_of_origin': 'Certificate of Origin (from NEPC or Chamber of Commerce)',
    'phytosanitary_certificate': 'Phytosanitary Certificate (from NAQS)',
    'cci': 'Clean Certificate of Inspection (CCI from Nigeria Customs)',
    'eur1_certificate': 'EUR.1 Movement Certificate (from Customs)',
    'form_nxp': 'Form NXP (from your bank)',
    'health_certificate': 'Health Certificate (from NAFDAC)',
    'quality_analysis_report': 'Quality Analysis Report (from EU-approved lab)',
    'aflatoxin_test_report': 'Aflatoxin Test Report (from EU-approved lab)',
    'ethylene_oxide_test_report': 'Ethylene Oxide Test Report (from EU-approved lab)',
    'salmonella_test_report': 'Salmonella Test Report (from EU-approved lab)',
    'pesticide_test_report': 'Pesticide Residue Test Report (from EU-approved lab)',
    'german_importer_registration': 'German Importer Registration (from your German buyer)'
  };
  
  const docList = missing.map(doc => docMessages[doc] || doc).join(', ');
  
  return {
    issue: `Your shipment is missing the following documents: ${docList}. Without these documents, we cannot complete the compliance check.`,
    next_step: 'Upload all required documents and resubmit for evaluation. You can upload documents through your exporter dashboard.'
  };
}