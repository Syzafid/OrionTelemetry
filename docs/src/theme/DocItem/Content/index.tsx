import React, { useState, type ReactNode } from "react";
import Content from "@theme-original/DocItem/Content";
import type { Props } from "@theme/DocItem/Content";
import { useDoc } from "@docusaurus/plugin-content-docs/client";
import useBaseUrl from "@docusaurus/useBaseUrl";
import { downloadTextFromUrl, sanitizeFileSlug } from "@site/src/utils/diagramExport";

export default function DocItemContentWrapper(props: Props): ReactNode {
  const { metadata } = useDoc();
  const [statusMessage, setStatusMessage] = useState<string>("");

  const relSource = metadata.source.replace(/^@site\/docs\//, "");
  const rawMdUrl = useBaseUrl(`/raw-md/${relSource}`);
  const fileName = relSource.split("/").pop() || `${sanitizeFileSlug(metadata.title)}.md`;

  const flashStatus = (msg: string) => {
    setStatusMessage(msg);
    window.setTimeout(() => {
      setStatusMessage((prev) => (prev === msg ? "" : prev));
    }, 2400);
  };

  const handleDownloadPageMd = async () => {
    try {
      await downloadTextFromUrl(rawMdUrl, fileName);
      flashStatus(`Tersimpan (${fileName})`);
    } catch {
      flashStatus("Berkas .md halaman ini belum tersedia.");
    }
  };

  return (
    <>
      <div className="orion-doc-export-bar">
        <span className="orion-export-label">Ekspor Dokumen</span>
        <div className="orion-export-actions">
          {statusMessage ? (
            <span className="orion-export-status" role="status">
              {statusMessage}
            </span>
          ) : null}
          <button
            type="button"
            className="orion-export-btn"
            onClick={handleDownloadPageMd}
            aria-label={`Unduh halaman dokumentasi ini sebagai ${fileName}`}
          >
            Unduh Halaman (.md)
          </button>
        </div>
      </div>
      <Content {...props} />
    </>
  );
}
