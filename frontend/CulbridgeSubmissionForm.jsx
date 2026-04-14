/**
 * CulbridgeSubmissionForm.jsx
 *
 * Production-ready shipment submission form for Culbridge Trade Compliance Platform.
 * Plug this component into your Next.js app.
 *
 * ENVIRONMENT VARIABLE REQUIRED:
 *   NEXT_PUBLIC_API_URL=https://culbridgetrade.onrender.com
 *
 * DEPENDENCIES:
 *   React (hooks: useState, useEffect, useRef, useCallback)
 *   No third-party UI libraries required.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import api from "../lib/api";

// COLORS
const C = {
  navy: "#0B1929",
  navyLight: "#112236",
  navyBorder: "#1E3A5F",
  orange: "#F97316",
  orangeLight: "rgba(249,115,22,0.12)",
  orangeBorder: "rgba(249,115,22,0.35)",
  green: "#1a7a4a",
  greenLight: "rgba(26,122,74,0.12)",
  greenBorder: "rgba(26,122,74,0.35)",
  white: "#FFFFFF",
  text: "#E8EDF2",
  textMuted: "#7A95B0",
  textFaint: "#3D5A75",
  red: "#E53E3E",
  redLight: "rgba(229,62,62,0.10)",
  redBorder: "rgba(229,62,62,0.30)",
  amber: "#D97706",
  amberLight: "rgba(217,119,6,0.10)",
  amberBorder: "rgba(217,119,6,0.30)",
  border: "#1E3A5F",
  inputBg: "#0D1F33",
  cardBg: "#0F2132",
};

const FONT = "'Outfit', sans-serif";

// GLOBAL DISCLAIMER - Persistent Footer
const GLOBAL_DISCLAIMER = "Culbridge guidance is based on current system rules. Exporters remain responsible for compliance and customs clearance. Physical inspections and regulatory updates may override these recommendations.";

// COMMODITY AND DESTINATION OPTIONS
const COMMODITY_OPTIONS = [
  { value: "cocoa", label: "Cocoa" },
  { value: "sesame", label: "Sesame" },
  { value: "ginger", label: "Ginger" },
  { value: "beans", label: "Beans" },
  { value: "groundnuts", label: "Groundnuts" },
  { value: "other", label: "Other" },
];

const DESTINATION_OPTIONS = [
  { value: "NL", label: "Netherlands" },
  { value: "DE", label: "Germany" },
];

const PORT_OPTIONS = [
  { value: "APMT", label: "Lagos (APMT Terminal)" },
  { value: "TIN_CAN", label: "Lagos (Tin Can Island)" },
  { value: "ONNE", label: "Onne Port, Rivers State" },
  { value: "CALABAR", label: "Calabar Port" },
];

// STEP LABELS
const STEPS = [
  "What Are You Exporting",
  "Your Company Details",
  "Upload Documents",
  "Compliance Check",
  "Review and Submit",
];

// UI COMPONENTS
function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: 18,
      fontWeight: 600,
      color: C.white,
      marginBottom: 20,
      fontFamily: FONT,
    }}>
      {children}
    </div>
  );
}

function Label({ children, required }) {
  return (
    <div style={{
      fontSize: 13,
      fontWeight: 500,
      color: C.textMuted,
      marginBottom: 6,
      fontFamily: FONT,
    }}>
      {children}
      {required && <span style={{ color: C.orange, marginLeft: 4 }}>*</span>}
    </div>
  );
}

function Input({ label, value, onChange, placeholder, required, hint, readOnly }) {
  return (
    <div>
      <Label required={required}>{label}</Label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        style={{
          width: "100%",
          padding: "13px",
          borderRadius: 8,
          border: `1px solid ${C.border}`,
          background: C.inputBg,
          color: readOnly ? C.textFaint : C.text,
          fontSize: 14,
          fontFamily: FONT,
          outline: "none",
          boxSizing: "border-box",
        }}
      />
      {hint && (
        <div style={{ fontSize: 12, color: C.textFaint, marginTop: 4, fontFamily: FONT }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function Select({ label, value, onChange, options, required }) {
  return (
    <div>
      <Label required={required}>{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          padding: "13px",
          borderRadius: 8,
          border: `1px solid ${C.border}`,
          background: C.inputBg,
          color: C.text,
          fontSize: 14,
          fontFamily: FONT,
          outline: "none",
          boxSizing: "border-box",
          cursor: "pointer",
        }}
      >
        <option value="">Select...</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Button({ children, onClick, variant = "primary", fullWidth, disabled, loading, type, lg }) {
  const baseStyle = {
    padding: lg ? "14px 24px" : "12px 20px",
    borderRadius: 8,
    fontSize: lg ? 16 : 14,
    fontWeight: 600,
    fontFamily: FONT,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    border: "none",
    transition: "none",
  };

  const variants = {
    primary: { background: C.orange, color: C.white },
    secondary: { background: C.navyLight, color: C.text, border: `1px solid ${C.border}` },
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        ...baseStyle,
        ...variants[variant],
        width: fullWidth ? "100%" : "auto",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
      }}
    >
      {loading ? "Processing..." : children}
    </button>
  );
}

function Card({ children }) {
  return (
    <div style={{
      background: C.cardBg,
      borderRadius: 12,
      border: `1px solid ${C.border}`,
      padding: 24,
    }}>
      {children}
    </div>
  );
}

function StepIndicator({ current, total, labels }) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      marginBottom: 32,
      position: "relative",
    }}>
      <div style={{
        position: "absolute",
        top: 14,
        left: 0,
        right: 0,
        height: 2,
        background: C.border,
        zIndex: 0,
      }} />
      {labels.map((label, index) => {
        const isActive = index <= current;
        const isCurrent = index === current;
        return (
          <div key={index} style={{ position: "relative", zIndex: 1, textAlign: "center", flex: 1 }}>
            <div style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: isActive ? C.orange : C.navyLight,
              border: `2px solid ${isActive ? C.orange : C.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 8px",
              fontSize: 12,
              fontWeight: 600,
              color: isActive ? C.white : C.textFaint,
              fontFamily: FONT,
            }}>
              {index + 1}
            </div>
            <div style={{
              fontSize: 11,
              color: isCurrent ? C.white : C.textMuted,
              fontFamily: FONT,
            }}>
              {label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AlertBanner({ type, title, children }) {
  const colors = {
    blocker: { bg: C.redLight, border: C.redBorder, title: C.red },
    warning: { bg: C.amberLight, border: C.amberBorder, title: C.amber },
    success: { bg: C.greenLight, border: C.greenBorder, title: C.green },
    error: { bg: C.redLight, border: C.redBorder, title: C.red },
  };
  const style = colors[type] || colors.error;

  return (
    <div style={{
      background: style.bg,
      border: `1px solid ${style.border}`,
      borderRadius: 8,
      padding: 16,
      marginBottom: 16,
    }}>
      <div style={{ fontWeight: 600, color: style.title, marginBottom: 8, fontFamily: FONT }}>
        {title}
      </div>
      <div style={{ fontSize: 13, color: C.text, fontFamily: FONT }}>
        {children}
      </div>
    </div>
  );
}

function DisclaimerBanner({ message }) {
  return (
    <div style={{
      background: C.orangeLight,
      border: `1px solid ${C.orangeBorder}`,
      borderRadius: 8,
      padding: 12,
      marginBottom: 20,
      fontSize: 13,
      color: C.textMuted,
      fontFamily: FONT,
    }}>
      {message}
    </div>
  );
}

function FileUpload({ label, value, onChange, required, hint }) {
  const [fileName, setFileName] = useState(value || "");
  const [fileSize, setFileSize] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError("PDF only");
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setError("Max 20MB");
      return;
    }

    setError(null);
    setUploading(true);

    // Simulate upload delay
    await new Promise(resolve => setTimeout(resolve, 500));

    setFileName(file.name);
    setFileSize((file.size / 1024).toFixed(1) + " KB");
    setUploading(false);
    onChange(file.name);
  };

  return (
    <div>
      <Label required={required}>{label}</Label>
      <div style={{ position: "relative" }}>
        <input
          type="file"
          ref={fileInputRef}
          accept=".pdf"
          onChange={handleFileChange}
          style={{
            width: "100%",
            padding: "13px",
            borderRadius: 8,
            border: error ? `1px solid ${C.red}` : `1px solid ${C.border}`,
            background: C.inputBg,
            color: C.text,
            fontSize: 14,
            fontFamily: FONT,
          }}
        />
        {hint && (
          <div style={{ fontSize: 11, color: C.textFaint, marginTop: 4, position: "absolute", bottom: -18, left: 0 }}>
            {hint}
          </div>
        )}
      </div>
      {error && (
        <div style={{ fontSize: 12, color: C.red, marginTop: 8 }}>
          {error}
        </div>
      )}
      {fileName && !error && (
        <div style={{
          marginTop: 8,
          padding: "10px 12px",
          background: C.greenLight,
          borderRadius: 6,
          fontSize: 13,
          color: C.green,
          fontFamily: FONT,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <span>{fileName}</span>
          <span style={{ fontSize: 12 }}>{fileSize}</span>
        </div>
      )}
    </div>
  );
}

function LabResultInput({ testName, value, unit, labName, onValueChange, onUnitChange, onLabChange }) {
  return (
    <div style={{
      background: C.navyLight,
      padding: 16,
      borderRadius: 8,
      marginBottom: 12,
    }}>
      <div style={{ fontWeight: 600, color: C.white, marginBottom: 12, fontFamily: FONT, fontSize: 14 }}>
        {testName}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 1fr", gap: 12 }}>
        <div>
          <Label>Value</Label>
          <input
            type="number"
            value={value || ""}
            onChange={(e) => onValueChange(e.target.value)}
            placeholder="0.00"
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: 6,
              border: `1px solid ${C.border}`,
              background: C.inputBg,
              color: C.text,
              fontSize: 14,
              fontFamily: FONT,
            }}
          />
        </div>
        <div>
          <Label>Unit</Label>
          <select
            value={unit || "μg/kg"}
            onChange={(e) => onUnitChange(e.target.value)}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: 6,
              border: `1px solid ${C.border}`,
              background: C.inputBg,
              color: C.text,
              fontSize: 14,
              fontFamily: FONT,
            }}
          >
            <option value="μg/kg">μg/kg</option>
            <option value="mg/kg">mg/kg</option>
            <option value="%">%</option>
          </select>
        </div>
        <div>
          <Label>Lab Name</Label>
          <input
            type="text"
            value={labName || ""}
            onChange={(e) => onLabChange(e.target.value)}
            placeholder="Lab name"
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: 6,
              border: `1px solid ${C.border}`,
              background: C.inputBg,
              color: C.text,
              fontSize: 14,
              fontFamily: FONT,
            }}
          />
        </div>
      </div>
    </div>
  );
}

function PersistentFooter() {
  return (
    <div style={{
      position: "fixed",
      bottom: 0,
      left: 0,
      right: 0,
      background: C.navyLight,
      padding: "12px 20px",
      fontSize: 12,
      color: C.textMuted,
      fontFamily: FONT,
      zIndex: 1000,
      borderTop: `1px solid ${C.navyBorder}`,
    }}>
      {GLOBAL_DISCLAIMER}
    </div>
  );
}

function SaveIndicator({ lastSaved }) {
  if (!lastSaved) return null;
  return (
    <div style={{
      fontSize: 12,
      color: C.green,
      fontFamily: FONT,
      textAlign: "right",
      marginBottom: 8,
    }}>
      Saved {lastSaved}
    </div>
  );
}

function DuplicateWarning({ previousSubmission, onConfirm, onCancel }) {
  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: "rgba(0,0,0,0.8)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 2000,
    }}>
      <div style={{
        background: C.cardBg,
        borderRadius: 12,
        padding: 24,
        maxWidth: 400,
        border: `1px solid ${C.border}`,
      }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: C.white, marginBottom: 16, fontFamily: FONT }}>
          Duplicate Submission Detected
        </div>
        <div style={{ fontSize: 14, color: C.textMuted, marginBottom: 20, fontFamily: FONT }}>
          This appears to be a duplicate submission. Culbridge cannot prevent duplicate shipments if you choose to proceed. Ensure you are submitting a distinct shipment before continuing.
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <Button variant="secondary" onClick={onCancel} fullWidth>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm} fullWidth>
            Yes, Submit Again
          </Button>
        </div>
      </div>
    </div>
  );
}

function BeansBlocker({ onAcknowledge }) {
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: C.navy,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 2000,
      padding: 20,
    }}>
      <div style={{
        background: C.cardBg,
        borderRadius: 12,
        padding: 32,
        maxWidth: 500,
        border: `1px solid ${C.red}`,
        textAlign: "center",
      }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: C.red, marginBottom: 16, fontFamily: FONT }}>
          Import Restricted
        </div>
        <div style={{ fontSize: 15, color: C.text, marginBottom: 24, fontFamily: FONT, lineHeight: 1.6 }}>
          Dried beans currently face active EU import restrictions for Nigerian exports. You must contact the Culbridge compliance team before proceeding.
        </div>
        <div style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          padding: 16,
          background: C.navyLight,
          borderRadius: 8,
          marginBottom: 24,
          textAlign: "left",
        }}>
          <input
            type="checkbox"
            id="beansAcknowledge"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            style={{ width: 18, height: 18, marginTop: 2, accentColor: C.orange, flexShrink: 0 }}
          />
          <label htmlFor="beansAcknowledge" style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.5, cursor: "pointer" }}>
            I understand beans are currently restricted and I must contact the compliance team.
          </label>
        </div>
        <Button fullWidth lg disabled={!acknowledged} onClick={onAcknowledge}>
          I Acknowledge
        </Button>
      </div>
    </div>
  );
}

// MAIN COMPONENT
function CulbridgeSubmissionForm() {
  const [step, setStep] = useState(0);
  const [submission, setSubmission] = useState({
    commodity: "",
    destination: "",
    hsCode: "",
    quantity: "",
    port: "",
    shipmentDate: "",
    companyName: "",
    rcNumber: "",
    nxpNumber: "",
    contactName: "",
    contactPhone: "",
    documents: {},
    labResults: {},
  });
  const [requirements, setRequirements] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [complianceResult, setComplianceResult] = useState(null);
  const [lastSaved, setLastSaved] = useState(null);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [previousSubmission, setPreviousSubmission] = useState(null);
  const [submissionComplete, setSubmissionComplete] = useState(false);
  const [submissionRef, setSubmissionRef] = useState(null);
  const fileInputRef = useRef();

  const getToken = () => localStorage.getItem("culbridge_access_token") || "";

  const saveSubmission = useCallback(async () => {
    try {
      await api.post("/api/v1/shipments/autosave", submission);
      setLastSaved("just now");
    } catch (e) {
      console.error("Autosave failed:", e);
    }
  }, [submission]);

  useEffect(() => {
    if (step > 0 && submission.commodity) {
      const timer = setTimeout(saveSubmission, 1000);
      return () => clearTimeout(timer);
    }
  }, [submission, step, saveSubmission]);

  // Fetch requirements when commodity/destination changes
  useEffect(() => {
    if (submission.commodity && submission.destination) {
      fetchRequirements();
    }
  }, [submission.commodity, submission.destination]);

  // Auto-trigger compliance check when documents or lab results change (in step 2)
  useEffect(() => {
    if (step === 2 && submission.commodity && submission.destination) {
      // Check if documents or lab results have been added
      const hasDocuments = Object.values(submission.documents || {}).some(v => v);
      const hasLabResults = Object.values(submission.labResults || {}).some(v => v && v.value);
      
      if (hasDocuments || hasLabResults) {
        // Debounce the compliance check
        const timer = setTimeout(() => {
          runComplianceCheck();
        }, 1500);
        return () => clearTimeout(timer);
      }
    }
  }, [submission.documents, submission.labResults, step, submission.commodity, submission.destination]);

  const fetchRequirements = async () => {
    try {
      const result = await api.get(`/api/v1/requirements?commodity=${submission.commodity}&destination=${submission.destination}`);
      setRequirements(result);
    } catch (e) {
      console.error("Failed to fetch requirements:", e);
    }
  };

  const runComplianceCheck = async () => {
    setLoading(true);
    try {
      const result = await api.post("/api/v1/engine/evaluate", {
        commodity: submission.commodity,
        destination: submission.destination,
        documents: submission.documents,
        labResults: submission.labResults,
        hsCode: submission.hsCode,
      });
      setComplianceResult(result);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const submitShipment = async () => {
    setLoading(true);
    try {
      // Check for duplicate
      const preSubmitCheck = await api.post("/api/v1/shipments/pre-submit-check", submission);
      
      if (preSubmitCheck.duplicateDetected) {
        setPreviousSubmission(preSubmitCheck.previousSubmission);
        setShowDuplicateWarning(true);
        setLoading(false);
        return;
      }

      if (preSubmitCheck.blockers?.length > 0) {
        setComplianceResult(preSubmitCheck);
        setError("Pre-submit check failed. Please review the issues.");
        setLoading(false);
        return;
      }

      const result = await api.post("/api/v1/shipments", submission);
      setSubmissionRef(result.referenceNumber);
      setSubmissionComplete(true);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const handleConfirmDuplicate = () => {
    setShowDuplicateWarning(false);
    submitShipment();
  };

  const handleCancelDuplicate = () => {
    setShowDuplicateWarning(false);
    setPreviousSubmission(null);
  };

  // Handle Beans block
  if (submission.commodity === "beans" && step >= 1 && !acknowledged) {
    return <BeansBlocker onAcknowledge={() => setAcknowledged(true)} />;
  }

  // Handle submission complete
  if (submissionComplete) {
    return (
      <div style={{ minHeight: "100vh", padding: "32px 24px 120px", background: C.navy }}>
        <StyleInjector />
        <PersistentFooter />
        <div style={{ maxWidth: 560, margin: "0 auto", padding: "40px 20px", textAlign: "center" }}>
          <Card>
            <div style={{ fontSize: 32, marginBottom: 16 }}>✓</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: C.white, marginBottom: 12, fontFamily: FONT }}>
              Submission Received
            </div>
            <div style={{ fontSize: 14, color: C.text, marginBottom: 24, fontFamily: FONT }}>
              Your shipment has been received by Culbridge. Reference number: {submissionRef}. Our compliance team will review and you will be notified within 24 hours. Submission to NSW will follow.
            </div>
            <Button onClick={() => window.location.reload()} fullWidth>
              Start New Submission
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  const validateStep = (currentStep) => {
    switch (currentStep) {
      case 0:
        if (!submission.commodity || !submission.destination) return "Please fill all required fields";
        return null;
      case 1:
        if (!submission.companyName || !submission.rcNumber || !submission.nxpNumber) return "Please fill all required fields";
        return null;
      case 2:
        if (!requirements) return null;
        const requiredDocs = requirements.documents?.filter(d => d.required) || [];
        const uploadedCount = requiredDocs.filter(d => submission.documents[d.name]).length;
        if (uploadedCount < requiredDocs.length) return `Please upload all required documents (${uploadedCount}/${requiredDocs.length})`;
        return null;
      default:
        return null;
    }
  };

  const handleNext = () => {
    const err = validateStep(step);
    if (err) {
      setError(err);
      return;
    }
    if (step === 2) {
      runComplianceCheck();
      return;
    }
    if (step === 3) {
      // Ready to go to review
      setStep(4);
      return;
    }
    setStep(s => s + 1);
  };

  const renderStepContent = () => {
    switch (step) {
      case 0:
        return (
          <>
            <SectionTitle>What Are You Exporting</SectionTitle>
            <div style={{ display: "grid", gap: 24 }}>
              <Select
                label="Commodity"
                required
                options={COMMODITY_OPTIONS}
                value={submission.commodity}
                onChange={v => setSubmission(p => ({ ...p, commodity: v, hsCode: "" }))}
              />
              <Select
                label="Destination"
                required
                options={DESTINATION_OPTIONS}
                value={submission.destination}
                onChange={v => setSubmission(p => ({ ...p, destination: v }))}
              />
              {submission.hsCode && (
                <Input
                  label="HS Code"
                  value={submission.hsCode}
                  onChange={() => {}}
                  readOnly
                  hint="Not correct? Contact support"
                />
              )}
              <Input
                label="Quantity (Metric Tonnes)"
                required
                value={submission.quantity}
                onChange={v => setSubmission(p => ({ ...p, quantity: v }))}
                placeholder="0"
              />
              <Select
                label="Port of Loading"
                required
                options={PORT_OPTIONS}
                value={submission.port}
                onChange={v => setSubmission(p => ({ ...p, port: v }))}
              />
              <Input
                label="Expected Shipment Date"
                required
                type="date"
                value={submission.shipmentDate}
                onChange={v => setSubmission(p => ({ ...p, shipmentDate: v }))}
              />
            </div>
          </>
        );
      case 1:
        return (
          <>
            <SectionTitle>Your Company Details</SectionTitle>
            <div style={{ display: "grid", gap: 24 }}>
              <Input
                label="Company Name"
                required
                value={submission.companyName}
                onChange={v => setSubmission(p => ({ ...p, companyName: v }))}
              />
              <Input
                label="RC Number"
                required
                value={submission.rcNumber}
                onChange={v => setSubmission(p => ({ ...p, rcNumber: v }))}
                placeholder="RC123456"
              />
              <Input
                label="NXP Number"
                required
                value={submission.nxpNumber}
                onChange={v => setSubmission(p => ({ ...p, nxpNumber: v }))}
                placeholder="NXP123456"
              />
              <Input
                label="Contact Name"
                value={submission.contactName}
                onChange={v => setSubmission(p => ({ ...p, contactName: v }))}
              />
              <Input
                label="Contact Phone"
                value={submission.contactPhone}
                onChange={v => setSubmission(p => ({ ...p, contactPhone: v }))}
                placeholder="+234..."
              />
            </div>
          </>
        );
      case 2:
        const docSlots = requirements?.documents || [];
        const labTests = requirements?.labTests || [];
        const requiredCount = docSlots.filter(d => d.required).length;
        const uploadedCount = docSlots.filter(d => submission.documents[d.name]).length;

        return (
          <>
            <SectionTitle>Upload Documents</SectionTitle>
            <DisclaimerBanner message="All documents are verified against accredited labs (ISO 17025) and registries (NAQS, NAFDAC)." />
            <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 16, fontFamily: FONT }}>
              Documents uploaded: {uploadedCount} of {requiredCount} required
            </div>
            <div style={{ display: "grid", gap: 20 }}>
              {docSlots.map((doc, index) => (
                <FileUpload
                  key={index}
                  label={doc.label}
                  required={doc.required}
                  hint="PDF only, max 20MB"
                  value={submission.documents[doc.name]}
                  onChange={v => setSubmission(p => ({ ...p, documents: { ...p.documents, [doc.name]: v } }))}
                />
              ))}
            </div>
            {labTests.length > 0 && (
              <>
                <div style={{ fontSize: 16, fontWeight: 600, color: C.white, marginTop: 24, marginBottom: 16, fontFamily: FONT }}>
                  Lab Results
                </div>
                {labTests.map((test, index) => (
                  <LabResultInput
                    key={index}
                    testName={test.name}
                    value={submission.labResults[test.name]?.value}
                    unit={submission.labResults[test.name]?.unit}
                    labName={submission.labResults[test.name]?.labName}
                    onValueChange={v => setSubmission(p => ({
                      ...p,
                      labResults: {
                        ...p.labResults,
                        [test.name]: { ...p.labResults[test.name], value: v }
                      }
                    }))}
                    onUnitChange={v => setSubmission(p => ({
                      ...p,
                      labResults: {
                        ...p.labResults,
                        [test.name]: { ...p.labResults[test.name], unit: v }
                      }
                    }))}
                    onLabChange={v => setSubmission(p => ({
                      ...p,
                      labResults: {
                        ...p.labResults,
                        [test.name]: { ...p.labResults[test.name], labName: v }
                      }
                    }))}
                  />
                ))}
              </>
            )}
            {requiredCount > uploadedCount && (
              <div style={{ marginTop: 16, fontSize: 13, color: C.textFaint, fontFamily: FONT }}>
                Missing: {docSlots.filter(d => d.required && !submission.documents[d.name]).map(d => d.label).join(", ")}
              </div>
            )}
          </>
        );
      case 3:
        return (
          <>
            <SectionTitle>Compliance Check</SectionTitle>
            {complianceResult ? (
              <>
                {complianceResult.status === "READY" && (
                  <AlertBanner type="success" title="Ready to Submit">
                    Based on the information provided, your shipment appears compliant with current requirements. Final checks will occur during official review.
                  </AlertBanner>
                )}
                {complianceResult.status === "WARNING" && (
                  <AlertBanner type="warning" title="Proceed with Caution">
                    See issues below.
                  </AlertBanner>
                )}
                {complianceResult.status === "BLOCKED" && (
                  <AlertBanner type="blocker" title="Cannot Submit">
                    Your shipment cannot be submitted. See issues below.
                  </AlertBanner>
                )}
                {complianceResult.issues?.length > 0 && (
                  <>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.white, marginBottom: 8, marginTop: 16, fontFamily: FONT }}>
                      Issues Requiring Attention
                    </div>
                    {complianceResult.issues.filter(i => i.severity === "BLOCKER" || i.severity === "ERROR").map((issue, i) => (
                      <AlertBanner key={i} type={issue.severity === "BLOCKER" ? "blocker" : "warning"} title={issue.title}>
                        <div>{issue.message}</div>
                        {issue.action && (
                          <div style={{ marginTop: 8, padding: "8px 12px", background: C.navyLight, borderRadius: 6, border: `1px solid ${C.orangeBorder}` }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: C.orange, marginBottom: 4 }}>Action Required:</div>
                            <div style={{ fontSize: 13, color: C.text }}>{issue.action}</div>
                          </div>
                        )}
                      </AlertBanner>
                    ))}
                  </>
                )}
                {complianceResult.notes?.length > 0 && (
                  <>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.white, marginBottom: 8, marginTop: 16, fontFamily: FONT }}>
                      Additional Notes
                    </div>
                    {complianceResult.notes.map((note, i) => (
                      <AlertBanner key={i} type="warning" title={note.title}>
                        {note.message}
                      </AlertBanner>
                    ))}
                  </>
                )}
              </>
            ) : (
              <div style={{ textAlign: "center", padding: 40, color: C.textFaint, fontFamily: FONT }}>
                <div style={{ fontSize: 24, marginBottom: 12 }}>⟳</div>
                <div>Running compliance check...</div>
              </div>
            )}
          </>
        );
      case 4:
        const docList = Object.entries(submission.documents).filter(([k, v]) => v);
        return (
          <>
            <SectionTitle>Review and Submit</SectionTitle>
            <div style={{ display: "grid", gap: 16 }}>
              <div style={{ background: C.navyLight, padding: 16, borderRadius: 8, fontSize: 13, fontFamily: FONT }}>
                <div style={{ fontWeight: 600, marginBottom: 8, color: C.white }}>Shipment Details</div>
                <div style={{ color: C.textMuted, lineHeight: 1.8 }}>
                  Commodity: {COMMODITY_OPTIONS.find(c => c.value === submission.commodity)?.label}<br />
                  HS Code: {submission.hsCode || "Pending"}<br />
                  Destination: {DESTINATION_OPTIONS.find(d => d.value === submission.destination)?.label}<br />
                  Quantity: {submission.quantity} MT<br />
                  Port: {PORT_OPTIONS.find(p => p.value === submission.port)?.label}<br />
                  Shipment Date: {submission.shipmentDate}
                </div>
              </div>
              <div style={{ background: C.navyLight, padding: 16, borderRadius: 8, fontSize: 13, fontFamily: FONT }}>
                <div style={{ fontWeight: 600, marginBottom: 8, color: C.white }}>Company</div>
                <div style={{ color: C.textMuted, lineHeight: 1.8 }}>
                  {submission.companyName}<br />
                  RC: {submission.rcNumber}<br />
                  NXP: {submission.nxpNumber}
                </div>
              </div>
              <div style={{ background: C.navyLight, padding: 16, borderRadius: 8, fontSize: 13, fontFamily: FONT }}>
                <div style={{ fontWeight: 600, marginBottom: 8, color: C.white }}>Documents ({docList.length})</div>
                <div style={{ color: C.textMuted }}>
                  {docList.map(([name, fileName]) => (
                    <div key={name}>• {fileName}</div>
                  ))}
                </div>
              </div>
              <div style={{ background: C.navyLight, padding: 16, borderRadius: 8, fontSize: 13, fontFamily: FONT }}>
                <div style={{ fontWeight: 600, marginBottom: 8, color: C.white }}>Compliance Status</div>
                <div style={{ color: complianceResult?.status === "READY" ? C.green : C.amber }}>
                  {complianceResult?.status || "Pending"}
                </div>
              </div>
              <div style={{ fontSize: 14, color: C.textMuted, fontFamily: FONT, padding: "12px 0" }}>
                Submission fee: To be confirmed. Payment will be processed via Remita after submission.
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: 16, background: C.navyLight, border: `1px solid ${C.border}`, borderRadius: 10 }}>
                <input
                  type="checkbox"
                  id="acknowledgeFinal"
                  checked={acknowledged}
                  onChange={e => setAcknowledged(e.target.checked)}
                  style={{ width: 18, height: 18, marginTop: 2, accentColor: C.orange, flexShrink: 0, cursor: "pointer" }}
                />
                <label htmlFor="acknowledgeFinal" style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.65, cursor: "pointer" }}>
                  I understand that Culbridge cannot override customs inspections, verify 100% accuracy of submitted documents or lab reports, or guarantee shipment clearance. I accept full responsibility for this shipment.
                </label>
              </div>
              <Button fullWidth lg onClick={submitShipment} disabled={!acknowledged} loading={loading}>
                {loading ? "Submitting your shipment..." : "Submit Shipment"}
              </Button>
            </div>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div style={{ minHeight: "100vh", padding: "32px 24px 120px", background: C.navy }}>
      <StyleInjector />
      <PersistentFooter />
      {showDuplicateWarning && (
        <DuplicateWarning
          previousSubmission={previousSubmission}
          onConfirm={handleConfirmDuplicate}
          onCancel={handleCancelDuplicate}
        />
      )}
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "40px 20px" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: C.white, margin: 0, marginBottom: 8, fontFamily: FONT }}>
            <span style={{ color: C.white }}>Cul</span><span style={{ color: C.orange }}>bridge</span>
          </h1>
          <div style={{ fontSize: 14, color: C.textFaint, fontFamily: FONT }}>
            Nigeria-EU Trade Compliance Platform
          </div>
        </div>
        <Card>
          <SaveIndicator lastSaved={lastSaved} />
          <StepIndicator current={step} total={STEPS.length} labels={STEPS} />
          {renderStepContent()}
          <div style={{ display: "flex", gap: 12, marginTop: 32 }}>
            {step > 0 && step < 4 && (
              <Button variant="secondary" onClick={() => setStep(s => s - 1)}>
                Back
              </Button>
            )}
            {step < 4 && (
              <Button
                variant="primary"
                fullWidth
                onClick={handleNext}
                loading={loading}
                disabled={loading}
              >
                {step === STEPS.length - 1 ? "Submit" : "Next"}
              </Button>
            )}
          </div>
          {error && (
            <AlertBanner type="error" title="Error">
              {error}
            </AlertBanner>
          )}
        </Card>
      </div>
    </div>
  );
}

// Style injector for fonts
function StyleInjector() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap');
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { background: ${C.navy}; }
      input, select, button { font-family: ${FONT}; }
      input::placeholder { color: ${C.textFaint}; }
    `}</style>
  );
}

export default CulbridgeSubmissionForm;
