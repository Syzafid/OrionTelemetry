/**
 * Shared client-side download helpers for Mermaid diagrams, PCB blueprint images,
 * and raw Markdown source files in Docusaurus.
 */

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function sanitizeFileSlug(input: string, fallback = "orion-diagram"): string {
  const cleaned = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned.length > 0 ? cleaned : fallback;
}

export function isDarkThemeActive(): boolean {
  if (typeof document === "undefined") return true;
  return document.documentElement.getAttribute("data-theme") === "dark";
}

function getSvgDimensions(svgEl: SVGSVGElement): { width: number; height: number } {
  const vb = svgEl.viewBox?.baseVal;
  if (vb && vb.width > 0 && vb.height > 0) {
    return { width: Math.ceil(vb.width), height: Math.ceil(vb.height) };
  }
  const attrW = Number.parseFloat(svgEl.getAttribute("width") ?? "");
  const attrH = Number.parseFloat(svgEl.getAttribute("height") ?? "");
  if (Number.isFinite(attrW) && attrW > 0 && Number.isFinite(attrH) && attrH > 0) {
    return { width: Math.ceil(attrW), height: Math.ceil(attrH) };
  }
  const rect = svgEl.getBoundingClientRect();
  return {
    width: Math.max(320, Math.ceil(rect.width)),
    height: Math.max(200, Math.ceil(rect.height)),
  };
}

export function buildStandaloneSvgString(svgEl: SVGSVGElement, darkMode: boolean): string {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  const { width, height } = getSvgDimensions(svgEl);

  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  if (!clone.getAttribute("viewBox")) {
    clone.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }

  const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bgRect.setAttribute("x", "0");
  bgRect.setAttribute("y", "0");
  bgRect.setAttribute("width", String(width));
  bgRect.setAttribute("height", String(height));
  bgRect.setAttribute("fill", darkMode ? "#0e1116" : "#ffffff");
  clone.insertBefore(bgRect, clone.firstChild);

  const serializer = new XMLSerializer();
  return `<?xml version="1.0" encoding="UTF-8"?>\n${serializer.serializeToString(clone)}`;
}

export async function svgElementToPngBlob(
  svgEl: SVGSVGElement,
  darkMode: boolean,
  scale = 2,
): Promise<Blob> {
  const svgMarkup = buildStandaloneSvgString(svgEl, darkMode);
  const { width, height } = getSvgDimensions(svgEl);
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;

  return await new Promise<Blob>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas 2D context unavailable."));
          return;
        }
        ctx.fillStyle = darkMode ? "#0e1116" : "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Gagal mengonversi SVG ke PNG."));
          }
        }, "image/png");
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };
    img.onerror = () => reject(new Error("Gagal memuat SVG ke kanvas ekspor."));
    img.src = dataUrl;
  });
}

export async function downloadTextFromUrl(
  url: string,
  filename: string,
): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const text = await response.text();
  triggerBlobDownload(new Blob([text], { type: "text/markdown;charset=utf-8" }), filename);
}
