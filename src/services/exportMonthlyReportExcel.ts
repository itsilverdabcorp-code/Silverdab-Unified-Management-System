// Services/exportMonthlyReportExcel.ts
//
// Builds an .xlsx that matches the layout of the uploaded
// "Office_Consumables_Monitoring" workbook:
//   - One sheet per category (OFFICE SUPPLIES, CLEANING SUPPLIES, PPE, MEDICINE)
//   - Row 2: big navy title ("<CATEGORY> ")
//   - Row 3/4 (merged): ITEM / ITEM CODE / BRAND NAME-DESCRIPTION / Unit / PRICE /
//     Beg. Invty / "<MONTH YEAR> - Daily Consumption" (spans one column per day,
//     numbered 1..daysInMonth) / Monthly Total Consumption / Consumption Amount /
//     Add: Delivery / Delivery Amount / Ending Invty.
//   - One data row per item, with the SAME formulas as the template:
//       Monthly Total Consumption = SUM(daily range)
//       Consumption Amount        = TotalConsumption * Price
//       Delivery Amount           = Delivery * Price
//       Ending Invty.             = (Beg. Invty - TotalConsumption) + Delivery
//   - Freeze panes under the header / past the static columns
//
// Requires: `exceljs` and `file-saver` (web only — this page is web-only JSX).
//   npm install exceljs file-saver
//   npm install --save-dev @types/file-saver

import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExcelExportRow = {
  id: string;
  itemCode: string;
  name: string;
  brand: string;
  unit: string;
  pricePerUnit: number;
  beginningInventory: number;
  dailyConsumption: number[]; // length === daysInMonth, units consumed each day
  totalConsumed: number;
  totalDelivered: number;
  endingInventory: number;
};

export type ExcelExportCategory = {
  /** e.g. "office_supplies" | "cleaning" | "ppe" | "medicine" */
  categoryKey: string;
  rows: ExcelExportRow[];
};

const SHEET_TITLES: Record<string, string> = {
  office_supplies: "OFFICE SUPPLIES",
  cleaning: "CLEANING SUPPLIES",
  ppe: "PPE",
  medicine: "MEDICINE",
};

const SHEET_NAME_LIMIT = 31; // Excel hard limit on sheet name length

// ─── Style constants (pulled from the uploaded template) ─────────────────────

const NAVY = "FF002060";
const FONT_NAME = "Arial";

const titleFont: Partial<ExcelJS.Font> = {
  name: FONT_NAME,
  bold: true,
  size: 20,
  color: { argb: NAVY },
};

const headerFont: Partial<ExcelJS.Font> = {
  name: FONT_NAME,
  bold: true,
  size: 11,
  color: { argb: NAVY },
};

const headerFontSmall: Partial<ExcelJS.Font> = {
  name: FONT_NAME,
  bold: true,
  size: 10,
  color: { argb: NAVY },
};

const headerCenter: Partial<ExcelJS.Alignment> = {
  horizontal: "center",
  vertical: "middle",
  wrapText: true,
};

const bodyFont: Partial<ExcelJS.Font> = { name: FONT_NAME, size: 10 };

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFD9D9D9" } },
  bottom: { style: "thin", color: { argb: "FFD9D9D9" } },
  left: { style: "thin", color: { argb: "FFD9D9D9" } },
  right: { style: "thin", color: { argb: "FFD9D9D9" } },
};

function monthYearLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  return new Date(y, m - 1, 1)
    .toLocaleDateString("en-US", { month: "long", year: "numeric" })
    .toUpperCase();
}

function daysInMonth(yyyymm: string): number {
  const [y, m] = yyyymm.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

// ─── Sheet builder ─────────────────────────────────────────────────────────────

function buildSheet(
  wb: ExcelJS.Workbook,
  category: ExcelExportCategory,
  selectedMonth: string,
) {
  const sheetTitle =
    SHEET_TITLES[category.categoryKey] ?? category.categoryKey.toUpperCase();
  const sheetName = sheetTitle.slice(0, SHEET_NAME_LIMIT);
  const ws = wb.addWorksheet(sheetName, {
    views: [{ state: "frozen", xSplit: 6, ySplit: 4 }], // freeze A:F + header rows
  });

  const numDays = daysInMonth(selectedMonth);

  // Column layout: A name, B code, C brand, D unit, E price, F beg invty,
  // G..(G+numDays-1) daily consumption, then 5 summary columns.
  const DAILY_START_COL = 7; // G
  const dailyEndCol = DAILY_START_COL + numDays - 1;
  const totalConsumedCol = dailyEndCol + 1;
  const consumptionAmtCol = totalConsumedCol + 1;
  const deliveryCol = consumptionAmtCol + 1;
  const deliveryAmtCol = deliveryCol + 1;
  const endingInvCol = deliveryAmtCol + 1;

  // ── Column widths ──
  ws.getColumn(1).width = 36; // item name
  ws.getColumn(2).width = 13;
  ws.getColumn(3).width = 22;
  ws.getColumn(4).width = 9;
  ws.getColumn(5).width = 11;
  ws.getColumn(6).width = 11;
  for (let c = DAILY_START_COL; c <= dailyEndCol; c++) ws.getColumn(c).width = 4.2;
  ws.getColumn(totalConsumedCol).width = 12;
  ws.getColumn(consumptionAmtCol).width = 14;
  ws.getColumn(deliveryCol).width = 11;
  ws.getColumn(deliveryAmtCol).width = 14;
  ws.getColumn(endingInvCol).width = 12;

  // ── Row 2: big title ──
  ws.getCell(2, 1).value = `${sheetTitle} `;
  ws.getCell(2, 1).font = titleFont;
  ws.getRow(2).height = 25;

  // ── Row 3/4: headers ──
  const headerRow = 3;
  const subRow = 4;

  const setMergedHeader = (
    col: number,
    label: string,
    font = headerFont,
  ) => {
    ws.mergeCells(headerRow, col, subRow, col);
    const cell = ws.getCell(headerRow, col);
    cell.value = label;
    cell.font = font;
    cell.alignment = headerCenter;
  };

  setMergedHeader(1, "ITEM");
  setMergedHeader(2, "ITEM CODE");
  setMergedHeader(3, "BRAND NAME / DESCRIPTION");
  setMergedHeader(4, "Unit");
  setMergedHeader(5, "PRICE");
  setMergedHeader(6, "Beg. Invty", headerFontSmall);

  // Daily consumption header spans the day columns; day numbers go in subRow
  ws.mergeCells(headerRow, DAILY_START_COL, headerRow, dailyEndCol);
  const dailyHeaderCell = ws.getCell(headerRow, DAILY_START_COL);
  dailyHeaderCell.value = `${monthYearLabel(selectedMonth)} - Daily Consumption`;
  dailyHeaderCell.font = headerFont;
  dailyHeaderCell.alignment = headerCenter;

  for (let d = 1; d <= numDays; d++) {
    const cell = ws.getCell(subRow, DAILY_START_COL + d - 1);
    cell.value = d;
    cell.font = { ...bodyFont, size: 9 };
    cell.alignment = { horizontal: "center" };
  }

  setMergedHeader(totalConsumedCol, "Monthly Total Consumption", headerFontSmall);
  setMergedHeader(consumptionAmtCol, "Consumption Amount", headerFontSmall);
  setMergedHeader(deliveryCol, "Add: Delivery", headerFontSmall);
  setMergedHeader(deliveryAmtCol, "Delivery Amount", headerFontSmall);
  setMergedHeader(endingInvCol, "Ending Invty.", headerFontSmall);

  ws.getRow(headerRow).height = 18;
  ws.getRow(subRow).height = 13;

  // ── Data rows ──
  let r = subRow + 1;
  const sortedRows = [...category.rows].sort((a, b) => a.name.localeCompare(b.name));

  for (const row of sortedRows) {
    ws.getCell(r, 1).value = row.name;
    ws.getCell(r, 2).value = row.itemCode;
    ws.getCell(r, 3).value = row.brand;
    ws.getCell(r, 4).value = row.unit;
    ws.getCell(r, 5).value = row.pricePerUnit;
    ws.getCell(r, 5).numFmt = "#,##0";
    ws.getCell(r, 6).value = row.beginningInventory;

    for (let d = 0; d < numDays; d++) {
      const qty = row.dailyConsumption[d] ?? 0;
      const cell = ws.getCell(r, DAILY_START_COL + d);
      if (qty > 0) cell.value = qty;
      cell.alignment = { horizontal: "center" };
      cell.font = { ...bodyFont, size: 9 };
    }

    const dailyRangeStart = ws.getCell(r, DAILY_START_COL).address;
    const dailyRangeEnd = ws.getCell(r, dailyEndCol).address;

    const totalConsumedCell = ws.getCell(r, totalConsumedCol);
    totalConsumedCell.value = { formula: `SUM(${dailyRangeStart}:${dailyRangeEnd})` };

    const priceAddr = ws.getCell(r, 5).address;
    const totalConsumedAddr = totalConsumedCell.address;

    const consumptionAmtCell = ws.getCell(r, consumptionAmtCol);
    consumptionAmtCell.value = { formula: `${totalConsumedAddr}*${priceAddr}` };
    consumptionAmtCell.numFmt = '#,##0;(#,##0);"—"';

    const deliveryCell = ws.getCell(r, deliveryCol);
    if (row.totalDelivered > 0) deliveryCell.value = row.totalDelivered;
    const deliveryAddr = deliveryCell.address;

    const deliveryAmtCell = ws.getCell(r, deliveryAmtCol);
    deliveryAmtCell.value = { formula: `${deliveryAddr}*${priceAddr}` };
    deliveryAmtCell.numFmt = '#,##0;(#,##0);"—"';

    const begInvAddr = ws.getCell(r, 6).address;
    const endingInvCell = ws.getCell(r, endingInvCol);
    endingInvCell.value = {
      formula: `SUM(${begInvAddr}-${totalConsumedAddr})+${deliveryAddr}`,
    };

    // Borders + body font across the row
    for (let c = 1; c <= endingInvCol; c++) {
      const cell = ws.getCell(r, c);
      cell.border = thinBorder;
      if (!cell.font || cell.font === bodyFont) cell.font = bodyFont;
    }

    r += 1;
  }

  // ── Footer totals row ──
  const lastDataRow = r - 1;
  const totalsRow = r;
  ws.getCell(totalsRow, 1).value = "TOTAL";
  ws.getCell(totalsRow, 1).font = { ...headerFont, size: 11 };

  const totalConsumedColLetter = ws.getCell(subRow + 1, totalConsumedCol).address.replace(/\d+$/, "");
  const consumptionAmtColLetter = ws.getCell(subRow + 1, consumptionAmtCol).address.replace(/\d+$/, "");
  const deliveryColLetter = ws.getCell(subRow + 1, deliveryCol).address.replace(/\d+$/, "");
  const deliveryAmtColLetter = ws.getCell(subRow + 1, deliveryAmtCol).address.replace(/\d+$/, "");

  if (lastDataRow >= subRow + 1) {
    ws.getCell(totalsRow, totalConsumedCol).value = {
      formula: `SUM(${totalConsumedColLetter}${subRow + 1}:${totalConsumedColLetter}${lastDataRow})`,
    };
    ws.getCell(totalsRow, consumptionAmtCol).value = {
      formula: `SUM(${consumptionAmtColLetter}${subRow + 1}:${consumptionAmtColLetter}${lastDataRow})`,
    };
    ws.getCell(totalsRow, deliveryCol).value = {
      formula: `SUM(${deliveryColLetter}${subRow + 1}:${deliveryColLetter}${lastDataRow})`,
    };
    ws.getCell(totalsRow, deliveryAmtCol).value = {
      formula: `SUM(${deliveryAmtColLetter}${subRow + 1}:${deliveryAmtColLetter}${lastDataRow})`,
    };
  }
  for (let c = totalConsumedCol; c <= endingInvCol; c++) {
    const cell = ws.getCell(totalsRow, c);
    cell.font = { ...headerFont, size: 11 };
    cell.numFmt = '#,##0;(#,##0);"—"';
    cell.border = { top: { style: "double", color: { argb: NAVY } } };
  }
}

// ─── Entry point ────────────────────────────────────────────────────────────

export async function exportMonthlyReportExcel(
  categories: ExcelExportCategory[],
  selectedMonth: string,
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Silverdab Unified Management System";
  wb.created = new Date();

  for (const category of categories) {
    if (category.rows.length === 0) continue;
    buildSheet(wb, category, selectedMonth);
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const fileLabel = monthYearLabel(selectedMonth).replace(/\s+/g, "_");
  saveAs(blob, `Office_Consumables_Monitoring_-_${fileLabel}.xlsx`);
}
