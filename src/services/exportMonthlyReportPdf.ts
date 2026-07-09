/**
 * exportMonthlyReportPdf.ts — Expo (managed workflow) version
 *
 * jsPDF assumes a browser DOM (doc.save() uses Blob/URL.createObjectURL/<a>),
 * none of which exist in React Native, and its bundle also trips Metro's
 * static require() validation on an optional html2canvas dependency. Neither
 * problem is fixable by config alone, so this rewrites the export as an HTML
 * string rendered to a real PDF via Expo's native print engine, then handed
 * to expo-sharing so the user can save/share it — both are part of the Expo
 * managed SDK, no native/ejecting required.
 *
 * Install:
 *   npx expo install expo-print expo-sharing
 */

import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

// ─── Types (unchanged from the jsPDF version) ──────────────────────────────

type MonthlyItemRow = {
  id: string;
  itemCode: string;
  name: string;
  brand: string;
  category: string;
  unit: string;
  pricePerUnit: number;
  beginningInventory: number;
  totalConsumed: number;
  consumptionAmount: number;
  totalDelivered: number;
  deliveryAmount: number;
  endingInventory: number;
};

// ─── Color palette (kept in sync with the jsPDF version's C / CAT_COLORS) ──

const COLORS = {
  darkNavy: "#0f2744",
  accentBlue: "#2563eb",
  rowAlt: "#f0f4fa",
  borderGray: "#cbd5e1",
  textDark: "#0f172a",
  textMid: "#475569",
  red: "#dc2626",
  green: "#16a34a",
  amber: "#d97706",
  totalBg: "#e2e8f0",
  white: "#ffffff",
};

const CAT_COLORS: Record<string, string> = {
  office_supplies: "#1e3f6e",
  cleaning: "#5b21b6",
  ppe: "#7f1d1d",
  medicine: "#b45309",
};

const CAT_LABELS: Record<string, string> = {
  office_supplies: "OFFICE SUPPLIES",
  cleaning: "CLEANING SUPPLIES",
  ppe: "PPE SUPPLIES",
  medicine: "MEDICINE SUPPLIES",
};

const ORDER: string[] = ["office_supplies", "cleaning", "ppe", "medicine"];

// ─── Safe numeric coercion (same reasoning as the jsPDF version) ───────────

function toNum(v: number | string | unknown): number {
  if (typeof v === "number") return isNaN(v) ? 0 : v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[^0-9.]/g, "");
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function peso(v: number | string | unknown): string {
  const n = toNum(v);
  if (n === 0) return "—";
  return `PHP ${n.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function monthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── HTML builders ──────────────────────────────────────────────────────────

function buildKpiCards(allRows: MonthlyItemRow[]) {
  const totalConsumption = allRows.reduce((s, r) => s + toNum(r.consumptionAmount), 0);
  const totalDelivery = allRows.reduce((s, r) => s + toNum(r.deliveryAmount), 0);
  const itemsConsumed = allRows.filter((r) => toNum(r.totalConsumed) > 0).length;
  const netChange = totalDelivery - totalConsumption;

  const kpis = [
    { label: "TOTAL CONSUMPTION", value: peso(totalConsumption), color: COLORS.red, sub: "Office + Cleaning + PPE + Medicine" },
    { label: "TOTAL RESTOCKED", value: peso(totalDelivery), color: COLORS.green, sub: "Delivered this month" },
    { label: "ITEMS CONSUMED", value: String(itemsConsumed), color: COLORS.darkNavy, sub: "Unique items with movement" },
    {
      label: "NET STOCK CHANGE",
      value: `${netChange >= 0 ? "+" : "−"}${peso(Math.abs(netChange))}`,
      color: netChange >= 0 ? COLORS.green : COLORS.red,
      sub: "Restocked minus consumed",
    },
  ];

  return `
    <div class="kpi-row">
      ${kpis
        .map(
          (k) => `
        <div class="kpi-card">
          <div class="kpi-bar" style="background:${k.color}"></div>
          <div class="kpi-label">${k.label}</div>
          <div class="kpi-value" style="color:${k.color}">${k.value}</div>
          <div class="kpi-sub">${k.sub}</div>
        </div>`,
        )
        .join("")}
    </div>`;
}

function buildCategoryTable(cat: string, rows: MonthlyItemRow[]): string {
  if (!rows.length) return "";
  const catColor = CAT_COLORS[cat] ?? COLORS.darkNavy;
  const catLabel = CAT_LABELS[cat] ?? cat.toUpperCase();

  const secConsumed = rows.reduce((s, r) => s + toNum(r.totalConsumed), 0);
  const secConsAmt = rows.reduce((s, r) => s + toNum(r.consumptionAmount), 0);
  const secDelivered = rows.reduce((s, r) => s + toNum(r.totalDelivered), 0);
  const secDelAmt = rows.reduce((s, r) => s + toNum(r.deliveryAmount), 0);

  const bodyRows = rows
    .map((r) => {
      const endingInv = toNum(r.endingInventory);
      const consumed = toNum(r.totalConsumed);
      const consAmt = toNum(r.consumptionAmount);
      const delivered = toNum(r.totalDelivered);
      const delAmt = toNum(r.deliveryAmount);
      const begInv = toNum(r.beginningInventory);
      const price = toNum(r.pricePerUnit);

      const endColor = endingInv <= 0 ? COLORS.red : endingInv <= 5 ? COLORS.amber : COLORS.textDark;
      const brandStr = r.brand && r.brand !== "-" ? ` · ${escapeHtml(r.brand)}` : "";

      return `
        <tr>
          <td class="item-cell">
            <div class="item-name">${escapeHtml(r.name)}</div>
            <div class="item-code">${escapeHtml(r.itemCode)}${brandStr}</div>
          </td>
          <td class="ctr">${escapeHtml(r.unit)}</td>
          <td class="rgt muted">${peso(price)}</td>
          <td class="ctr">${begInv}</td>
          <td class="ctr" style="color:${consumed > 0 ? COLORS.red : COLORS.textMid};font-weight:${consumed > 0 ? 700 : 400}">
            ${consumed > 0 ? `-${consumed}` : "0"}
          </td>
          <td class="rgt" style="color:${consAmt > 0 ? COLORS.red : COLORS.textMid}">${peso(consAmt)}</td>
          <td class="ctr" style="color:${delivered > 0 ? COLORS.green : COLORS.textMid};font-weight:${delivered > 0 ? 700 : 400}">
            ${delivered > 0 ? `+${delivered}` : "0"}
          </td>
          <td class="rgt" style="color:${delAmt > 0 ? COLORS.green : COLORS.textMid}">${delAmt > 0 ? peso(delAmt) : "—"}</td>
          <td class="ctr" style="color:${endColor};font-weight:700">${endingInv}</td>
        </tr>`;
    })
    .join("");

  return `
    <table class="cat-table">
      <thead>
        <tr><th colspan="9" class="cat-header" style="background:${catColor}">${catLabel}</th></tr>
        <tr class="col-headers" style="background:${catColor}">
          <th>ITEM DESCRIPTION</th>
          <th>UNIT</th>
          <th>PRICE/UNIT</th>
          <th>BEG. INVTY</th>
          <th>CONSUMED (QTY)</th>
          <th>CONSUMPTION AMT</th>
          <th>DELIVERED (QTY)</th>
          <th>DELIVERY AMT</th>
          <th>ENDING INVTY</th>
        </tr>
      </thead>
      <tbody>
        ${bodyRows}
        <tr class="section-total">
          <td>SECTION TOTAL</td>
          <td></td><td></td><td></td>
          <td class="ctr" style="color:${COLORS.red}">${secConsumed > 0 ? `-${secConsumed}` : "0"}</td>
          <td class="rgt" style="color:${COLORS.red}">${peso(secConsAmt)}</td>
          <td class="ctr" style="color:${COLORS.green}">${secDelivered > 0 ? `+${secDelivered}` : "0"}</td>
          <td class="rgt" style="color:${COLORS.green}">${secDelAmt > 0 ? peso(secDelAmt) : "—"}</td>
          <td></td>
        </tr>
      </tbody>
    </table>`;
}

function buildSummaryTable(allRows: MonthlyItemRow[], grouped: Record<string, MonthlyItemRow[]>): string {
  const totalConsumption = allRows.reduce((s, r) => s + toNum(r.consumptionAmount), 0);
  const totalDelivery = allRows.reduce((s, r) => s + toNum(r.deliveryAmount), 0);
  const itemsConsumed = allRows.filter((r) => toNum(r.totalConsumed) > 0).length;

  const rows = ORDER.map((cat) => {
    const rows = grouped[cat] ?? [];
    const cAmt = rows.reduce((s, r) => s + toNum(r.consumptionAmount), 0);
    const dAmt = rows.reduce((s, r) => s + toNum(r.deliveryAmount), 0);
    const nCon = rows.filter((r) => toNum(r.totalConsumed) > 0).length;
    return `
      <tr>
        <td>${CAT_LABELS[cat]}</td>
        <td class="ctr">${rows.length}</td>
        <td class="ctr">${nCon}</td>
        <td class="rgt" style="color:${COLORS.red}">${peso(cAmt)}</td>
        <td class="rgt" style="color:${COLORS.green}">${dAmt > 0 ? peso(dAmt) : "—"}</td>
      </tr>`;
  }).join("");

  return `
    <h3 class="section-title">MONTHLY SUMMARY BY CATEGORY</h3>
    <table class="summary-table">
      <thead>
        <tr>
          <th>CATEGORY</th><th>TOTAL ITEMS</th><th>ITEMS CONSUMED</th>
          <th>CONSUMPTION AMOUNT</th><th>DELIVERY AMOUNT</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <tr class="section-total">
          <td>GRAND TOTAL</td>
          <td class="ctr">${allRows.length}</td>
          <td class="ctr">${itemsConsumed}</td>
          <td class="rgt" style="color:${COLORS.red}">${peso(totalConsumption)}</td>
          <td class="rgt" style="color:${COLORS.green}">${totalDelivery > 0 ? peso(totalDelivery) : "—"}</td>
        </tr>
      </tbody>
    </table>`;
}

function buildSignatureBlock(): string {
  const sig = [
    { label: "Prepared by:", name: "Admin Staff" },
    { label: "Reviewed by:", name: "Division Head" },
    { label: "Approved by:", name: "Department Manager" },
  ];
  return `
    <div class="sig-row">
      ${sig
        .map(
          (s) => `
        <div class="sig-block">
          <div class="sig-label">${s.label}</div>
          <div class="sig-line"></div>
          <div class="sig-name">${s.name}</div>
        </div>`,
        )
        .join("")}
    </div>`;
}

function buildHtml(allRows: MonthlyItemRow[], selectedMonth: string): string {
  const grouped: Record<string, MonthlyItemRow[]> = {};
  ORDER.forEach((cat) => {
    grouped[cat] = allRows.filter((r) => r.category === cat);
  });

  const generatedOn = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return `
  <html>
  <head>
    <meta charset="utf-8" />
    <style>
      @page { size: A4 landscape; margin: 14mm 10mm; }
      * { box-sizing: border-box; }
      body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: ${COLORS.textDark}; margin: 0; }

      .header-band {
        background: ${COLORS.darkNavy}; color: ${COLORS.white};
        padding: 10px 14px; border-radius: 4px;
        display: flex; justify-content: space-between; align-items: center;
      }
      .header-band h1 { font-size: 15px; margin: 0; }
      .header-band .month { color: ${COLORS.accentBlue}; font-size: 13px; font-weight: bold; }
      .header-sub { display: flex; justify-content: space-between; font-size: 9px; color: ${COLORS.white}; opacity: 0.85; margin-top: 4px; }
      .divider { border: none; border-top: 2px solid ${COLORS.accentBlue}; margin: 10px 0 14px; }

      .kpi-row { display: flex; gap: 8px; margin-bottom: 16px; }
      .kpi-card { flex: 1; border: 1px solid ${COLORS.borderGray}; border-radius: 4px; padding: 8px 10px; position: relative; }
      .kpi-bar { position: absolute; top: 0; left: 0; right: 0; height: 3px; border-radius: 4px 4px 0 0; }
      .kpi-label { font-size: 7px; font-weight: 700; color: ${COLORS.textMid}; margin-top: 4px; }
      .kpi-value { font-size: 15px; font-weight: 700; margin: 3px 0; }
      .kpi-sub { font-size: 7px; color: ${COLORS.textMid}; }

      table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
      .cat-table th, .cat-table td { border: 1px solid ${COLORS.borderGray}; padding: 5px 6px; font-size: 8px; }
      .cat-header { color: ${COLORS.white}; font-size: 10px; font-weight: 700; text-align: left; padding: 7px 8px; }
      .col-headers th { color: ${COLORS.white}; font-size: 7.5px; text-align: center; padding: 5px 4px; }
      .cat-table tbody tr:nth-child(even) { background: ${COLORS.rowAlt}; }
      .item-cell { text-align: left; min-width: 140px; }
      .item-name { font-weight: 700; font-size: 8.5px; }
      .item-code { font-size: 7px; color: ${COLORS.textMid}; margin-top: 1px; }
      .ctr { text-align: center; }
      .rgt { text-align: right; }
      .muted { color: ${COLORS.textMid}; }
      .section-total td { background: ${COLORS.totalBg}; font-weight: 700; }

      .section-title { font-size: 10px; color: ${COLORS.darkNavy}; margin: 6px 0; }
      .summary-table th { background: ${COLORS.darkNavy}; color: ${COLORS.white}; font-size: 8px; padding: 6px; }
      .summary-table td { border: 1px solid ${COLORS.borderGray}; padding: 6px; font-size: 8px; }
      .summary-table tbody tr:nth-child(even) { background: ${COLORS.rowAlt}; }

      .sig-row { display: flex; gap: 20px; margin-top: 20px; }
      .sig-block { flex: 1; }
      .sig-label { font-size: 7px; color: ${COLORS.textMid}; margin-bottom: 20px; }
      .sig-line { border-top: 1px solid ${COLORS.textMid}; margin-bottom: 4px; }
      .sig-name { font-size: 7px; color: ${COLORS.textMid}; }

      .footer { font-size: 7px; color: ${COLORS.textMid}; text-align: center; margin-top: 16px; }
    </style>
  </head>
  <body>
    <div class="header-band">
      <h1>OFFICE CONSUMABLES MONITORING REPORT</h1>
      <div class="month">${monthLabel(selectedMonth).toUpperCase()}</div>
    </div>
    <div class="header-sub">
      <span>Administrative Services Division · Office Management</span>
      <span>Generated: ${generatedOn}</span>
    </div>
    <hr class="divider" />

    ${buildKpiCards(allRows)}

    ${ORDER.map((cat) => buildCategoryTable(cat, grouped[cat])).join("")}

    ${buildSummaryTable(allRows, grouped)}

    ${buildSignatureBlock()}

    <div class="footer">Office Consumables Monitoring Report — ${monthLabel(selectedMonth)} | Administrative Services Division</div>
  </body>
  </html>`;
}

// ─── Main export ────────────────────────────────────────────────────────────

export async function exportMonthlyReportPdf(
  allRows: MonthlyItemRow[],
  selectedMonth: string,
): Promise<void> {
  const html = buildHtml(allRows, selectedMonth);

  // Renders the HTML to a real PDF using the device's native print engine.
  const { uri } = await Print.printToFileAsync({ html, base64: false });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: `Office_Consumables_Report_${selectedMonth}.pdf`,
      UTI: "com.adobe.pdf",
    });
  } else {
    // Fallback: at least let the caller know where the file landed
    // (e.g. to show an in-app "saved to..." message).
    console.warn("Sharing not available on this device. PDF saved at:", uri);
  }
}