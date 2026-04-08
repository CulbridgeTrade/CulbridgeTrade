import { useState } from "react";
import EmergencyModal from "./EmergencyModal";

export default function EmergencyButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-red-600 text-white px-4 py-2 rounded font-medium hover:bg-red-700"
      >
        Shipment Issue? Check Now
      </button>
      {open && <EmergencyModal onClose={() => setOpen(false)} />}
    </>
  );
}
