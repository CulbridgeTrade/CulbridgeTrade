import { useState } from "react";
import ValidationResult from "./ValidationResult";

export default function EmergencyModal({ onClose }: { onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [commodity, setCommodity] = useState("");
  const [destination, setDestination] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function handleCheck() {
    if (!file) return;
    setLoading(true);
    const formData = new FormData();
    formData.append("file", file);
    if (commodity) formData.append("commodity", commodity);
    if (destination) formData.append("destination", destination);

    try {
      const res = await fetch("/api/v1/emergency-check", {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setResult({
        decision: "WARNING" as const,
        reason: "Unable to connect to validation service",
        action: ["Try again later", "Contact support if problem persists"],
        confidence: "LOW" as const,
        source: "emergency" as const
      });
    }
    setLoading(false);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Emergency Compliance Check</h2>

        <label>Document (required)</label>
        <input 
          type="file" 
          accept="image/*,.pdf"
          onChange={e => setFile(e.target.files?.[0] ?? null)} 
        />

        <label>Commodity (optional)</label>
        <select value={commodity} onChange={e => setCommodity(e.target.value)}>
          <option value="">Unknown</option>
          <option value="sesame">Sesame Seeds</option>
          <option value="cocoa">Cocoa Beans</option>
        </select>

        <label>Destination (optional)</label>
        <select value={destination} onChange={e => setDestination(e.target.value)}>
          <option value="">Unknown</option>
          <option value="NL">Netherlands</option>
          <option value="DE">Germany</option>
        </select>

        <div className="button-row">
          <button onClick={handleCheck} disabled={!file || loading}>
            {loading ? "Checking..." : "Run Check"}
          </button>
          <button onClick={onClose} className="secondary">Cancel</button>
        </div>

        {result && <ValidationResult result={result} />}
      </div>
    </div>
  );
}
