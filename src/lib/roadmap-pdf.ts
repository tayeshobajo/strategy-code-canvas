import { jsPDF } from "jspdf";
import type { WorkspaceProject } from "@/lib/engine-workspace";

const INK: [number, number, number] = [23, 26, 35];
const ROYAL: [number, number, number] = [37, 55, 145];
const MUTED: [number, number, number] = [110, 116, 130];

export function exportClientRoadmapPdf(project: WorkspaceProject) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 56;
  let y = margin;

  const nextPage = () => {
    doc.addPage();
    y = margin;
  };
  const ensure = (needed: number) => {
    if (y + needed > pageH - margin) nextPage();
  };

  const setColor = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);

  const kicker = (text: string) => {
    ensure(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    setColor(ROYAL);
    doc.text(text.toUpperCase(), margin, y, { charSpace: 2 });
    y += 14;
  };

  const heading = (text: string, size = 22) => {
    ensure(size + 12);
    doc.setFont("times", "normal");
    doc.setFontSize(size);
    setColor(INK);
    doc.text(text, margin, y);
    y += size + 6;
  };

  const para = (text: string, size = 11, color = INK) => {
    if (!text) return;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    setColor(color);
    const wrapped = doc.splitTextToSize(text, pageW - margin * 2);
    for (const line of wrapped) {
      ensure(size + 4);
      doc.text(line, margin, y);
      y += size + 4;
    }
    y += 4;
  };

  const rule = () => {
    ensure(20);
    doc.setDrawColor(220, 222, 228);
    doc.line(margin, y, pageW - margin, y);
    y += 16;
  };

  // Cover
  kicker(`${project.client_company} · Roadmap`);
  heading(project.name, 28);
  para(
    `Prepared ${new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}`,
    10,
    MUTED,
  );
  rule();

  const point_a = project.point_a as { key_diagnosis?: string };
  const point_b = project.point_b as Record<string, string | undefined>;
  const phases = ((project.investment as { phases?: Array<{ name: string; outcome?: string; timeline?: string; range?: string }> })?.phases) ?? [];
  const nodes = ((project.blueprint as { nodes?: Array<{ name: string; group: string }> })?.nodes) ?? [];
  const roadmap = ((project.roadmap as { milestones?: Array<{ name: string; phase?: string; purpose?: string; client_facing?: string }> })?.milestones) ?? [];

  kicker("Executive summary");
  para(point_a.key_diagnosis ?? "—");
  rule();

  kicker("Point A · Where we are");
  para(point_a.key_diagnosis ?? "—");
  y += 4;
  kicker("Point B · Where we're going");
  para(point_b["24_month_destination"] ?? "—");
  if (point_b["10_year_position"]) {
    para(`Ten-year position: ${point_b["10_year_position"]}`, 10, MUTED);
  }
  rule();

  kicker("Phased roadmap");
  phases.forEach((p) => {
    ensure(60);
    doc.setFont("times", "normal");
    doc.setFontSize(14);
    setColor(INK);
    doc.text(p.name, margin, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    setColor(ROYAL);
    doc.text(p.range ?? "", pageW - margin, y, { align: "right" });
    y += 16;
    if (p.timeline) para(p.timeline, 9, MUTED);
    if (p.outcome) para(p.outcome);
  });
  rule();

  kicker("Milestones");
  roadmap.forEach((m, i) => {
    ensure(40);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    setColor(INK);
    doc.text(`${i + 1}. ${m.name}`, margin, y);
    y += 14;
    if (m.phase) para(m.phase, 9, MUTED);
    if (m.client_facing ?? m.purpose) para((m.client_facing ?? m.purpose)!);
  });
  rule();

  kicker("System blueprint");
  const blueprintText = nodes.map((n) => n.name).join(" · ");
  para(blueprintText || "—");

  // Footer on all pages
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    setColor(MUTED);
    doc.text("Trust Tai · trusttai.com", margin, pageH - 24);
    doc.text(`${i} / ${pageCount}`, pageW - margin, pageH - 24, { align: "right" });
  }

  const safe = project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  doc.save(`${safe}-roadmap.pdf`);
}
