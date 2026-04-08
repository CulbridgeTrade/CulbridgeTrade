interface ValidationResultProps {
  result: {
    decision: "OK" | "WARNING" | "BLOCK";
    reason: string;
    action: string[];
    confidence: "LOW" | "MEDIUM" | "HIGH";
    source: "normal" | "emergency";
  };
}

export default function ValidationResult({ result }: ValidationResultProps) {
  const config = {
    OK:      { icon: "✅", label: "CLEAR",   color: "green" },
    WARNING: { icon: "⚠️", label: "WARNING", color: "amber" },
    BLOCK:   { icon: "❌", label: "BLOCKED", color: "red"   }
  }[result.decision];

  return (
    <div className={`result result--${result.decision.toLowerCase()}`}>
      <div className="result-header">
        <span>{config.icon}</span>
        <strong>{config.label}</strong>
        <span className="confidence">Confidence: {result.confidence}</span>
      </div>
      <div className="result-reason">
        <strong>Finding:</strong>
        <p>{result.reason}</p>
      </div>
      <div className="result-actions">
        <strong>Actions:</strong>
        <ul>
          {result.action.map((a, i) => <li key={i}>{a}</li>)}
        </ul>
      </div>
      {result.confidence === "LOW" && (
        <p className="caveat">
          ⚠️ Preliminary assessment only. Upload a clearer document for a full check.
        </p>
      )}
    </div>
  );
}
