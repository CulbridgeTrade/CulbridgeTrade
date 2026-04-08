/**
 * Dovu Integration - Carbon Credits for Sustainable Exports
 * 
 * Purpose: Track carbon credits for timber/cocoa exports
 * - Meeting German sustainability standards (Supply Chain Act)
 * - Earn extra revenue through carbon offsetting
 * - Verify sustainable sourcing certificates
 * 
 * Dovu is an open-source protocol for carbon credit trading
 * Integration: For timber/cocoa exports to EU
 */

const fs = require('fs');
const path = require('path');

// ==================== CONFIGURATION ====================

const config = {
  // Dovu protocol settings
  protocol: 'DOVU',
  version: '1.0.0',
  
  // Supported project types
  projectTypes: [
    'agroforestry',
    'reforestation',
    'forest_conservation',
    'sustainable_agriculture',
    'regenerative_farming'
  ],
  
  // Carbon standards
  standards: [
    'Verra (VCS)',
    'Gold Standard',
    'Plan Vivo',
    'ACR',
    'Climate Action Reserve'
  ],
  
  // Storage
  dataPath: path.join(__dirname, '..', 'data', 'dovu_credits.json'),
  projectsPath: path.join(__dirname, '..', 'data', 'dovu_projects.json'),
  certificatesPath: path.join(__dirname, '..', 'data', 'dovu_certificates.json')
};

// ==================== IN-MEMORY STORAGE ====================

let carbonCredits = {
  lastUpdated: null,
  credits: []
};

let projects = {
  lastUpdated: null,
  projects: []
};

let certificates = {
  lastUpdated: null,
  certificates: []
};

// ==================== SAMPLE DATA ====================

// Sample carbon offset projects
const sampleProjects = [
  {
    projectId: 'DOVU-NG-AGRO-001',
    name: 'Nigerian Agroforestry Carbon Project',
    type: 'agroforestry',
    country: 'Nigeria',
    region: 'Oyo State',
    description: 'Smallholder cocoa farmers implementing agroforestry practices',
    standard: 'Gold Standard',
    certificationDate: '2025-06-15',
    expiryDate: '2035-06-15',
    totalCredits: 50000,
    creditsIssued: 32500,
    creditsAvailable: 17500,
    pricePerTon: 15.00,
    verifier: 'SCS Global',
    methodology: 'ACM0007',
    co2eReduced: 32500,
    farmers: 1250,
    status: 'active'
  },
  {
    projectId: 'DOVU-GH-FOREST-001',
    name: 'Ghana Forest Conservation Initiative',
    type: 'forest_conservation',
    country: 'Ghana',
    region: 'Ashanti Region',
    description: 'Protecting high conservation value forest',
    standard: 'Verra (VCS)',
    certificationDate: '2024-03-20',
    expiryDate: '2034-03-20',
    totalCredits: 100000,
    creditsIssued: 78000,
    creditsAvailable: 22000,
    pricePerTon: 12.50,
    verifier: 'Rainforest Alliance',
    methodology: 'VM0005',
    co2eReduced: 78000,
    hectares: 25000,
    status: 'active'
  },
  {
    projectId: 'DOVU-CI-REGEN-001',
    name: 'Ivory Coast Regenerative Cocoa',
    type: 'regenerative_farming',
    country: 'Ivory Coast',
    region: 'Daloa',
    description: 'Regenerative cocoa farming practices',
    standard: 'Gold Standard',
    certificationDate: '2025-01-10',
    expiryDate: '2030-01-10',
    totalCredits: 25000,
    creditsIssued: 8000,
    creditsAvailable: 17000,
    pricePerTon: 18.00,
    verifier: 'Preferred by Nature',
    methodology: 'ARR',
    co2eReduced: 8000,
    farmers: 850,
    status: 'active'
  }
];

// Sample carbon credit certificates
const sampleCertificates = [
  {
    certificateId: 'DOVU-CERT-001',
    projectId: 'DOVU-NG-AGRO-001',
    exporter: 'Premium Cocoa Exports Ltd',
    exporterId: 'EXP-NG-001',
    product: 'cocoa beans',
    hsCode: '180100',
    originCountry: 'Nigeria',
    weightKg: 20000,
    carbonFootprint: 45.2, // kg CO2e per kg of product
    creditsPurchased: 1000,
    creditsPrice: 15.00,
    totalCost: 15000,
    certificateType: 'carbon_offset',
    issueDate: '2026-03-01',
    validityYears: 1,
    status: 'active',
    verification: 'verified'
  },
  {
    certificateId: 'DOVU-CERT-002',
    projectId: 'DOVU-GH-FOREST-001',
    exporter: 'Ghana Sustainable Trade',
    exporterId: 'EXP-GH-001',
    product: 'cocoa beans',
    hsCode: '180100',
    originCountry: 'Ghana',
    weightKg: 15000,
    carbonFootprint: 38.5,
    creditsPurchased: 600,
    creditsPrice: 12.50,
    totalCost: 7500,
    certificateType: 'carbon_offset',
    issueDate: '2026-03-10',
    validityYears: 1,
    status: 'active',
    verification: 'verified'
  },
  {
    certificateId: 'DOVU-CERT-003',
    projectId: 'DOVU-NG-AGRO-001',
    exporter: 'Nigerian Sesame Co',
    exporterId: 'EXP-NG-002',
    product: 'sesame seeds',
    hsCode: '120740',
    originCountry: 'Nigeria',
    weightKg: 10000,
    carbonFootprint: 28.0,
    creditsPurchased: 300,
    creditsPrice: 15.00,
    totalCost: 4500,
    certificateType: 'carbon_offset',
    issueDate: '2026-03-15',
    validityYears: 1,
    status: 'active',
    verification: 'verified'
  }
];

// ==================== CORE FUNCTIONS ====================

/**
 * Initialize Dovu service
 */
async function initialize() {
  console.log('Dovu Carbon Credits Service initializing...');
  await loadData();
  console.log(`Dovu: ${projects.projects.length} projects, ${certificates.certificates.length} certificates`);
  return true;
}

/**
 * Load data from storage
 */
async function loadData() {
  try {
    if (fs.existsSync(config.projectsPath)) {
      const data = fs.readFileSync(config.projectsPath, 'utf8');
      projects = JSON.parse(data);
    } else {
      projects.projects = sampleProjects;
      projects.lastUpdated = new Date().toISOString();
      saveData();
    }
    
    if (fs.existsSync(config.certificatesPath)) {
      const data = fs.readFileSync(config.certificatesPath, 'utf8');
      certificates = JSON.parse(data);
    } else {
      certificates.certificates = sampleCertificates;
      certificates.lastUpdated = new Date().toISOString();
      saveData();
    }
  } catch (error) {
    console.log('Loading sample Dovu data...');
    projects.projects = sampleProjects;
    projects.lastUpdated = new Date().toISOString();
    certificates.certificates = sampleCertificates;
    certificates.lastUpdated = new Date().toISOString();
    saveData();
  }
}

/**
 * Save data to storage
 */
function saveData() {
  try {
    const dataDir = path.dirname(config.projectsPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(config.projectsPath, JSON.stringify(projects, null, 2));
    fs.writeFileSync(config.certificatesPath, JSON.stringify(certificates, null, 2));
  } catch (error) {
    console.error('Failed to save Dovu data:', error.message);
  }
}

/**
 * Get all carbon offset projects
 */
function getProjects(filters = {}) {
  let result = [...projects.projects];
  
  if (filters.type) {
    result = result.filter(p => p.type === filters.type);
  }
  if (filters.country) {
    result = result.filter(p => p.country.toLowerCase() === filters.country.toLowerCase());
  }
  if (filters.standard) {
    result = result.filter(p => p.standard === filters.standard);
  }
  if (filters.status) {
    result = result.filter(p => p.status === filters.status);
  }
  
  return result;
}

/**
 * Get project by ID
 */
function getProject(projectId) {
  return projects.projects.find(p => p.projectId === projectId) || null;
}

/**
 * Search projects by country
 */
function getProjectsByCountry(country) {
  return projects.projects.filter(p => 
    p.country.toLowerCase() === country.toLowerCase()
  );
}

/**
 * Calculate carbon footprint for export
 */
function calculateCarbonFootprint(product, weightKg, originCountry) {
  // Default carbon footprint factors (kg CO2e per kg of product)
  const factors = {
    'cocoa beans': 40,
    'sesame seeds': 30,
    'coffee': 35,
    'timber': 50,
    'groundnuts': 25,
    'cashew nuts': 22,
    'ginger': 20
  };
  
  const factor = factors[product.toLowerCase()] || 35;
  const footprint = weightKg * factor;
  
  // Estimate carbon credits needed to offset
  const creditsNeeded = Math.ceil(footprint / 1000); // 1 credit = 1 tonne
  
  // Get average price from available projects
  const countryProjects = getProjectsByCountry(originCountry);
  let avgPrice = 15.00; // default
  if (countryProjects.length > 0) {
    avgPrice = countryProjects.reduce((sum, p) => sum + p.pricePerTon, 0) / countryProjects.length;
  }
  
  return {
    product,
    weightKg,
    originCountry,
    carbonFootprintKg: footprint,
    carbonFootprintTonnes: footprint / 1000,
    creditsNeeded,
    estimatedCost: creditsNeeded * avgPrice,
    averagePricePerTon: avgPrice,
    unit: 'kg CO2e'
  };
}

/**
 * Purchase carbon credits
 */
function purchaseCredits(projectId, credits, exporterId, product, weightKg) {
  const project = getProject(projectId);
  if (!project) {
    return { success: false, error: 'Project not found' };
  }
  
  if (project.creditsAvailable < credits) {
    return { success: false, error: 'Insufficient credits available' };
  }
  
  // Calculate cost
  const totalCost = credits * project.pricePerTon;
  
  // Create certificate
  const certificate = {
    certificateId: `DOVU-CERT-${Date.now()}`,
    projectId,
    exporterId,
    product,
    hsCode: getHSCode(product),
    originCountry: project.country,
    weightKg,
    carbonFootprint: weightKg * 0.04, // estimate
    creditsPurchased: credits,
    creditsPrice: project.pricePerTon,
    totalCost,
    certificateType: 'carbon_offset',
    issueDate: new Date().toISOString().split('T')[0],
    validityYears: 1,
    status: 'active',
    verification: 'pending'
  };
  
  // Save certificate
  certificates.certificates.push(certificate);
  certificates.lastUpdated = new Date().toISOString();
  
  // Update project
  project.creditsAvailable -= credits;
  project.creditsIssued += credits;
  
  saveData();
  
  return {
    success: true,
    certificate,
    project: {
      projectId: project.projectId,
      name: project.name,
      creditsRemaining: project.creditsAvailable
    }
  };
}

/**
 * Get HS code for product
 */
function getHSCode(product) {
  const mapping = {
    'cocoa beans': '180100',
    'sesame seeds': '120740',
    'coffee': '090111',
    'timber': '440710',
    'groundnuts': '120729',
    'cashew nuts': '080131',
    'ginger': '120890'
  };
  return mapping[product.toLowerCase()] || '000000';
}

/**
 * Validate carbon certificate
 */
function validateCertificate(certificateId) {
  const cert = certificates.certificates.find(c => c.certificateId === certificateId);
  
  if (!cert) {
    return { valid: false, reason: 'Certificate not found' };
  }
  
  // Check expiry
  const issueDate = new Date(cert.issueDate);
  const expiryDate = new Date(issueDate);
  expiryDate.setFullYear(expiryDate.getFullYear() + cert.validityYears);
  
  if (new Date() > expiryDate) {
    return { valid: false, reason: 'Certificate expired', certificate: cert };
  }
  
  if (cert.status !== 'active') {
    return { valid: false, reason: `Certificate status: ${cert.status}`, certificate: cert };
  }
  
  const project = getProject(cert.projectId);
  
  return {
    valid: true,
    certificate: cert,
    project: project ? {
      name: project.name,
      type: project.type,
      standard: project.standard
    } : null,
    carbonOffset: {
      credits: cert.creditsPurchased,
      co2eOffset: cert.creditsPurchased * 1000 // kg
    }
  };
}

/**
 * Get certificates by exporter
 */
function getCertificatesByExporter(exporterId) {
  return certificates.certificates.filter(c => c.exporterId === exporterId);
}

/**
 * Get certificates by product
 */
function getCertificatesByProduct(product) {
  return certificates.certificates.filter(c => 
    c.product.toLowerCase() === product.toLowerCase()
  );
}

/**
 * Get all certificates
 */
function getAllCertificates() {
  return certificates.certificates;
}

/**
 * Get sustainability score for exporter
 */
function getExporterSustainabilityScore(exporterId) {
  const exporterCerts = getCertificatesByExporter(exporterId);
  
  if (exporterCerts.length === 0) {
    return {
      exporterId,
      score: 0,
      tier: 'NONE',
      creditsTotal: 0,
      message: 'No carbon offset certificates found'
    };
  }
  
  const totalCredits = exporterCerts.reduce((sum, c) => sum + c.creditsPurchased, 0);
  const totalValue = exporterCerts.reduce((sum, c) => sum + c.totalCost, 0);
  
  // Calculate tier
  let tier, score;
  if (totalCredits >= 1000) {
    tier = 'PLATINUM';
    score = 100;
  } else if (totalCredits >= 500) {
    tier = 'GOLD';
    score = 80;
  } else if (totalCredits >= 200) {
    tier = 'SILVER';
    score = 60;
  } else {
    tier = 'BRONZE';
    score = 40;
  }
  
  return {
    exporterId,
    score,
    tier,
    creditsTotal: totalCredits,
    investmentTotal: totalValue,
    certificatesCount: exporterCerts.length,
    message: `${tier} sustainability rating`
  };
}

/**
 * Get statistics
 */
function getStatistics() {
  const totalCredits = projects.projects.reduce((sum, p) => sum + p.creditsIssued, 0);
  const availableCredits = projects.projects.reduce((sum, p) => sum + p.creditsAvailable, 0);
  const totalValue = certificates.certificates.reduce((sum, c) => sum + c.totalCost, 0);
  
  return {
    totalProjects: projects.projects.length,
    totalCreditsIssued: totalCredits,
    creditsAvailable: availableCredits,
    totalCertificates: certificates.certificates.length,
    totalValue: totalValue,
    byCountry: projects.projects.reduce((acc, p) => {
      acc[p.country] = (acc[p.country] || 0) + 1;
      return acc;
    }, {}),
    byType: projects.projects.reduce((acc, p) => {
      acc[p.type] = (acc[p.type] || 0) + 1;
      return acc;
    }, {})
  };
}

/**
 * Get configuration
 */
function getConfig() {
  return {
    protocol: config.protocol,
    version: config.version,
    projectTypes: config.projectTypes,
    standards: config.standards,
    projectsCount: projects.projects.length,
    certificatesCount: certificates.certificates.length
  };
}

// Initialize on load
initialize().catch(console.error);

module.exports = {
  initialize,
  getProjects,
  getProject,
  getProjectsByCountry,
  calculateCarbonFootprint,
  purchaseCredits,
  validateCertificate,
  getCertificatesByExporter,
  getCertificatesByProduct,
  getAllCertificates,
  getExporterSustainabilityScore,
  getStatistics,
  getConfig
};
