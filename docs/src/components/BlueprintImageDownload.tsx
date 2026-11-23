import React, { useRef, useState, type ReactNode } from "react";
import useBaseUrl from "@docusaurus/useBaseUrl";
import {
  downloadTextFromUrl,
  triggerBlobDownload,
} from "@site/src/utils/diagramExport";

export interface BlueprintImageDownloadProps {
  src: string;
  alt: string;
  fileBaseName: string;
  caption?: string;
  rawMdPath?: string;
}

export default function BlueprintImageDownload({
  src,
  alt,
  fileBaseName,
  caption,
  rawMdPath,
}: BlueprintImageDownloadProps): ReactNode {
  const imgUrl = useBaseUrl(src);
  const rawMdUrl = useBaseUrl(rawMdPath ?? "");
  const imgRef = useRef<HTMLImageElement>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");

  const flashStatus = (msg: string) => {
    setStatusMessage(msg);
    window.setTimeout(() => {
      setStatusMessage((prev) => (prev === msg ? "" : prev));
    }, 2400);
  };

  const renderLoadedImageToCanvas = async (): Promise<{
    canvas: HTMLCanvasElement;
    width: number;
    height: number;
  }> => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Gagal memuat gambar cetak biru."));
      img.src = imgUrl;
    });
    const width = img.naturalWidth || imgRef.current?.naturalWidth || 1024;
    const height = img.naturalHeight || imgRef.current?.naturalHeight || 768;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D context unavailable.");
    }
    ctx.drawImage(img, 0, 0, width, height);
    return { canvas, width, height };
  };

  const handleDownloadPng = async () => {
    try {
      const { canvas } = await renderLoadedImageToCanvas();
      const pngBlob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!pngBlob) {
        throw new Error("Konversi PNG gagal.");
      }
      triggerBlobDownload(pngBlob, `${fileBaseName}.png`);
      flashStatus(`PNG tersimpan (${fileBaseName}.png)`);
    } catch {
      flashStatus("Gagal mengekspor PNG dari gambar.");
    }
  };

  const handleDownloadSvg = async () => {
    try {
      const { canvas, width, height } = await renderLoadedImageToCanvas();
      const pngDataUrl = canvas.toDataURL("image/png");
      const svgMarkup = [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
        `  <title>${alt}</title>`,
        `  <image href="${pngDataUrl}" x="0" y="0" width="${width}" height="${height}" />`,
        `</svg>`,
        "",
      ].join("\n");
      triggerBlobDownload(
        new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" }),
        `${fileBaseName}.svg`,
      );
      flashStatus(`SVG tersimpan (${fileBaseName}.svg)`);
    } catch {
      flashStatus("Gagal mengekspor SVG dari gambar.");
    }
  };

  const handleDownloadMd = async () => {
    if (!rawMdPath) return;
    try {
      await downloadTextFromUrl(rawMdUrl, `${fileBaseName}.md`);
      flashStatus(`Markdown tersimpan (${fileBaseName}.md)`);
    } catch {
      flashStatus("Berkas .md sumber belum tersedia.");
    }
  };

  return (
    <figure className="orion-blueprint-card">
      <div className="orion-export-bar">
        <span className="orion-export-label">{caption ?? alt}</span>
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
            aria-label={`Unduh ${alt} sebagai gambar PNG`}
          >
            Unduh PNG
          </button>
          <button
            type="button"
            className="orion-export-btn"
            onClick={handleDownloadSvg}
            aria-label={`Unduh ${alt} sebagai file SVG`}
          >
            Unduh SVG
          </button>
          {rawMdPath ? (
            <button
              type="button"
              className="orion-export-btn"
              onClick={handleDownloadMd}
              aria-label={`Unduh spesifikasi Markdown untuk ${alt}`}
            >
              Unduh .md
            </button>
          ) : null}
        </div>
      </div>
      <div className="orion-blueprint-media">
        <img
          ref={imgRef}
          src={imgUrl}
          alt={alt}
          loading="lazy"
          decoding="async"
        />
      </div>
      {caption ? (
        <figcaption className="orion-blueprint-caption">{caption}</figcaption>
      ) : null}
    </figure>
  );
}
