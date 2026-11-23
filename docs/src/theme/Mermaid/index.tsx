import React, { useId, useRef, useState, type ReactNode } from "react";
import Mermaid from "@theme-original/Mermaid";
import type { Props } from "@theme/Mermaid";
import {
  buildStandaloneSvgString,
  isDarkThemeActive,
  sanitizeFileSlug,
  svgElementToPngBlob,
  triggerBlobDownload,
} from "@site/src/utils/diagramExport";

function resolveDiagramBaseName(fallbackId: string): string {
  if (typeof document === "undefined") return fallbackId;
  const pageTitle = document.title.split("|")[0]?.trim() || "orion-diagram";
  const shortHash = fallbackId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6);
  return `${sanitizeFileSlug(pageTitle)}-${shortHash || "diagram"}`;
}

export default function MermaidWrapper(props: Props): ReactNode {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceId = useId();
  const [statusMessage, setStatusMessage] = useState<string>("");

  const flashStatus = (msg: string) => {
    setStatusMessage(msg);
    window.setTimeout(() => {
      setStatusMessage((prev) => (prev === msg ? "" : prev));
    }, 2400);
  };

  const getSvgElement = (): SVGSVGElement | null => {
    return containerRef.current?.querySelector("svg") ?? null;
  };

  const handleDownloadSvg = () => {
    const svgEl = getSvgElement();
    if (!svgEl) {
      flashStatus("SVG belum siap");
      return;
    }
    const baseName = resolveDiagramBaseName(instanceId);
    const markup = buildStandaloneSvgString(svgEl, isDarkThemeActive());
    triggerBlobDownload(
      new Blob([markup], { type: "image/svg+xml;charset=utf-8" }),
      `${baseName}.svg`,
    );
    flashStatus(`SVG tersimpan (${baseName}.svg)`);
  };

  const handleDownloadPng = async () => {
    const svgEl = getSvgElement();
    if (!svgEl) {
      flashStatus("Diagram belum siap");
      return;
    }
    try {
      const baseName = resolveDiagramBaseName(instanceId);
      const blob = await svgElementToPngBlob(svgEl, isDarkThemeActive(), 2);
      triggerBlobDownload(blob, `${baseName}.png`);
      flashStatus(`PNG 2x tersimpan (${baseName}.png)`);
    } catch {
      flashStatus("Browser memblokir ekspor kanvas; coba Unduh SVG.");
    }
  };

  const handleDownloadMarkdown = () => {
    const baseName = resolveDiagramBaseName(instanceId);
    const pageTitle =
      typeof document !== "undefined"
        ? document.title.split("|")[0]?.trim() || "ORION Diagram"
        : "ORION Diagram";
    const mdContent = [
      `# ${pageTitle}`,
      "",
      "```mermaid",
      props.value.trim(),
      "```",
      "",
    ].join("\n");
    triggerBlobDownload(
      new Blob([mdContent], { type: "text/markdown;charset=utf-8" }),
      `${baseName}.md`,
    );
    flashStatus(`Markdown tersimpan (${baseName}.md)`);
  };

  return (
    <div className="orion-mermaid-card">
      <div className="orion-export-bar">
        <span className="orion-export-label">Diagram Alur ORION</span>
        <div className="orion-export-actions">
          {statusMessage ? (
            <span className="orion-export-status" role="status">
              {statusMessage}
            </span>
          ) : null}
          <button
            type="button"
            className="orion-export-btn"
            onClick={handleDownloadPng}
            aria-label="Unduh diagram ini sebagai gambar PNG resolusi tinggi"
          >
            Unduh PNG
          </button>
          <button
            type="button"
            className="orion-export-btn"
            onClick={handleDownloadSvg}
            aria-label="Unduh diagram ini sebagai vektor SVG"
          >
            Unduh SVG
          </button>
          <button
            type="button"
            className="orion-export-btn"
            onClick={handleDownloadMarkdown}
            aria-label="Unduh sumber Mermaid diagram ini sebagai file Markdown (.md)"
          >
            Unduh .md
          </button>
        </div>
      </div>
      <div ref={containerRef} className="orion-mermaid-stage">
        <Mermaid {...props} />
      </div>
    </div>
  );
}
