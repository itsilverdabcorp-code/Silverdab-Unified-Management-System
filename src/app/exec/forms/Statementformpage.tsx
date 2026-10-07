import AsyncStorage from "@react-native-async-storage/async-storage";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import {
  ArrowLeft,
  ArrowLeftRight,
  ChevronDown,
  Download,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  Image,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { ADUser } from "../../../../types"; // adjust to your actual path
import { useTheme } from "../../../theme/ThemeContext"; // adjust to your actual path
import ConfirmModal from "./ConfirmModal";

/* ============================================================================
   Statement of Account (FPD) — Executive > Forms
   Fill in the statement, pick a bank template, then Save / Print / Export PDF.
   Talks to the /fpd/* routes in server.js.
   ============================================================================ */

const API_URL = "https://api.silvergraph.ai";
const TOKEN_KEY = "AD_AUTH_TOKEN";

// Swap for the logo from STATEMENT_FPD_2026_01.docx if you want the one with
// the "Silverdab" wordmark (drop it in components/icons and change this path).
const LOGO = require("../../../components/icons/EIALogoSDB.png");

const PAPER_W = 794;
const PAPER_H = 1123;
const FONT = "Segoe UI, Arial, sans-serif";
const PT10 = 13.33; // 10pt in px
const PT13 = 17.33; // 13pt in px

const PREPARED_BY = "Arch. Jose Lorenzo D. Afable"; // fixed

const CURRENCIES: { sym: string; code: string; name: string; color: string }[] = [
  { sym: "₱", code: "PHP", name: "Philippine Peso", color: "#1d4ed8" },
  { sym: "$", code: "USD", name: "US Dollar", color: "#b91c1c" },
  { sym: "¥", code: "JPY", name: "Japanese Yen", color: "#be123c" },
  { sym: "AED", code: "AED", name: "UAE Dirham", color: "#15803d" },
];

const HDR_NAME = "SILVERDAB CORPORATION";
const HDR_LINES = [
  "7th Floor, Unit 3, Hexagon Corporate Center,",
  "1471 Quezon Avenue, Brgy. West Triangle,",
  "Quezon City 1104",
  "E: info@silverdab.com",
  "T: (02) 8291-0147",
  "M: +639175009180",
];

// ── Types ────────────────────────────────────────────────────────────────────
type Line = {
  id: string;
  date: string;
  desc: string;
  price: string;
  disc: boolean;
  pct: string;
};

type Bank = {
  id: number;
  label: string;
  accountName: string;
  accountAddress: string;
  bankName: string;
  branchName: string;
  branchAddress: string;
  accountNo: string;
  swiftCode: string;
  isDefault: boolean;
  fields?: BankField[] | null;
};

type BankField = { id: string; label: string; value: string };

const BANK_FIELDS: [string, keyof Bank][] = [
  ["Account Name", "accountName"],
  ["Address of Account Holder", "accountAddress"],
  ["Name of Bank", "bankName"],
  ["Name of Branch", "branchName"],
  ["Branch Address", "branchAddress"],
  ["Account no.", "accountNo"],
  ["Swift Code", "swiftCode"],
];

const newBankField = (label = "", value = ""): BankField => ({
  id: Math.random().toString(36).slice(2, 9),
  label,
  value,
});

// New dialog starts with the 7 standard rows, but each one can be renamed or removed.
const emptyBankDraft = () => ({
  label: "",
  fields: BANK_FIELDS.map(([l]) => newBankField(l)),
});

// Works for new templates (fields) and for old templates/snapshots (7 fixed columns).
const bankFieldsOf = (b: Partial<Bank> | null | undefined): BankField[] => {
  if (!b) return [];
  if (Array.isArray(b.fields) && b.fields.length > 0) return b.fields;
  return BANK_FIELDS.map(([label, key]) =>
    newBankField(label, String(b[key] ?? "")),
  );
};

const newLine = (date = ""): Line => ({
  id: Math.random().toString(36).slice(2, 9),
  date,
  desc: "",
  price: "",
  disc: false,
  pct: "",
});

// ── Helpers ──────────────────────────────────────────────────────────────────
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const isoOk = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v || "");
const pad2 = (n: number) => String(n).padStart(2, "0");
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const fmtBarDate = (v: string) => {
  if (!isoOk(v)) return "";
  const [y, m, d] = v.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`.toUpperCase();
};
const fmtRowDate = (v: string) => {
  if (!isoOk(v)) return "";
  const [y, m, d] = v.split("-").map(Number);
  return `${pad2(m)}/${pad2(d)}/${String(y).slice(2)}`;
};
const lineTotal = (r: Line) => {
  const p = parseFloat(r.price) || 0;
  const d = r.disc ? Math.min(100, Math.max(0, parseFloat(r.pct) || 0)) : 0;
  return p * (1 - d / 100);
};
const decimalsOf = (cur: string) => (cur === "¥" ? 0 : 2);
const money = (cur: string, n: number) =>
  `${cur}${cur === "AED" ? " " : ""}${Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: decimalsOf(cur),
    maximumFractionDigits: decimalsOf(cur),
  })}`;
const RATE_CODE: Record<string, "USD" | "JPY" | "AED"> = {
  $: "USD",
  "¥": "JPY",
  AED: "AED",
};
const RATE_REFRESH_MS = 60 * 60 * 1000; // BSP posts once a day, so hourly is plenty
const lineCount = (text: string, cpl: number) =>
  (text || "")
    .split("\n")
    .reduce((n, l) => n + Math.max(1, Math.ceil(l.length / cpl)), 0);
const isDarkColor = (c: string) => {
  const hex = String(c || "").replace("#", "");
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((x) => x + x)
          .join("")
      : hex;
  if (full.length !== 6) return false;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
};

async function api(path: string, init?: RequestInit) {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (!token) throw new Error("Your session has expired. Please log in again.");
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...((init?.headers as any) || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return data;
}

// ── Page ─────────────────────────────────────────────────────────────────────
type Props = {
  user: ADUser;
  statementNo?: string | null; // set => load that saved statement
  readOnly?: boolean;
  onBack: () => void;
  onEdit?: (statementNo: string) => void; // switch from View to Edit
  onView?: (statementNo: string) => void; // switch back to View after saving
};

export default function StatementFormPage({
  user,
  statementNo,
  readOnly = false,
  onBack,
  onEdit,
  onView,
}: Props) {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const stacked = width < 1100;
  const dark = isDarkColor(theme.surface);

  const [date, setDate] = useState(todayIso());
  const [currency, setCurrency] = useState("₱");
  const [billName, setBillName] = useState("");
  const [billAddr, setBillAddr] = useState("");
  const preparedBy = PREPARED_BY;
  const [rows, setRows] = useState<Line[]>([newLine(todayIso())]);

  const [banks, setBanks] = useState<Bank[]>([]);
  const [bankId, setBankId] = useState<number | null>(null);
  const [customBank, setCustomBank] = useState<Partial<Bank> | null>(null); // snapshot of a deleted template
  const [bankDialog, setBankDialog] = useState(false);
  const [bankDraft, setBankDraft] = useState(emptyBankDraft());

  const [stmtNo, setStmtNo] = useState(""); // shown in the locked field + title bar
  const [loadedNo, setLoadedNo] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [rowH, setRowH] = useState<Record<string, number>>({});
  const [tailH, setTailH] = useState(0);
  const [lastNumInput, setLastNumInput] = useState("");
  const [needsSeed, setNeedsSeed] = useState(false);
  const [rates, setRates] = useState<{
    USD: number;
    JPY: number;
    AED: number;
  } | null>(null);
  const [ratesAt, setRatesAt] = useState<string | null>(null); // bulletin date
  const [rateSource, setRateSource] = useState<string>("");
  const [rateError, setRateError] = useState(false);
  // Rate frozen on a saved statement, so old statements don't change when the market moves.
  const [lockedRate, setLockedRate] = useState<{
    cur: string;
    from: string;
    rate: number;
  } | null>(null);

  const [curOpen, setCurOpen] = useState<"from" | "to" | null>(null);
  const [sampleAmt, setSampleAmt] = useState("1");
  const [fromCur, setFromCur] = useState("₱"); // currency the unit prices are typed in

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3400);
  };

  // ── Data loading ──────────────────────────────────────────────────────────
  const loadBanks = async (selectId?: number) => {
    const data = await api("/fpd/bank-templates");
    const list: Bank[] = data.templates ?? [];
    setBanks(list);
    setBankId(
      (cur) =>
        selectId ??
        cur ??
        list.find((b) => b.isDefault)?.id ??
        list[0]?.id ??
        null,
    );
  };

  useEffect(() => {
    loadBanks().catch((e) =>
      showToast(`Couldn't load bank templates: ${e.message}`),
    );
  }, []);

  useEffect(() => {
    if (!statementNo) return;
    (async () => {
      try {
        const data = await api(
          `/fpd/statements/${encodeURIComponent(statementNo)}`,
        );
        const s = data.statement;
        setLoadedNo(s.statementNo);
        setStmtNo(s.statementNo);
        setDate(String(s.date || "").slice(0, 10));
        setBillName(s.billToName ?? "");
        setBillAddr(s.billToAddress ?? "");
        setCurrency(s.currency || "₱");
        setFromCur(s.fromCurrency || "₱");
        setLockedRate({
          cur: s.currency || "₱",
          from: s.fromCurrency || "₱",
          rate: Number(s.exchangeRate) || 1,
        });
        setRows(
          Array.isArray(s.items) && s.items.length > 0
            ? s.items.map((it: any) => ({
                id: Math.random().toString(36).slice(2, 9),
                date: it.date ? String(it.date).slice(0, 10) : "",
                desc: it.description ?? "",
                price: it.unitPrice ? String(it.unitPrice) : "",
                disc: !!it.discounted,
                pct: it.discountPercent ? String(it.discountPercent) : "",
              }))
            : [newLine()],
        );
        if (s.bankTemplateId) {
          setBankId(s.bankTemplateId);
          setCustomBank(null);
        } else {
          setCustomBank(s.bank ?? null); // template was deleted — keep what was printed
        }
      } catch (e: any) {
        showToast(`Load failed: ${e.message}`);
      }
    })();
  }, [statementNo]);

  // Themed scrollbars (web only), scoped to this page via #stmt-root.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const id = "stmt-scrollbar-style";
    let el = document.getElementById(id) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = id;
      document.head.appendChild(el);
    }
    el.textContent = `
      #stmt-root * {
        scrollbar-width: thin;
        scrollbar-color: ${theme.textInactive} transparent;
      }
      #stmt-root *::-webkit-scrollbar { width: 10px; height: 10px; }
      #stmt-root *::-webkit-scrollbar-track { background: transparent; }
      #stmt-root *::-webkit-scrollbar-thumb {
        background-color: ${theme.textInactive};
        border-radius: 999px;
        border: 2px solid transparent;
        background-clip: content-box;
      }
      #stmt-root *::-webkit-scrollbar-thumb:hover {
        background-color: ${theme.iconActive};
      }
      #stmt-root *::-webkit-scrollbar-corner { background: transparent; }
    `;
  }, [theme.textInactive, theme.iconActive]);

  // New statement: preview the next automatic number (re-fetched when the year changes).
  const year = isoOk(date)
    ? date.slice(0, 4)
    : String(new Date().getFullYear());
  useEffect(() => {
    // Viewing/editing a saved statement keeps its own number.
    if (statementNo || loadedNo) return;

    let cancelled = false;
    api(`/fpd/next-number?date=${date}`)
      .then((d) => {
        if (cancelled) return;
        setStmtNo(d.statementNo);
        setNeedsSeed(!!d.needsSeed);
      })
      .catch(() => {
        if (cancelled) return;
        setStmtNo(`FPD.${year}.--`);
        setNeedsSeed(true); // can't reach the server, let the user seed manually
      });

    return () => {
      cancelled = true;
    };
  }, [year, loadedNo, statementNo]);

  // ── Derived ───────────────────────────────────────────────────────────────
  // ── Live exchange rate (PHP → USD / JPY) ──
  const fetchRates = async () => {
    try {
      const data = await api("/fpd/exchange-rates");
      setRates({
        USD: data.rates.USD,
        JPY: data.rates.JPY,
        AED: data.rates.AED,
      });
      setRatesAt(data.asOf);
      setRateSource(data.source);
      setRateError(false);
    } catch {
      setRateError(true);
    }
  };
  useEffect(() => {
    fetchRates();
    const t = setInterval(fetchRates, RATE_REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  // rates are "units of X per 1 PHP", so a cross rate is toPer / fromPer
  const perPhp = (sym: string): number | null =>
    sym === "₱" ? 1 : (rates?.[RATE_CODE[sym]] ?? null);
  const liveRate: number | null = (() => {
    const f = perPhp(fromCur);
    const t = perPhp(currency);
    return f && t ? t / f : null;
  })();
  const rate: number | null =
    fromCur === currency
      ? 1
      : lockedRate && lockedRate.cur === currency && lockedRate.from === fromCur
        ? lockedRate.rate
        : liveRate;
  const fx = rate ?? 1;
  const conv = (n: number) => {
    const f = 10 ** decimalsOf(currency);
    return Math.round(n * fx * f) / f;
  };

  const activeBank: Partial<Bank> =
    customBank ?? banks.find((b) => b.id === bankId) ?? {};
  const activeFields = bankFieldsOf(activeBank);
  const filled = useMemo(
    () => rows.filter((r) => r.date || r.desc.trim() || r.price !== ""),
    [rows],
  );
  const grandTotal = filled.reduce((s, r) => s + conv(lineTotal(r)), 0);

  const updateRow = (id: string, patch: Partial<Line>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRow = (id: string) =>
    setRows((rs) =>
      rs.length > 1 ? rs.filter((r) => r.id !== id) : [newLine(date)],
    );

  const resetAll = () => {
    const doReset = () => {
      setBillName("");
      setBillAddr("");
      setRows([newLine(date)]);
    };
    if (Platform.OS === "web" && typeof window !== "undefined") {
      if (window.confirm("Clear the whole form?")) doReset();
    } else doReset();
  };

  // ── Bank templates ────────────────────────────────────────────────────────
  const updateDraftField = (id: string, patch: Partial<BankField>) =>
    setBankDraft((d) => ({
      ...d,
      fields: d.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    }));
  const removeDraftField = (id: string) =>
    setBankDraft((d) => ({ ...d, fields: d.fields.filter((f) => f.id !== id) }));

  const saveBankTemplate = async () => {
    const d = bankDraft;
    const fields = d.fields
      .map((f) => ({ label: f.label.trim(), value: f.value.trim() }))
      .filter((f) => f.label || f.value);
    if (fields.length === 0 || fields.some((f) => !f.label)) {
      showToast("Add at least one detail, and give every detail a label.");
      return;
    }
    try {
      const res = await api("/fpd/bank-templates", {
        method: "POST",
        body: JSON.stringify({
          label: d.label,
          fields,
          createdByName: user.displayName,
        }),
      });
      setCustomBank(null);
      await loadBanks(res.template.id);
      setBankDialog(false);
      showToast("Bank template saved.");
    } catch (e: any) {
      showToast(`Save failed: ${e.message}`);
    }
  };

  const deleteBankTemplate = async () => {
    const b = banks.find((x) => x.id === bankId);
    if (!b || b.isDefault) return;
    if (
      Platform.OS === "web" &&
      typeof window !== "undefined" &&
      !window.confirm(`Delete “${b.label}”?`)
    )
      return;
    try {
      await api(`/fpd/bank-templates/${b.id}`, { method: "DELETE" });
      setBankId(null);
      await loadBanks();
      showToast("Template deleted.");
    } catch (e: any) {
      showToast(`Delete failed: ${e.message}`);
    }
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const setLastNumber = async () => {
    if (Platform.OS !== "web" || typeof window === "undefined") {
      showToast("Setting the last number is available on the web version.");
      return;
    }
    const n = parseInt(lastNumInput.trim(), 10);
    if (!Number.isFinite(n) || n < 0) {
      showToast("Enter a valid number.");
      return;
    }
    try {
      const d = await api("/fpd/last-number", {
        method: "PUT",
        body: JSON.stringify({ date, lastNumber: n }),
      });
      setStmtNo(d.statementNo);
      setNeedsSeed(false);
      showToast(`Next statement will be ${d.statementNo}.`);
    } catch (e: any) {
      showToast(`Failed: ${e.message}`);
    }
  };

  const [saveOpen, setSaveOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const validateForm = () => {
    if (!billName.trim()) return showToast("Bill to name is required."), false;
    if (filled.length === 0)
      return showToast("Add at least one statement line."), false;
    if (!customBank && !bankId) return showToast("Pick a bank template."), false;
    if (rate == null)
      return (
        showToast("Exchange rate isn't available yet. Try again in a moment."),
        false
      );
    return true;
  };

  // Editing a saved statement asks for confirmation first; a new one saves directly.
  const handleSave = () => {
    if (loadedNo) {
      if (!validateForm()) return;
      setSaveError(null);
      setSaveOpen(true);
    } else {
      doSave();
    }
  };

  const doSave = async () => {
    if (!validateForm()) return;
    setSaving(true);
    setSaveError(null);

    const payload = {
      date,
      billToName: billName.trim(),
      billToAddress: billAddr,
      currency,
      exchangeRate: rate,
      fromCurrency: fromCur,
      items: filled.map((r) => ({
        date: r.date || null,
        description: r.desc,
        unitPrice: parseFloat(r.price) || 0,
        discounted: r.disc,
        discountPercent: r.disc ? parseFloat(r.pct) || 0 : 0,
      })),
      preparedBy,
      createdByName: user.displayName,
      ...(customBank ? { bank: customBank } : { bankTemplateId: bankId }),
    };

    try {
      if (loadedNo) {
        await api(`/fpd/statements/${encodeURIComponent(loadedNo)}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setSaveOpen(false);
        if (onView) onView(loadedNo); // back to viewing the saved statement
        else showToast("Updated.");
      } else {
        const d = await api("/fpd/statements", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setLoadedNo(d.statementNo);
        setStmtNo(d.statementNo);
        showToast(`Saved ${d.statementNo}.`);
      }
    } catch (e: any) {
      if (loadedNo) setSaveError(e.message);
      else showToast(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = () => {
    if (!loadedNo) return;
    setDeleteError(null);
    setDeleteOpen(true);
  };

  const runDelete = async () => {
    if (!loadedNo) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api(`/fpd/statements/${encodeURIComponent(loadedNo)}`, {
        method: "DELETE",
      });
      setDeleteOpen(false);
      onBack(); // back to the Saved Statements list, which reloads
    } catch (e: any) {
      setDeleteError(e.message);
    } finally {
      setDeleting(false);
    }
  };

  // ── Pagination (estimated heights, in paper px) ───────────────────────────
  const HEADER_H = 118;
  const PAGE_TOP = 44 + HEADER_H;
  const PAGE_LIMIT = PAPER_H - 60;
  const TABLE_HEAD_H = 30;
  const ROW_MIN_H = 31;
  const addrLines = lineCount(billAddr, 78);
  const FIRST_BLOCK_H = 13 + 42 + 13 + 22 + (1 + addrLines) * 17 + 13;

  type PageDef = { rows: Line[]; first: boolean; tail: boolean; pad: number };

  const rowHeight = (r: Line) =>
    rowH[r.id] ?? Math.max(ROW_MIN_H, lineCount(r.desc, 52) * 17 + 14);

  const pages = useMemo<PageDef[]>(() => {
    const pad = Math.max(0, 3 - filled.length);
    const out: PageDef[] = [{ rows: [], first: true, tail: false, pad }];
    let cur = out[0];
    let y = PAGE_TOP + FIRST_BLOCK_H + TABLE_HEAD_H;

    filled.forEach((r) => {
      const h = rowHeight(r);
      if (y + h > PAGE_LIMIT && cur.rows.length > 0) {
        cur = { rows: [], first: false, tail: false, pad: 0 };
        out.push(cur);
        y = PAGE_TOP + TABLE_HEAD_H;
      }
      cur.rows.push(r);
      y += h;
    });
    y += pad * ROW_MIN_H;

    const tailNeed = tailH || 360; // total bar + bank block + prepared by
    if (y + tailNeed <= PAGE_LIMIT) cur.tail = true;
    else out.push({ rows: [], first: false, tail: true, pad: 0 });
    return out;
  }, [filled, rowH, tailH, billAddr]);

  // ── Preview scale ─────────────────────────────────────────────────────────
  const previewScale = stacked
    ? Math.min(1, (width - 40 - 36) / PAPER_W)
    : Math.min(1, (width - 40 - 480 - 20 - 36) / PAPER_W);
  const scale = Math.max(0.4, previewScale);

  // ── Print / PDF (web only) ────────────────────────────────────────────────
  const handleExportPdf = async () => {
    if (Platform.OS !== "web" || typeof document === "undefined") {
      showToast("PDF export is available on the web version.");
      return;
    }
    const nodes = Array.from(
      document.querySelectorAll('[id^="stmt-inner-"]'),
    ) as HTMLElement[];
    if (!nodes.length) return;
    const prev = nodes.map((n) => n.style.transform);
    nodes.forEach((n) => {
      n.style.transform = "none";
    });
    try {
      const pdf = new jsPDF({ unit: "px", format: [PAPER_W, PAPER_H] });
      for (let i = 0; i < nodes.length; i++) {
        const canvas = await html2canvas(nodes[i], {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
          width: PAPER_W,
          height: PAPER_H,
        });
        if (i > 0) pdf.addPage([PAPER_W, PAPER_H]);
        pdf.addImage(
          canvas.toDataURL("image/jpeg", 0.95),
          "JPEG",
          0,
          0,
          PAPER_W,
          PAPER_H,
        );
      }
      pdf.save(
        `${stmtNo || "STATEMENT"}_${(billName || "Client").replace(/\s+/g, "_")}.pdf`,
      );
    } catch (e: any) {
      showToast(`PDF export failed: ${e.message}`);
    } finally {
      nodes.forEach((n, i) => {
        n.style.transform = prev[i];
      });
    }
  };

  const handlePrint = () => {
    if (Platform.OS !== "web" || typeof document === "undefined") {
      showToast("Printing is available on the web version.");
      return;
    }
    const nodes = Array.from(
      document.querySelectorAll('[id^="stmt-page-"]'),
    ) as HTMLElement[];
    if (!nodes.length) return;

    let css = "";
    let links = "";
    Array.from(document.styleSheets).forEach((s) => {
      try {
        css +=
          Array.from(s.cssRules)
            .map((r) => r.cssText)
            .join("\n") + "\n";
      } catch {
        if (s.href) links += `<link rel="stylesheet" href="${s.href}">`;
      }
    });

    const printCss = `
      @page { size: A4; margin: 0; }
      html, body { margin: 0 !important; padding: 0 !important; height: auto !important;
                   overflow: visible !important; display: block !important; background: #fff !important; }
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      [id^="stmt-page-"] { width: 794px !important; height: 1122px !important; margin: 0 !important;
                           overflow: hidden !important; position: relative;
                           break-after: page; page-break-after: always; }
      [id^="stmt-page-"]:last-child { break-after: auto; page-break-after: auto; }
      [id^="stmt-inner-"] { transform: none !important; box-shadow: none !important; }
    `;

    const iframe = document.createElement("iframe");
    iframe.style.cssText =
      "position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument!;
    doc.open();
    doc.write(
      `<!doctype html><html><head><base href="${document.baseURI}">${links}<style>${css}</style><style>${printCss}</style></head><body>${nodes
        .map((n) => n.outerHTML)
        .join("")}</body></html>`,
    );
    doc.close();

    const go = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => iframe.remove(), 2000);
    };
    const fonts = (doc as any).fonts?.ready as Promise<any> | undefined;
    (fonts ?? Promise.resolve()).then(() => setTimeout(go, 400));
  };

  // ── Styling helpers ───────────────────────────────────────────────────────
  const S = {
    card: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.navBorder,
      borderRadius: 12,
      padding: 16,
      marginBottom: 14,
    } as const,
    conv: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      height: 46,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: theme.navBorder,
      borderRadius: 10,
      backgroundColor: theme.surface,
    } as const,
    convLabel: {
      position: "absolute",
      top: -8,
      left: 10,
      paddingHorizontal: 4,
      fontFamily: "Outfit",
      fontSize: 11,
      color: theme.textInactive,
      backgroundColor: theme.surface,
    } as const,
    input: {
      fontFamily: "Outfit",
      fontSize: 13.5,
      color: theme.textActive,
      borderWidth: 1,
      borderColor: theme.navBorder,
      borderRadius: 8,
      paddingHorizontal: 11,
      paddingVertical: 9,
      backgroundColor: theme.surface,
      ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : {}),
    } as const,
  };
  const small = { paddingVertical: 7, fontSize: 13 } as const;

  const mini = {
    fontFamily: "Outfit-Bold",
    fontSize: 10,
    letterSpacing: 0.6,
    color: theme.textInactive,
    marginBottom: 3,
  } as const;

  // ── FORM COLUMN ───────────────────────────────────────────────────────────
  const formColumn = (
    <View
      pointerEvents={readOnly ? "none" : "auto"}
      style={{
        flex: stacked ? undefined : 1,
        minWidth: 340,
        maxWidth: stacked ? undefined : 480,
        width: stacked ? "100%" : undefined,
        opacity: readOnly ? 0.85 : 1,
      }}
    >
      {/* 1. Statement details */}
      <View style={S.card}>
        <SectionTitle n={1} title="Statement details" />
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Field label="Statement No." style={{ flex: 1 }}>
            <TextInput
              style={[
                S.input,
                { backgroundColor: theme.bgHover, color: theme.textInactive },
              ]}
              value={stmtNo}
              editable={false}
            />
          </Field>
          <Field label="Date" style={{ flex: 1 }}>
            <DateInput
              value={date}
              onChange={setDate}
              style={S.input}
              dark={dark}
              accent={theme.iconActive}
            />
          </Field>
        </View>
        {needsSeed && !loadedNo && !readOnly ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Text style={{ fontFamily: "Outfit-medium", fontSize: 12.5, color: theme.textInactive }}>
              Last no. used: FPD.{year}.
            </Text>
            <TextInput
              style={[S.input, small, { width: 70, textAlign: "center" }]}
              value={lastNumInput}
              onChangeText={(t) => setLastNumInput(t.replace(/[^0-9]/g, ""))}
              placeholder="12"
              placeholderTextColor={theme.textInactive}
              keyboardType="number-pad"
            />
            <Btn label="Set" onPress={setLastNumber} compact dashed />
          </View>
        ) : null}

        <Field label="Bill to — Name">
          <TextInput
            style={S.input}
            value={billName}
            onChangeText={setBillName}
            placeholder="e.g. Silverdab Corporation"
            placeholderTextColor={theme.textInactive}
          />
        </Field>
        <Field label="Bill to — Address">
          <TextInput
            style={[S.input, { minHeight: 70, textAlignVertical: "top" }]}
            value={billAddr}
            onChangeText={setBillAddr}
            multiline
            placeholder="Street, City, Country"
            placeholderTextColor={theme.textInactive}
          />
        </Field>
        <Field label="Prepared by" hint="(fixed)">
          <TextInput
            style={[
              S.input,
              { backgroundColor: theme.bgHover, color: theme.textInactive },
            ]}
            value={preparedBy}
            editable={false}
          />
        </Field>
        <Text
          style={{
            fontFamily: "Outfit",
            fontSize: 11.5,
            color: theme.textInactive,
            lineHeight: 16,
          }}
        >
          The number is assigned when you save: FPD.YEAR.##, restarting each
          year.
        </Text>
      </View>

      {/* 2. Lines */}
      <View style={S.card}>
        <SectionTitle n={2} title="Statement lines" />

                {/* currency converter */}
        <View style={{ marginBottom: 14, zIndex: 30 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {/* FROM */}
            <View style={[S.conv, { flex: 1 }]}>
              <Text style={S.convLabel}>From</Text>
              <TextInput
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontFamily: "Outfit-Bold",
                  fontSize: 17,
                  color: theme.textActive,
                  paddingVertical: 0,
                  ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : {}),
                }}
                value={`${fromCur}${sampleAmt}`}
                onChangeText={(t) =>
                  setSampleAmt(
                    t.replace(fromCur, "").replace(/[^0-9.]/g, "") || "0",
                  )
                }
                keyboardType="decimal-pad"
              />
              <TouchableOpacity
                onPress={() => setCurOpen((o) => (o === "from" ? null : "from"))}
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <CurBadge c={CURRENCIES.find((x) => x.sym === fromCur)!} />
                <Text style={{ fontFamily: "Outfit-Bold", fontSize: 12.5, color: theme.textActive }}>
                  {CURRENCIES.find((x) => x.sym === fromCur)?.code}
                </Text>
                <ChevronDown size={14} color={theme.textInactive} />
              </TouchableOpacity>
            </View>

            {/* SWAP */}
            <TouchableOpacity
              onPress={() => {
                setFromCur(currency);
                setCurrency(fromCur);
                setCurOpen(null);
              }}
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                borderWidth: 1,
                borderColor: theme.navBorder,
                backgroundColor: theme.surface,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ArrowLeftRight size={14} color={theme.textActive} />
            </TouchableOpacity>

            {/* TO */}
            <View style={[S.conv, { flex: 1 }]}>
              <Text style={S.convLabel}>To</Text>
              <Text
                numberOfLines={1}
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontFamily: "Outfit-Bold",
                  fontSize: 17,
                  color: theme.textActive,
                }}
              >
                {rate == null
                  ? "…"
                  : money(
                      currency,
                      Math.round(
                        (parseFloat(sampleAmt) || 0) * fx *
                          10 ** decimalsOf(currency),
                      ) / 10 ** decimalsOf(currency),
                    )}
              </Text>
              <TouchableOpacity
                onPress={() => setCurOpen((o) => (o === "to" ? null : "to"))}
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <CurBadge c={CURRENCIES.find((x) => x.sym === currency)!} />
                <Text style={{ fontFamily: "Outfit-Bold", fontSize: 12.5, color: theme.textActive }}>
                  {CURRENCIES.find((x) => x.sym === currency)?.code}
                </Text>
                <ChevronDown size={14} color={theme.textInactive} />
              </TouchableOpacity>
            </View>
          </View>

          {/* dropdown (shared by From and To) */}
          {curOpen && (
            <View
              style={{
                position: "absolute",
                top: 52,
                ...(curOpen === "from" ? { left: 0 } : { right: 0 }),
                width: "55%",
                backgroundColor: theme.surface,
                borderWidth: 1,
                borderColor: theme.navBorder,
                borderRadius: 10,
                paddingVertical: 4,
                zIndex: 40,
                ...(Platform.OS === "web"
                  ? ({ boxShadow: "0 8px 24px rgba(0,0,0,.25)" } as any)
                  : { elevation: 6 }),
              }}
            >
              {CURRENCIES.map((c) => {
                const selected = c.sym === (curOpen === "from" ? fromCur : currency);
                return (
                  <TouchableOpacity
                    key={c.code}
                    onPress={() => {
                      if (curOpen === "from") setFromCur(c.sym);
                      else setCurrency(c.sym);
                      setCurOpen(null);
                    }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 9,
                      backgroundColor: selected ? theme.bgActive : "transparent",
                    }}
                  >
                    <CurBadge c={c} />
                    <Text style={{ fontFamily: "Outfit-Bold", fontSize: 12.5, color: theme.textActive }}>
                      {c.code}
                    </Text>
                    <Text style={{ fontFamily: "Outfit", fontSize: 12.5, color: theme.textInactive }}>
                      - {c.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* rate info */}
          {fromCur !== currency && (
            <Text
              style={{
                fontFamily: "Outfit",
                fontSize: 11.5,
                color: theme.textInactive,
                marginTop: 8,
                lineHeight: 16,
              }}
            >
              {rate == null
                ? rateError
                  ? "Couldn't load the exchange rate. Check your connection."
                  : "Loading exchange rate…"
                : `Unit prices are entered in ${fromCur} and converted. 1 ${
                    CURRENCIES.find((x) => x.sym === fromCur)?.code
                  } = ${rate.toFixed(rate < 1 ? 6 : 4)} ${
                    CURRENCIES.find((x) => x.sym === currency)?.code
                  }${
                    lockedRate &&
                    lockedRate.cur === currency &&
                    lockedRate.from === fromCur
                      ? " (rate saved with this statement)"
                      : ratesAt
                        ? ` · ${rateSource} rate as of ${ratesAt}`
                        : ""
                  }`}
            </Text>
          )}
          {fromCur !== currency &&
          lockedRate &&
          lockedRate.cur === currency &&
          lockedRate.from === fromCur &&
          liveRate != null ? (
            <View style={{ flexDirection: "row", marginTop: 8 }}>
              <Btn
                label="Use live rate"
                Icon={RotateCcw}
                onPress={() => setLockedRate(null)}
                compact
                dashed
              />
            </View>
          ) : null}
        </View>

        {rows.map((r, i) => (
          <View
            key={r.id}
            style={{
              borderWidth: 1,
              borderColor: theme.navBorder,
              borderRadius: 9,
              padding: 10,
              marginBottom: 10,
              backgroundColor: theme.bgHover,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 6,
              }}
            >
              <Text
                style={{
                  fontFamily: "Outfit-Bold",
                  fontSize: 11,
                  color: theme.iconActive,
                }}
              >
                LINE #{i + 1}
              </Text>
              <TouchableOpacity onPress={() => removeRow(r.id)} hitSlop={8}>
                <X size={16} color={theme.textInactive} />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={mini}>DATE</Text>
                <DateInput
                  value={r.date}
                  onChange={(v) => updateRow(r.id, { date: v })}
                  style={[S.input, small]}
                  dark={dark}
                  accent={theme.iconActive}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={mini}>{`UNIT PRICE (${fromCur})`}</Text>
                <TextInput
                  style={[S.input, small]}
                  value={r.price}
                  onChangeText={(t) =>
                    updateRow(r.id, { price: t.replace(/[^0-9.]/g, "") })
                  }
                  placeholder="0.00"
                  placeholderTextColor={theme.textInactive}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            <View style={{ marginTop: 8 }}>
              <Text style={mini}>DESCRIPTION</Text>
              <TextInput
                style={[
                  S.input,
                  small,
                  { minHeight: 130, textAlignVertical: "top" },
                ]}
                value={r.desc}
                onChangeText={(t) => updateRow(r.id, { desc: t })}
                multiline
                placeholder="e.g. 50% Down Payment for the …"
                placeholderTextColor={theme.textInactive}
              />
            </View>

            <View
              style={{
                flexDirection: "row",
                gap: 8,
                marginTop: 8,
                alignItems: "flex-end",
              }}
            >
              <View style={{ flex: 1.2 }}>
                <Text style={mini}>DISCOUNTED?</Text>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  <Chip
                    active={!r.disc}
                    label="No"
                    onPress={() => updateRow(r.id, { disc: false, pct: "" })}
                  />
                  <Chip
                    active={r.disc}
                    label="Yes"
                    onPress={() => updateRow(r.id, { disc: true })}
                  />
                </View>
              </View>
              <View style={{ flex: 1, opacity: r.disc ? 1 : 0.45 }}>
                <Text style={mini}>DISCOUNT %</Text>
                <TextInput
                  style={[S.input, small]}
                  value={r.pct}
                  editable={r.disc}
                  onChangeText={(t) =>
                    updateRow(r.id, { pct: t.replace(/[^0-9.]/g, "") })
                  }
                  placeholder="0"
                  placeholderTextColor={theme.textInactive}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={{ flex: 1.2 }}>
                <Text style={mini}>TOTAL</Text>
                <Text
                  style={{
                    fontFamily: "Outfit-Bold",
                    fontSize: 13,
                    color: theme.iconActive,
                    paddingVertical: 8,
                  }}
                >
                  {money(currency, conv(lineTotal(r)))}
                </Text>
              </View>
            </View>
          </View>
        ))}
        <View style={{ flexDirection: "row" }}>
          <Btn
            label="Add row"
            Icon={Plus}
            onPress={() => setRows((rs) => [...rs, newLine(date)])}
            compact
            dashed
          />
        </View>
      </View>

      {/* 3. Bank details */}
      <View style={S.card}>
        <SectionTitle n={3} title="Bank details" />
        <Field label="Bank template">
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {banks.map((b) => (
              <Chip
                key={b.id}
                active={!customBank && b.id === bankId}
                label={b.label}
                onPress={() => {
                  setCustomBank(null);
                  setBankId(b.id);
                }}
              />
            ))}
          </View>
        </Field>
        {customBank && (
          <Text
            style={{
              fontFamily: "Outfit",
              fontSize: 11.5,
              color: theme.textInactive,
              marginBottom: 10,
            }}
          >
            This statement was saved with bank details from a template that has
            since been deleted. Pick a template to replace them.
          </Text>
        )}
        <View
          style={{
            borderWidth: 1,
            borderColor: theme.navBorder,
            borderRadius: 9,
            backgroundColor: theme.bgHover,
            padding: 10,
            marginBottom: 14,
          }}
        >
          {activeFields.map((f, i) => (
            <View
              key={i}
              style={{ flexDirection: "row", paddingVertical: 2 }}
            >
              <Text
                style={{
                  width: 130,
                  fontFamily: "Outfit",
                  fontSize: 12.5,
                  color: theme.textInactive,
                }}
              >
                {f.label}
              </Text>
              <Text
                style={{
                  flex: 1,
                  fontFamily: "Outfit",
                  fontSize: 12.5,
                  color: theme.textActive,
                }}
              >
                {f.value}
              </Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <Btn
            label="New bank template"
            Icon={Plus}
            onPress={() => {
              setBankDraft(emptyBankDraft());
              setBankDialog(true);
            }}
            compact
            dashed
          />
          {!customBank && banks.find((b) => b.id === bankId && !b.isDefault) ? (
            <Btn
              label="Delete template"
              Icon={Trash2}
              onPress={deleteBankTemplate}
              compact
            />
          ) : null}
        </View>
      </View>
    </View>
  );

  // ── PAPER ─────────────────────────────────────────────────────────────────
  const gray = {
    fontFamily: FONT,
    fontSize: PT10,
    color: "#595959",
    lineHeight: 17,
  } as const;

  const renderPage = (pg: PageDef, idx: number, total: number) => (
    <View
      key={idx}
      nativeID={`stmt-page-${idx}`}
      style={{
        width: PAPER_W * scale,
        height: PAPER_H * scale,
        alignSelf: "center",
        marginBottom: idx < total - 1 ? 18 : 0,
      }}
    >
      <View
        nativeID={`stmt-inner-${idx}`}
        style={{
          width: PAPER_W,
          height: PAPER_H,
          backgroundColor: "#fff",
          paddingTop: 44,
          paddingHorizontal: 72,
          paddingBottom: 40,
          transform: [{ scale }],
          transformOrigin: "top left" as any,
          ...(Platform.OS === "web"
            ? ({ boxShadow: "0 6px 30px rgba(0,0,0,.35)" } as any)
            : {}),
        }}
      >
        {/* header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 10,
            minHeight: HEADER_H - 18,
          }}
        >
          <View style={{ flex: 1, marginTop: 4 }}>
            <Text style={[gray, { fontWeight: "700" }]}>{HDR_NAME}</Text>
            {HDR_LINES.map((l, i) => (
              <Text key={i} style={gray}>
                {l}
              </Text>
            ))}
          </View>
          <Image
            source={LOGO}
            style={{ width: 84, height: 88 }}
            resizeMode="contain"
          />
        </View>

        {pg.first && (
          <>
            {/* title bar */}
            <View
              style={{
                marginTop: 13,
                backgroundColor: "#000",
                flexDirection: "row",
                justifyContent: "space-between",
                paddingVertical: 13,
                paddingHorizontal: 8,
              }}
            >
              <Text
                style={{
                  fontFamily: FONT,
                  fontSize: PT13,
                  fontWeight: "700",
                  color: "#fff",
                }}
              >
                {`STATEMENT NO.${stmtNo}`}
              </Text>
              <Text
                style={{
                  fontFamily: FONT,
                  fontSize: PT13,
                  fontWeight: "700",
                  color: "#fff",
                }}
              >
                {fmtBarDate(date)}
              </Text>
            </View>

            {/* bill to */}
            <View style={{ marginTop: 13 }}>
              <Text
                style={{
                  fontFamily: FONT,
                  fontSize: PT10,
                  color: "#000",
                  borderBottomWidth: 1,
                  borderBottomColor: "#5b9bd5",
                  paddingBottom: 3,
                  paddingLeft: 8,
                  marginBottom: 3,
                }}
              >
                BILL TO
              </Text>
              <View style={{ paddingLeft: 8, minHeight: 36 }}>
                <Text style={P.txt}>{billName}</Text>
                <Text style={P.txt}>{billAddr}</Text>
              </View>
            </View>
          </>
        )}

        {/* table */}
        {(pg.rows.length > 0 || pg.first) && (
          <View style={{ marginTop: 13 }}>
            <View
              style={{
                flexDirection: "row",
                backgroundColor: "#000",
                paddingVertical: 6.67,
                paddingHorizontal: 8,
              }}
            >
              <Text style={[P.th, { width: 84 }]}>DATE</Text>
              <Text style={[P.th, { flex: 1 }]}>DESCRIPTION</Text>
              <Text style={[P.th, { width: 122, textAlign: "right" }]}>
                UNIT PRICE
              </Text>
              <Text style={[P.th, { width: 122, textAlign: "right" }]}>
                TOTAL
              </Text>
            </View>
            {pg.rows.map((r) => {
              const has = r.price !== "";
              const d = r.disc ? parseFloat(r.pct) || 0 : 0;
              return (
                <View
                  key={r.id}
                  onLayout={(e) => {
                    const h = e.nativeEvent.layout.height;
                    setRowH((m) =>
                      Math.abs((m[r.id] ?? 0) - h) < 0.5
                        ? m
                        : { ...m, [r.id]: h },
                    );
                  }}
                  style={P.row}
                >
                  <Text style={[P.txt, { width: 84 }]}>
                    {fmtRowDate(r.date)}
                  </Text>
                  <Text style={[P.txt, { flex: 1, paddingRight: 8 }]}>
                    {r.desc}
                  </Text>
                  <Text style={[P.txt, { width: 122, textAlign: "right" }]}>
                    {has ? money(currency, conv(parseFloat(r.price) || 0)) : ""}
                  </Text>
                  <View style={{ width: 122, alignItems: "flex-end" }}>
                    <Text style={P.txt}>
                      {has ? money(currency, conv(lineTotal(r))) : ""}
                    </Text>
                    {has && d > 0 ? (
                      <Text
                        style={[P.txt, { fontSize: 12, fontStyle: "italic" }]}
                      >{`less ${d}%`}</Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
            {Array.from({ length: pg.pad }).map((_, i) => (
              <View key={`e${i}`} style={[P.row, { height: ROW_MIN_H }]} />
            ))}
          </View>
        )}

        {pg.tail && (
          <View
            onLayout={(e) => {
              const h = e.nativeEvent.layout.height;
              setTailH((v) => (Math.abs(v - h) < 0.5 ? v : h));
            }}
          >
            {/* total */}
            <View
              style={{
                marginTop: 13,
                flexDirection: "row",
                justifyContent: "space-between",
                borderTopWidth: 1,
                borderTopColor: "#8ea9c1",
                borderBottomWidth: 1,
                borderBottomColor: "#d9d9d9",
                paddingVertical: 6.67,
                paddingLeft: 350,
                paddingRight: 8,
              }}
            >
              <Text style={[P.txt, { fontWeight: "700" }]}>
                TOTAL AMOUNT DUE
              </Text>
              <Text style={[P.txt, { fontWeight: "700" }]}>
                {money(currency, grandTotal)}
              </Text>
            </View>

            {/* bank details */}
            <View style={{ marginTop: 13 }}>
              <Text style={[P.txt, { fontWeight: "700" }]}>Bank Details:</Text>
              {activeFields.map((f, i) => (
                <Text key={i} style={P.txt}>
                  {`${f.label}${/^account no\.?$/i.test(f.label.trim()) ? " " : ": "}${f.value}`}
                </Text>
              ))}
            </View>

            {/* prepared by */}
            <View style={{ marginTop: 40 }}>
              <Text style={P.txt}>Prepared by:</Text>
              <View
                style={{
                  marginTop: 64,
                  width: 260,
                  borderBottomWidth: 1,
                  borderBottomColor: "#000",
                }}
              />
              <Text style={[P.txt, { marginTop: 3 }]}>{preparedBy}</Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );

  const previewColumn = (
    <View style={{ width: "100%" }}>
      <Text
        style={{
          fontFamily: "Outfit-Bold",
          fontSize: 12,
          letterSpacing: 0.9,
          textTransform: "uppercase",
          color: theme.textInactive,
          marginBottom: 10,
        }}
      >
        Live preview · A4
      </Text>
      <View
        style={{
          backgroundColor: "#8a93a0",
          borderRadius: 12,
          padding: 18,
          overflow: "hidden",
        }}
      >
        <View>{pages.map((pg, i) => renderPage(pg, i, pages.length))}</View>
      </View>
    </View>
  );

  // ── Layout ────────────────────────────────────────────────────────────────
  return (
    <View
      nativeID="stmt-root"
      style={{ flex: 1, backgroundColor: theme.surface }}
    >
      {/* top bar */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingHorizontal: 24,
          paddingVertical: 14,
          borderBottomWidth: 0.5,
          borderBottomColor: theme.navBorder,
          flexWrap: "wrap",
        }}
      >
        <View style={{ flex: 1, minWidth: 200 }}>
          <Text
            style={{
              fontFamily: "Outfit-Bold",
              fontSize: 20,
              color: theme.textActive,
            }}
          >
            Statement of Account (FPD)
          </Text>
          <Text
            style={{
              fontFamily: "Outfit",
              fontSize: 12.5,
              color: theme.textInactive,
            }}
          >
            Executive forms · fill in, then print or export
          </Text>
        </View>
        <Btn label="Saved Statements" Icon={ArrowLeft} onPress={onBack} />
        {readOnly ? (
          <>
            <View
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 8,
                backgroundColor: theme.bgHover,
                borderWidth: 1,
                borderColor: theme.navBorder,
              }}
            >
              <Text
                style={{
                  fontFamily: "Outfit-medium",
                  fontSize: 12,
                  color: theme.textInactive,
                }}
              >
                View only
              </Text>
            </View>
            {loadedNo && onEdit ? (
              <Btn label="Edit" Icon={Pencil} onPress={() => onEdit(loadedNo)} />
            ) : null}
          </>
        ) : (
          <>
            <Btn label="Clear" Icon={RotateCcw} onPress={resetAll} />
            <Btn label="Save" onPress={handleSave} />
            {loadedNo ? (
              <Btn label="Delete" Icon={Trash2} onPress={handleDelete} danger />
            ) : null}
          </>
        )}
        <Btn label="Print" Icon={Printer} onPress={handlePrint} />
        <Btn
          label="Export PDF"
          Icon={Download}
          onPress={handleExportPdf}
          primary
        />
      </View>

      {stacked ? (
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          {formColumn}
          {previewColumn}
        </ScrollView>
      ) : (
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            gap: 20,
            padding: 20,
            minHeight: 0,
          }}
        >
          <ScrollView
            style={{ width: 480, flexGrow: 0, flexShrink: 0 }}
            contentContainerStyle={{ paddingBottom: 40 }}
            showsVerticalScrollIndicator
          >
            {formColumn}
          </ScrollView>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 40 }}
            showsVerticalScrollIndicator
          >
            {previewColumn}
          </ScrollView>
        </View>
      )}

      {/* new bank template dialog */}
      {bankDialog && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(10,14,20,0.55)",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 55,
          }}
        >
          <View
            style={{
              width: 460,
              maxWidth: "92%",
              maxHeight: "90%",
              backgroundColor: theme.surface,
              borderRadius: 14,
            }}
          >
            <ScrollView contentContainerStyle={{ padding: 22 }}>
              <Text
                style={{
                  fontFamily: "Outfit-Bold",
                  fontSize: 18,
                  color: theme.textActive,
                }}
              >
                New bank template
              </Text>
              <Text
                style={{
                  fontFamily: "Outfit",
                  fontSize: 13,
                  color: theme.textInactive,
                  marginTop: 3,
                  marginBottom: 16,
                }}
              >
                Same fields as the default. It's saved and available in the list
                next time.
              </Text>
              <Field label="Template name" hint="(for the list)">
                <TextInput
                  style={S.input}
                  value={bankDraft.label}
                  onChangeText={(t) => setBankDraft({ ...bankDraft, label: t })}
                  placeholder="e.g. BDO – USD account"
                  placeholderTextColor={theme.textInactive}
                />
              </Field>
              {bankDraft.fields.map((f) => (
                <View key={f.id} style={{ marginBottom: 12 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 5,
                    }}
                  >
                    <TextInput
                      style={[
                        S.input,
                        small,
                        { flex: 1, fontFamily: "Outfit-medium" },
                      ]}
                      value={f.label}
                      onChangeText={(t) => updateDraftField(f.id, { label: t })}
                      placeholder="Label (e.g. Swift Code)"
                      placeholderTextColor={theme.textInactive}
                    />
                    <TouchableOpacity
                      onPress={() => removeDraftField(f.id)}
                      hitSlop={8}
                    >
                      <Trash2 size={16} color={theme.textInactive} />
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    style={S.input}
                    value={f.value}
                    onChangeText={(t) => updateDraftField(f.id, { value: t })}
                    placeholder="Value"
                    placeholderTextColor={theme.textInactive}
                  />
                </View>
              ))}
              <View style={{ flexDirection: "row", marginBottom: 8 }}>
                <Btn
                  label="Add detail"
                  Icon={Plus}
                  onPress={() =>
                    setBankDraft((d) => ({
                      ...d,
                      fields: [...d.fields, newBankField()],
                    }))
                  }
                  compact
                  dashed
                />
              </View>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "flex-end",
                  gap: 8,
                  marginTop: 4,
                }}
              >
                <Btn label="Cancel" onPress={() => setBankDialog(false)} />
                <Btn label="Save template" onPress={saveBankTemplate} primary />
              </View>
            </ScrollView>
          </View>
        </View>
      )}

      <ConfirmModal
        visible={saveOpen}
        variant="primary"
        title="Save changes?"
        message={`${loadedNo ?? ""} will be updated with your changes.`}
        confirmLabel="Save changes"
        busy={saving}
        error={saveError}
        onCancel={() => setSaveOpen(false)}
        onConfirm={doSave}
      />

      <ConfirmModal
        visible={deleteOpen}
        title="Delete statement?"
        message={`${loadedNo ?? ""} will be permanently removed. This can't be undone.`}
        busy={deleting}
        error={deleteError}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={runDelete}
      />

      {/* toast */}
      {toast && (
        <View
          style={{
            position: "absolute",
            right: 24,
            bottom: 24,
            maxWidth: 380,
            backgroundColor: theme.textActive,
            paddingHorizontal: 18,
            paddingVertical: 12,
            borderRadius: 10,
            zIndex: 60,
          }}
        >
          <Text
            style={{
              fontFamily: "Outfit",
              fontSize: 13.5,
              color: theme.surface,
            }}
          >
            {toast}
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Small pieces (defined OUTSIDE the page so inputs keep focus while typing) ─

// The paper always prints black-on-white in Segoe UI 10pt, regardless of app theme.
const P = {
  txt: {
    fontFamily: FONT,
    fontSize: PT10,
    color: "#000",
    lineHeight: 17,
  } as const,
  th: { fontFamily: FONT, fontSize: PT10, color: "#fff" } as const,
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6.67,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#d9d9d9",
    minHeight: 31,
  } as const,
};

function CurBadge({ c }: { c: { sym: string; color: string } }) {
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: c.color,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontFamily: "Outfit-Bold", fontSize: c.sym.length > 1 ? 7 : 11, color: "#fff" }}>
        {c.sym}
      </Text>
    </View>
  );
}

function SectionTitle({
  n,
  title,
  sub,
}: {
  n: number;
  title: string;
  sub?: string;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginBottom: 14,
      }}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 999,
          backgroundColor: theme.iconActive,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{ fontFamily: "Outfit-Bold", fontSize: 11, color: "#fff" }}
        >
          {n}
        </Text>
      </View>
      <Text
        style={{
          fontFamily: "Outfit-Bold",
          fontSize: 12,
          letterSpacing: 0.9,
          color: theme.textInactive,
          textTransform: "uppercase",
        }}
      >
        {title}
        {sub ? (
          <Text
            style={{
              fontFamily: "Outfit",
              textTransform: "none",
              letterSpacing: 0,
            }}
          >
            {"  "}
            {sub}
          </Text>
        ) : null}
      </Text>
    </View>
  );
}

function Btn({
  label,
  onPress,
  Icon,
  primary,
  dashed,
  compact,
  danger,
}: {
  label: string;
  onPress: () => void;
  Icon?: any;
  primary?: boolean;
  dashed?: boolean;
  compact?: boolean;
  danger?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        paddingHorizontal: compact ? 11 : 15,
        paddingVertical: compact ? 7 : 9,
        borderRadius: 8,
        borderWidth: 1,
        borderStyle: dashed ? "dashed" : "solid",
        borderColor: danger
          ? "#dc2626"
          : primary || dashed
            ? theme.iconActive
            : theme.navBorder,
        backgroundColor: primary ? theme.iconActive : theme.surface,
      }}
    >
      {Icon ? (
        <Icon
          size={15}
          color={
            danger
              ? "#dc2626"
              : primary
                ? "#fff"
                : dashed
                  ? theme.iconActive
                  : theme.textActive
          }
        />
      ) : null}
      <Text
        style={{
          fontFamily: "Outfit-medium",
          fontSize: compact ? 12.5 : 13.5,
          color: danger
            ? "#dc2626"
            : primary
              ? "#fff"
              : dashed
                ? theme.iconActive
                : theme.textActive,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function Chip({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: active ? theme.iconActive : theme.navBorder,
        backgroundColor: active ? theme.bgActive : theme.surface,
      }}
    >
      <Text
        style={{
          fontFamily: "Outfit-medium",
          fontSize: 12.5,
          color: active ? theme.textActive : theme.textInactive,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function Field({
  label,
  hint,
  children,
  style,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  style?: any;
}) {
  const { theme } = useTheme();
  return (
    <View style={[{ marginBottom: 12 }, style]}>
      <Text
        style={{
          fontFamily: "Outfit-medium",
          fontSize: 12,
          color: theme.textActive,
          marginBottom: 5,
        }}
      >
        {label}
        {hint ? (
          <Text style={{ fontFamily: "Outfit", color: theme.textInactive }}>
            {"  "}
            {hint}
          </Text>
        ) : null}
      </Text>
      {children}
    </View>
  );
}

// Web gets the native date picker; native platforms fall back to typing YYYY-MM-DD.
function DateInput({
  value,
  onChange,
  style,
  dark,
  accent,
}: {
  value: string;
  onChange: (v: string) => void;
  style: any;
  dark: boolean;
  accent: string;
}) {
  if (Platform.OS === "web") {
    return React.createElement("input", {
      type: "date",
      value,
      onChange: (e: any) => onChange(e.target.value),
      style: {
        fontFamily: "Outfit, sans-serif",
        fontSize: 13.5,
        border: "1px solid",
        boxSizing: "border-box",
        width: "100%",
        colorScheme: dark ? "dark" : "light",
        accentColor: accent,
        outline: "none",
        ...flattenStyle(style),
      },
    });
  }
  return (
    <TextInput
      style={style}
      value={value}
      onChangeText={onChange}
      placeholder="YYYY-MM-DD"
      keyboardType="numbers-and-punctuation"
    />
  );
}

// Flatten RN style (object | array) into a plain object for the raw <input>.
function flattenStyle(style: any): Record<string, any> {
  const flat: Record<string, any> = {};
  const walk = (s: any) => {
    if (!s) return;
    if (Array.isArray(s)) return s.forEach(walk);
    Object.assign(flat, s);
  };
  walk(style);
  const {
    paddingHorizontal,
    paddingVertical,
    borderRadius,
    borderColor,
    backgroundColor,
    color,
    width,
  } = flat;
  return {
    padding: `${paddingVertical ?? 9}px ${paddingHorizontal ?? 11}px`,
    borderRadius,
    borderColor,
    backgroundColor,
    color,
    ...(width ? { width } : {}),
  };
}