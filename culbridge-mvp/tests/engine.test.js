import { runValidation } from '../src/engine.js';
import fs from 'fs';
import path from 'path';

const TEST_CASES = [
  {
    name: "Clear NVWA sesame rejection — Chlorpyrifos 45x",
    file: "nvwa_sesame_chlorpyrifos_clear.jpg",
    quality: "CLEAR",
    expected_decision: "BLOCK",
    expected_confidence: "HIGH"
  },
  {
    name: "Blurry image — should trigger confidence gate",
    file: "blurry_document.jpg",
    quality: "BLURRY",
    expected_decision: "WARNING",
    expected_confidence: "LOW"
  },
  {
    name: "BVL cocoa rejection — Ochratoxin A",
    file: "bvl_cocoa_ochratoxin.pdf",
    quality: "CLEAR",
    expected_decision: "BLOCK",
    expected_confidence: "HIGH"
  },
  {
    name: "Clean sesame shipment — no violations",
    file: "clean_sesame_documents.pdf",
    quality: "CLEAR",
    expected_decision: "OK",
    expected_confidence: "HIGH"
  }
];

describe("Validation Engine", () => {

  for (const tc of TEST_CASES) {
    test(tc.name, async () => {
      const filePath = path.join(__dirname, "documents", tc.file);
      
      if (!fs.existsSync(filePath)) {
        console.log(`Test file not found: ${tc.file} - skipping`);
        return;
      }

      const file = fs.readFileSync(filePath);

      const result = await runValidation({
        files: [file],
        mime_type: tc.file.endsWith(".pdf") ? "application/pdf" : "image/jpeg",
        source: "emergency"
      });

      expect(result.decision).toBe(tc.expected_decision);
      expect(result.confidence).toBe(tc.expected_confidence);
      expect(result.reason.length).toBeGreaterThan(20);
      expect(result.action.length).toBeGreaterThan(0);
      expect(result.reason).not.toContain("issue detected");
      expect(result.reason).not.toContain("compliance problem");
      expect(result.action[0]).not.toBe("Review your documentation");
    });
  }

  test("Both endpoints call same engine", async () => {
    const filePath = path.join(__dirname, "documents", "nvwa_sesame_chlorpyrifos_clear.jpg");
    
    if (!fs.existsSync(filePath)) {
      console.log("Test file not found - skipping");
      return;
    }

    const file = fs.readFileSync(filePath);

    const emergencyResult = await runValidation({ files: [file], source: "emergency" });
    const normalResult = await runValidation({ files: [file], source: "normal" });

    expect(emergencyResult.decision).toBe(normalResult.decision);
    expect(emergencyResult.reason).toBe(normalResult.reason);
    expect(emergencyResult.source).toBe("emergency");
    expect(normalResult.source).toBe("normal");
  });

  test("Confidence gate fires on low quality input", async () => {
    const filePath = path.join(__dirname, "documents", "blurry_document.jpg");
    
    if (!fs.existsSync(filePath)) {
      console.log("Test file not found - skipping");
      return;
    }

    const blurryFile = fs.readFileSync(filePath);
    const result = await runValidation({ files: [blurryFile], source: "emergency" });

    expect(result.decision).toBe("WARNING");
    expect(result.confidence).toBe("LOW");
    expect(result.action.some(a => a.includes("clearer"))).toBe(true);
  });

  test("No empty fields in any result", async () => {
    const filePath = path.join(__dirname, "documents", "nvwa_sesame_chlorpyrifos_clear.jpg");
    
    if (!fs.existsSync(filePath)) {
      console.log("Test file not found - skipping");
      return;
    }

    const file = fs.readFileSync(filePath);
    const result = await runValidation({ files: [file], source: "emergency" });

    expect(result.decision).toBeTruthy();
    expect(result.reason).toBeTruthy();
    expect(result.action.length).toBeGreaterThan(0);
    expect(result.confidence).toBeTruthy();
    expect(result.source).toBeTruthy();
  });
});
