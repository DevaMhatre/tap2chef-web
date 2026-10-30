import { useMemo } from "react";
import QRCode from "qrcode";

// Drawn here from the code's modules, so its colours are tokens and it works
// offline. Dark on white in both themes, with the quiet margin cameras need.
export function QrCode({ value, label }: { value: string; label: string }) {
  const { size, path } = useMemo(() => {
    const { modules } = QRCode.create(value, { errorCorrectionLevel: "M" });
    let d = "";
    for (let row = 0; row < modules.size; row++) {
      for (let col = 0; col < modules.size; col++) if (modules.get(row, col)) d += `M${col + 4} ${row + 4}h1v1h-1z`;
    }
    return { size: modules.size + 8, path: d };
  }, [value]);

  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges" className="aspect-square w-full rounded-2xl bg-qr-paper">
      <path d={path} className="fill-qr-ink" />
    </svg>
  );
}
