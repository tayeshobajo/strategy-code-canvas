/**
 * Client-safe PDF export for the approved World Entry workspace.
 *
 * Includes only externally-shareable content:
 *   • Industry destination summary
 *   • Competitor name + positioning (drops internal "why relevant" reasoning)
 *   • Category vocabulary
 *   • Evidence label + link (drops internal quotes, source ids, and uploader identity)
 *
 * Explicitly excluded (internal-only): reviewer identities, drafter identity,
 * approval reason, evidence quotes/source ids, uploader emails, comments, drift.
 */
import { jsPDF } from "jspdf";
import type { WorldEntryVersion } from "@/lib/engine-world-entry.functions";

type BuildInput = {
  projectName: string;
  approvedAt?: string;
  version: WorldEntryVersion;
};

const INK = "#0F172A";
const SUBTLE = "#475569";
const RULE = "#CBD5E1";
const ACCENT = "#1D4ED8";
const PAGE_W = 595.28; // A4 pt
const PAGE_H = 841.89;
const MARGIN = 56;
const CONTENT_W = PAGE_W - MARGIN * 2;

export function buildWorldEntryPdf({
  projectName,
  approvedAt,
  version,
}: BuildInput): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let y = MARGIN;

  const writeHeader = () => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(ACCENT);
    doc.setFontSize(10);
    doc.text("WORLD ENTRY", MARGIN, y);
    doc.setTextColor(INK);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(22);
    y += 26;
    doc.text(projectName, MARGIN, y);
    doc.setFontSize(10);
    doc.setTextColor(SUBTLE);
    y += 16;
    const stamp = approvedAt
      ? `Approved ${new Date(approvedAt).toLocaleDateString(undefined, {
          year: "numeric",
          month: "long",
          day: "numeric",
        })} · Version ${version.version}`
      : `Version ${version.version}`;
    doc.text(stamp, MARGIN, y);
    y += 20;
    doc.setDrawColor(RULE);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 22;
  };

  const ensureSpace = (need: number) => {
    if (y + need > PAGE_H - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  const sectionTitle = (label: string) => {
    ensureSpace(40);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(ACCENT);
    doc.setFontSize(9);
    doc.text(label.toUpperCase(), MARGIN, y);
    y += 14;
    doc.setDrawColor(RULE);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 14;
  };

  const bodyText = (text: string, size = 11) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    doc.setTextColor(INK);
    const lines = doc.splitTextToSize(text || "—", CONTENT_W) as string[];
    for (const line of lines) {
      ensureSpace(size + 4);
      doc.text(line, MARGIN, y);
      y += size + 4;
    }
  };

  writeHeader();

  sectionTitle("Industry destination");
  bodyText(version.destination_summary);
  y += 12;

  sectionTitle("Competitor landscape");
  if (version.competitors.length === 0) {
    bodyText("No competitors recorded.");
  } else {
    for (const c of version.competitors) {
      ensureSpace(40);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(INK);
      doc.text(c.name || "Unnamed competitor", MARGIN, y);
      y += 14;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(SUBTLE);
      doc.setFontSize(10);
      const lines = doc.splitTextToSize(
        c.positioning || "No positioning noted.",
        CONTENT_W,
      ) as string[];
      for (const line of lines) {
        ensureSpace(14);
        doc.text(line, MARGIN, y);
        y += 12;
      }
      y += 6;
    }
  }
  y += 6;

  sectionTitle("Category vocabulary");
  if (version.vocabulary.length === 0) {
    bodyText("No terms recorded.");
  } else {
    bodyText(version.vocabulary.join(" · "));
  }
  y += 12;

  sectionTitle("Evidence");
  if (version.evidence.length === 0) {
    bodyText("No evidence attached.");
  } else {
    for (const e of version.evidence) {
      ensureSpace(30);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(INK);
      const labelLines = doc.splitTextToSize(
        e.label || "Untitled evidence",
        CONTENT_W,
      ) as string[];
      for (const line of labelLines) {
        ensureSpace(14);
        doc.text(line, MARGIN, y);
        y += 14;
      }
      if (e.url) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(ACCENT);
        const urlLines = doc.splitTextToSize(e.url, CONTENT_W) as string[];
        for (const line of urlLines) {
          ensureSpace(12);
          doc.textWithLink(line, MARGIN, y, { url: e.url });
          y += 12;
        }
      }
      y += 6;
    }
  }

  // Footer on every page
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(SUBTLE);
    doc.text(
      "Trust Tai · Client-safe World Entry export",
      MARGIN,
      PAGE_H - 24,
    );
    doc.text(`${i} / ${pageCount}`, PAGE_W - MARGIN, PAGE_H - 24, {
      align: "right",
    });
  }
  return doc;
}

export function downloadWorldEntryPdf(input: BuildInput): void {
  const doc = buildWorldEntryPdf(input);
  const safeName = input.projectName.replace(/[^A-Za-z0-9-_]+/g, "-");
  doc.save(`${safeName || "world-entry"}-world-entry-v${input.version.version}.pdf`);
}
