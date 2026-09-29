import { Download, Plus, Printer, RotateCcw, X } from "lucide-react-native";
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
import { ADUser } from "../../../../../types"; // adjust to your actual path
import { useTheme } from "../../../../theme/ThemeContext"; // adjust to your actual path
import AsyncStorage from "@react-native-async-storage/async-storage";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { List } from "lucide-react-native";
import SavedFormsPage from "./SavedFormsPage"; // adjust path if it lives elsewhere

/* ============================================================================
   Equipment Issuance Agreement (EIA) sign sheet
   IT side only — IT fills the form, then exports it (Word / PDF) for printing.
   ============================================================================ */

// ── Company config ──────────────────────────────────────────────────────────
// Drop the 3 PNGs in src/components/icons/ (same folder as SilvergraphLogo.png)
// and adjust the require() paths below if your folders differ.
type CompanyKey = "sgc" | "sdb" | "ocg";

type Company = {
  key: CompanyKey;
  code: string;
  short: string;
  name: string;
  logo: any;
  logoW: number;
  logoH: number;
  layout: "logo-left" | "logo-right";
  address: string[];
  formCode: string;
  rev: string;
};

const COMPANIES: Record<CompanyKey, Company> = {
  sgc: {
    key: "sgc",
    code: "SGC",
    short: "Silvergraph",
    name: "SILVERGRAPH CORPORATION",
    logo: require("../../../../components/icons/EIALogoSGC.png"),
    logoW: 74,
    logoH: 70,
    layout: "logo-left",
    address: [
      "1124 Triumph Square",
      "1618 Quezon Avenue",
      "Brgy. South Triangle",
      "District 4 1104 Quezon City",
      "info@silvergraph.ai",
    ],
    formCode: "SDB-FRM-IT-000001 Rev 0", // matches your original SGC sheet
    rev: "04-April-2023",
  },
  sdb: {
    key: "sdb",
    code: "SDB",
    short: "Silverdab",
    name: "SILVERDAB CORPORATION",
    logo: require("../../../../components/icons/EIALogoSDB.png"),
    logoW: 70,
    logoH: 74,
    layout: "logo-left",
    address: [
      "7th Floor Unit 3, Hexagon Corporate Center,",
      "1471 Quezon Ave., West Triangle,",
      "Quezon City, Philippines 1104",
      "info@silverdab.com | (2) 5322-1900",
    ],
    formCode: "SDB-FRM-IT-000001 Rev 0",
    rev: "04-April-2023",
  },
  ocg: {
    key: "ocg",
    code: "OCG",
    short: "OC Global-JV",
    name: "Oriental Consultants Global Co. Ltd",
    logo: require("../../../../components/icons/EIALogoOCG.png"),
    logoW: 130,
    logoH: 67,
    layout: "logo-left",
    address: [
      "Unit 12 - 14th Flr Triumph Square, 1618,",
      "Quezon Ave, Brgy. South Triangle,",
      "Quezon City",
    ],
    formCode: "OCG-FRM-IT-000001 Rev 0",
    rev: "04-April-2023",
  },
};

const SUPERVISOR = "Mario Natan Jr."; // fixed
const API_URL = "https://api.silvergraph.ai";
const TOKEN_KEY = "AD_AUTH_TOKEN"; // matches adAuthService.ts
const STD_REMARK =
  "All items were verified to be in good working condition upon issuance. Any catastrophic damage, including but not limited to severe physical damage, liquid damage, loss of parts, unauthorized modification, or damage caused by misuse or negligence, may be charged to the user.";
const SHORT_REMARK = "All items working good during issuance.";

// ── Types ────────────────────────────────────────────────────────────────────
type ItemRow = {
  id: string;
  qty: string;
  brand: string;
  desc: string;
  warranty: string;
  purchased: string;
};

type FormState = {
  company: CompanyKey;
  copyLabel: string;
  name: string;
  dept: string;
  date: string; // YYYY-MM-DD
  issuedNo: string;
  refNo: string;
  refAuto: boolean;
  remarks: string;
  issuedName: string;
  issuedDate: string;
  delName: string;
  delDate: string;
  supDate: string;
};

const newRow = (qty = "1"): ItemRow => ({
  id: Math.random().toString(36).slice(2, 9),
  qty,
  brand: "",
  desc: "",
  warranty: "",
  purchased: "",
});

const emptyForm = (): FormState => ({
  company: "sgc",
  copyLabel: "-Receiving Copy-",
  name: "",
  dept: "",
  date: "",
  issuedNo: "",
  refNo: "",
  refAuto: true,
  remarks: STD_REMARK,
  issuedName: "",
  issuedDate: "",
  delName: "",
  delDate: "",
  supDate: "",
});

// ── Date helpers (kept dependency-free) ─────────────────────────────────────
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const isoOk = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const fmtLong = (v: string) => {
  if (!isoOk(v)) return v; // show what they typed while still editing
  const [y, m, d] = v.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};
const fmtShort = (v: string) => {
  if (!isoOk(v)) return v;
  const [y, m, d] = v.split("-").map(Number);
  return `${m}-${d}-${String(y).slice(2)}`;
};

// ── Ref no. suggestion ──────────────────────────────────────────────────────
const suggestRef = (company: CompanyKey, date: string, issuedNo: string) => {
  const yr = isoOk(date) ? date.slice(0, 4) : String(new Date().getFullYear());
  const seq = (issuedNo.replace(/\D/g, "") || "1").padStart(6, "0");
  return `${COMPANIES[company].code}-EIA-IT-${yr}-${seq}`;
};

// ── Page ─────────────────────────────────────────────────────────────────────
type Props = { user: ADUser; initialView?: "form" | "saved" };

export default function FormsPage({ user, initialView }: Props) {
  const [view, setView] = useState<"form" | "saved">(initialView ?? "form");
  const [readOnly, setReadOnly] = useState(false);
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const stacked = width < 1100; // form above preview on narrow screens

  const [form, setForm] = useState<FormState>(emptyForm());
  const [rows, setRows] = useState<ItemRow[]>([newRow()]);
  const [exportOpen, setExportOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [rowH, setRowH] = useState<Record<string, number>>({});
  const [tailH, setTailH] = useState(0);
  const [searchRef, setSearchRef] = useState("");
  const [searching, setSearching] = useState(false);
  const [loadedRefNo, setLoadedRefNo] = useState<string | null>(null); // set once a record is loaded/saved; Save then means "update"
  const [confirmUpdateOpen, setConfirmUpdateOpen] = useState(false);

  const company = COMPANIES[form.company];

  // Is the current theme dark? Read from the surface color's brightness so this
  // works for Light / Dark / System without depending on ThemeContext internals.
  const isDarkTheme = useMemo(() => {
    const hex = String(theme.surface || "").replace("#", "");
    if (hex.length !== 6 && hex.length !== 3) return false;
    const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 < 128;
  }, [theme.surface]);

  // Web only: style every scrollbar on the page (form pane, preview pane,
  // textareas) to match the current theme. Re-runs when the theme changes.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;

    const id = "sums-themed-scrollbars";
    let el = document.getElementById(id) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = id;
      document.head.appendChild(el);
    }

    const thumb = theme.navBorder;
    const thumbHover = theme.iconInactive;
    const track = "transparent";

    el.textContent = `
      * {
        scrollbar-width: thin;
        scrollbar-color: ${thumb} ${track};
      }
      *::-webkit-scrollbar {
        width: 10px;
        height: 10px;
      }
      *::-webkit-scrollbar-track {
        background: ${track};
      }
      *::-webkit-scrollbar-thumb {
        background-color: ${thumb};
        border-radius: 999px;
        border: 2px solid transparent;
        background-clip: content-box;
      }
      *::-webkit-scrollbar-thumb:hover {
        background-color: ${thumbHover};
      }
      *::-webkit-scrollbar-corner {
        background: transparent;
      }

      /* Date inputs: native icon hidden, themed icon drawn via background-image */
      .sums-date-input::-webkit-calendar-picker-indicator {
        cursor: pointer;
        opacity: 0;
        position: absolute;
        right: 8px;
        width: 18px;
        height: 18px;
      }
      .sums-date-input:focus {
        border-color: ${theme.iconActive} !important;
      }
    `;
  }, [theme.navBorder, theme.iconInactive, theme.iconActive, isDarkTheme]);

  const PAPER_W = 794;
  const PAPER_H = 1123;



  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3400);
  };

  // Generic field setter + the small bits of "smart" behavior from the mockup.
  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    // Editing the Ref. No. itself detaches from whatever record was loaded —
    // typing a different ref means "start a new one", not "rename this one".
    if (key === "refNo" && value !== loadedRefNo) setLoadedRefNo(null);

    setForm((prev) => {
      const next = { ...prev, [key]: value };

      // Ref. No. stays auto-generated until the user types their own.
      if (key === "refNo") next.refAuto = false;
      if (
        next.refAuto &&
        (key === "company" || key === "date" || key === "issuedNo")
      ) {
        next.refNo = suggestRef(next.company, next.date, next.issuedNo);
      }

      // Picking the main Date pre-fills the 3 signature dates (still editable).
      if (key === "date" && isoOk(value as string)) {
        if (!prev.issuedDate) next.issuedDate = value as string;
        if (!prev.delDate) next.delDate = value as string;
        if (!prev.supDate) next.supDate = value as string;
      }
      return next;
    });
  };

  const updateRow = (id: string, key: keyof ItemRow, value: string) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [key]: value } : r)));

  const removeRow = (id: string) =>
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.id !== id) : [newRow("")]));

  const resetAll = () => {
    const doReset = () => {
      setForm(emptyForm());
      setRows([newRow()]);
    };
    if (Platform.OS === "web" && typeof window !== "undefined") {
      if (window.confirm("Clear the whole form?")) doReset();
    } else {
      doReset();
    }
  };

  const handleLoadByRef = async () => {
    const refNo = searchRef.trim();
    if (!refNo) {
      showToast("Enter a Ref. No. to search.");
      return;
    }
    await loadRefNo(refNo);
  };

  const loadRefNo = async (refNo: string) => {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) {
      showToast("Your session has expired. Please log in again.");
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`${API_URL}/it/eia-sign-sheets/${encodeURIComponent(refNo)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 404) {
        showToast(`No record found for "${refNo}".`);
        return;
      }
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${detail.slice(0, 120)}`);
      }
      const data = await res.json();
      const s = data.sheet;

      const toIso = (v: any) => {
        if (!v) return "";
        const str = String(v);
        return str.length >= 10 ? str.slice(0, 10) : str;
      };

      setForm({
        company: (s.company as CompanyKey) || "sgc",
        copyLabel: s.copyLabel ?? "",
        name: s.name ?? "",
        dept: s.department ?? "",
        date: toIso(s.date),
        issuedNo: s.issuedNo ?? "",
        refNo: s.refNo,
        refAuto: false,
        remarks: s.remarks ?? "",
        issuedName: s.issuedTo?.name ?? "",
        issuedDate: toIso(s.issuedTo?.date),
        delName: s.deliveredBy?.name ?? "",
        delDate: toIso(s.deliveredBy?.date),
        supDate: toIso(s.approvedBy?.date),
      });
      setRows(
        Array.isArray(s.items) && s.items.length > 0
          ? s.items.map((it: any) => ({
              id: Math.random().toString(36).slice(2, 9),
              qty: it.qty ?? "1",
              brand: it.brand ?? "",
              desc: it.desc ?? "",
              warranty: it.warranty ?? "",
              purchased: toIso(it.purchased),
            }))
          : [newRow()],
      );
      setLoadedRefNo(s.refNo);
      showToast(`Loaded ${s.refNo}.`);
    } catch (e: any) {
      showToast(`Load failed: ${e.message}`);
    } finally {
      setSearching(false);
    }
  };

  const goToSaved = () => setView("saved");

  const handleViewFromSaved = async (refNo: string) => {
    setReadOnly(true);
    setSearchRef(refNo);
    await loadRefNo(refNo);
    setView("form");
  };

  const handleEditFromSaved = async (refNo: string) => {
    setReadOnly(false);
    setSearchRef(refNo);
    await loadRefNo(refNo);
    setView("form");
  };

  const handleNewForm = () => {
    console.log("handleNewForm fired");
    setForm(emptyForm());
    setRows([newRow()]);
    setLoadedRefNo(null);
    setSearchRef("");
    setReadOnly(false);
    setView("form");
  };

  const filledRows = useMemo(
    () => rows.filter((r) => [r.qty, r.brand, r.desc, r.warranty, r.purchased].some((v) => v.trim())),
    [rows],
  );

  // Data payload for the (future) export endpoint.
  const buildPayload = () => ({
    company: form.company,
    copyLabel: form.copyLabel,
    name: form.name,
    department: form.dept,
    date: form.date,
    issuedNo: form.issuedNo,
    refNo: form.refNo,
    items: filledRows.map(({ id, ...rest }) => rest),
    remarks: form.remarks,
    issuedTo: { name: form.issuedName || form.name, date: form.issuedDate },
    deliveredBy: { name: form.delName, date: form.delDate },
    approvedBy: { name: SUPERVISOR, date: form.supDate },
    preparedBy: user.username,
  });

  const handleExportPdf = async () => {
    if (Platform.OS !== "web" || typeof document === "undefined") {
      showToast("PDF export is available on the web version.");
      return;
    }
    const nodes = Array.from(document.querySelectorAll('[id^="eia-inner-"]')) as HTMLElement[];
    if (!nodes.length) return;

    // Each page has a preview-scale transform for on-screen display — drop it
    // temporarily so html2canvas captures the page at its true 794×1123 size.
    const prevTransforms = nodes.map((n) => n.style.transform);
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
        const imgData = canvas.toDataURL("image/jpeg", 0.95);
        if (i > 0) pdf.addPage([PAPER_W, PAPER_H]);
        pdf.addImage(imgData, "JPEG", 0, 0, PAPER_W, PAPER_H);
      }
      const fn = `${form.refNo || "EIA"}_${form.name || "Employee"}.pdf`;
      pdf.save(fn);
    } catch (e: any) {
      showToast(`PDF export failed: ${e.message}`);
    } finally {
      nodes.forEach((n, i) => {
        n.style.transform = prevTransforms[i];
      });
    }
  };

  const handleSaveClick = () => {
    if (!form.refNo.trim()) {
      showToast("Ref. No. is required before saving.");
      return;
    }
    // A record with this Ref. No. is already loaded — saving now means
    // overwriting it, so confirm before doing that.
    if (loadedRefNo && loadedRefNo === form.refNo.trim()) {
      setConfirmUpdateOpen(true);
      return;
    }
    doSaveOrCreate();
  };

  const doSaveOrCreate = async () => {
    setConfirmUpdateOpen(false);
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) {
      showToast("Your session has expired. Please log in again.");
      return;
    }
    const isUpdate = !!loadedRefNo && loadedRefNo === form.refNo.trim();
    try {
      const res = await fetch(
        isUpdate
          ? `${API_URL}/it/eia-sign-sheets/${encodeURIComponent(form.refNo.trim())}`
          : `${API_URL}/it/eia-sign-sheets`,
        {
          method: isUpdate ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(buildPayload()),
        },
      );
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${detail.slice(0, 120)}`);
      }
      if (!isUpdate) {
        const data = await res.json();
        setLoadedRefNo(form.refNo.trim());
        showToast(data.alreadySaved ? "Already saved." : "Saved.");
      } else {
        showToast("Updated.");
      }
    } catch (e: any) {
      showToast(`Save failed: ${e.message}`);
    }
  };

  const saveEiaRecord = async (): Promise<void> => {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) return; // export can still proceed; saving is best-effort
    const isUpdate = !!loadedRefNo && loadedRefNo === form.refNo.trim();
    try {
      const res = await fetch(
        isUpdate
          ? `${API_URL}/it/eia-sign-sheets/${encodeURIComponent(form.refNo.trim())}`
          : `${API_URL}/it/eia-sign-sheets`,
        {
          method: isUpdate ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(buildPayload()),
        },
      );
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        console.warn("EIA record save failed:", res.status, detail);
        return;
      }
      if (!isUpdate) setLoadedRefNo(form.refNo.trim());
    } catch (err) {
      console.warn("EIA record save failed:", err);
    }
  };

  const handleExport = async (format: "docx" | "pdf") => {
    setExportOpen(false);

    if (!form.refNo.trim()) {
      showToast("Ref. No. is required before exporting.");
      return;
    }
    await saveEiaRecord();

    if (format === "pdf") {
      await handleExportPdf();
      return;
    }

    if (Platform.OS !== "web") {
      showToast("Export is available on the web version.");
      return;
    }
    try {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      if (!token) {
        showToast("Your session has expired. Please log in again.");
        return;
      }
      const res = await fetch(`${API_URL}/api/it/eia/export`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(buildPayload()),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${detail.slice(0, 120)}`);
      }
      const blob = await res.blob();
      const fn = `${form.refNo || "EIA"}_${form.name || "Employee"}.docx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fn;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      showToast(`Export failed: ${e.message}`);
    }
  };

  const handlePrint = () => {
    if (Platform.OS !== "web" || typeof document === "undefined") {
      showToast("Printing is available on the web version.");
      return;
    }
    const nodes = Array.from(document.querySelectorAll('[id^="eia-page-"]')) as HTMLElement[];
    if (!nodes.length) return;

    // react-native-web injects styles through the CSSOM, so read the rules
    // directly instead of copying <style> tags.
    let css = "";
    let links = "";
    Array.from(document.styleSheets).forEach((s) => {
      try {
        css += Array.from(s.cssRules).map((r) => r.cssText).join("\n") + "\n";
      } catch {
        if (s.href) links += `<link rel="stylesheet" href="${s.href}">`; // cross-origin (e.g. Google Fonts)
      }
    });

    const printCss = `
      @page { size: A4; margin: 0; }
      html, body { margin: 0 !important; padding: 0 !important; height: auto !important;
                   overflow: visible !important; display: block !important; background: #fff !important; }
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      [id^="eia-page-"] { width: 794px !important; height: 1122px !important; margin: 0 !important;
                          overflow: hidden !important; position: relative;
                          break-after: page; page-break-after: always; }
      [id^="eia-page-"]:last-child { break-after: auto; page-break-after: auto; }
      [id^="eia-inner-"] { transform: none !important; box-shadow: none !important; }
    `;

    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;";
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
    // wait for fonts and logos to load before printing
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
    label: {
      fontFamily: "Outfit-medium",
      fontSize: 12,
      color: theme.textActive,
      marginBottom: 5,
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



  const SectionTitle = ({ n, title, sub }: { n: number; title: string; sub?: string }) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 }}>
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
        <Text style={{ fontFamily: "Outfit-Bold", fontSize: 11, color: "#fff" }}>{n}</Text>
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
          <Text style={{ fontFamily: "Outfit", textTransform: "none", letterSpacing: 0 }}>
            {"  "}
            {sub}
          </Text>
        ) : null}
      </Text>
    </View>
  );

  const Btn = ({
    label,
    onPress,
    Icon,
    primary,
    small,
    dashed,
  }: {
    label: string;
    onPress: () => void;
    Icon?: any;
    primary?: boolean;
    small?: boolean;
    dashed?: boolean;
  }) => (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        paddingHorizontal: small ? 11 : 15,
        paddingVertical: small ? 7 : 9,
        borderRadius: 8,
        borderWidth: 1,
        borderStyle: dashed ? "dashed" : "solid",
        borderColor: primary ? theme.iconActive : dashed ? theme.iconActive : theme.navBorder,
        backgroundColor: primary ? theme.iconActive : theme.surface,
      }}
    >
      {Icon ? <Icon size={15} color={primary ? "#fff" : dashed ? theme.iconActive : theme.textActive} /> : null}
      <Text
        style={{
          fontFamily: "Outfit-medium",
          fontSize: small ? 12.5 : 13.5,
          color: primary ? "#fff" : dashed ? theme.iconActive : theme.textActive,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  const Chip = ({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) => (
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

  // ── FORM COLUMN ───────────────────────────────────────────────────────────
  const formColumn = (
    <View style={{ flex: stacked ? undefined : 1, minWidth: 340, maxWidth: stacked ? undefined : 480, width: stacked ? "100%" : undefined }}>
      {/* 1. Company */}
      <View style={S.card}>
        <SectionTitle n={1} title="Company" sub="(decides the header)" />
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
          {(Object.values(COMPANIES) as Company[]).map((c) => {
            const active = c.key === form.company;
            return (
              <TouchableOpacity
                key={c.key}
                activeOpacity={0.8}
                onPress={() => setField("company", c.key)}
                style={{
                  flex: 1,
                  alignItems: "center",
                  paddingVertical: 10,
                  borderRadius: 10,
                  borderWidth: 2,
                  borderColor: active ? theme.iconActive : theme.navBorder,
                  backgroundColor: active ? theme.bgActive : theme.surface,
                }}
              >
                <View style={{ height: 42, justifyContent: "center", marginBottom: 6 }}>
                  <Image source={c.logo} style={{ width: 56, height: 40 }} resizeMode="contain" />
                </View>
                <Text style={{ fontFamily: "Outfit-Bold", fontSize: 11, color: theme.textActive }}>
                  {c.short}
                </Text>
                <Text style={{ fontFamily: "Outfit", fontSize: 10.5, color: theme.textInactive }}>
                  {c.code}-EIA-IT
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Field label="Copy label" hint="(printed under the title)">
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {["", "-Receiving Copy-", "-IT Copy-"].map((l) => (
              <Chip
                key={l || "none"}
                active={form.copyLabel === l}
                label={l || "None"}
                onPress={() => setField("copyLabel", l)}
              />
            ))}
          </View>
        </Field>
      </View>

      {/* 2. Employee details */}
      <View style={S.card}>
        <SectionTitle n={2} title="Employee details" />
        <Field label="Name">
          <TextInput
            style={S.input}
            value={form.name}
            onChangeText={(t) => setField("name", t)}
            placeholder="FirstName LastName"
            placeholderTextColor={theme.textInactive}
          />
        </Field>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Field label="Department" style={{ flex: 1 }}>
            <TextInput
              style={S.input}
              value={form.dept}
              onChangeText={(t) => setField("dept", t)}
              placeholder="e.g. BIM"
              placeholderTextColor={theme.textInactive}
            />
          </Field>
          <Field label="Date" hint="YYYY-MM-DD" style={{ flex: 1 }}>
            <DateInput
              value={form.date}
              onChange={(v) => setField("date", v)}
              style={S.input}
              placeholderColor={theme.textInactive}
            />
          </Field>
        </View>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Field label="Issued No." style={{ flex: 1 }}>
            <TextInput
              style={S.input}
              value={form.issuedNo}
              onChangeText={(t) => setField("issuedNo", t)}
              placeholder="0002"
              placeholderTextColor={theme.textInactive}
            />
          </Field>
          <Field label="Ref. No." style={{ flex: 1.6 }}>
            <TextInput
              style={S.input}
              value={form.refNo}
              onChangeText={(t) => setField("refNo", t)}
              placeholder="SGC-EIA-IT-2026-000002"
              placeholderTextColor={theme.textInactive}
            />
          </Field>
        </View>
        <Text style={{ fontFamily: "Outfit", fontSize: 11.5, color: theme.textInactive, lineHeight: 16 }}>
          Ref. No. is suggested as {company.code}-EIA-IT-YEAR-###### — you can overwrite it.
        </Text>
      </View>

      {/* 3. Items */}
      <View style={S.card}>
        <SectionTitle n={3} title="Equipment issued" />
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
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <Text style={{ fontFamily: "Outfit-Bold", fontSize: 11, color: theme.iconActive }}>
                ITEM #{i + 1}
              </Text>
              <TouchableOpacity onPress={() => removeRow(r.id)} hitSlop={8}>
                <X size={16} color={theme.textInactive} />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ width: 60 }}>
                <Text style={miniLabel(theme)}>QTY</Text>
                <TextInput
                  style={[S.input, { paddingVertical: 7, fontSize: 13 }]}
                  value={r.qty}
                  onChangeText={(t) => updateRow(r.id, "qty", t)}
                  placeholder="1"
                  placeholderTextColor={theme.textInactive}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={miniLabel(theme)}>BRAND / MODEL</Text>
                <TextInput
                  style={[S.input, { paddingVertical: 7, fontSize: 13 }]}
                  value={r.brand}
                  onChangeText={(t) => updateRow(r.id, "brand", t)}
                  placeholder="e.g. Lenovo P3 System Unit"
                  placeholderTextColor={theme.textInactive}
                />
              </View>
            </View>

            <View style={{ marginTop: 8 }}>
              <Text style={miniLabel(theme)}>DESCRIPTION (asset tag, serial no., etc.)</Text>
              <TextInput
                style={[S.input, { paddingVertical: 7, fontSize: 13, minHeight: 56, textAlignVertical: "top" }]}
                value={r.desc}
                onChangeText={(t) => updateRow(r.id, "desc", t)}
                placeholder={"Asset Tag: …\nSerial: …"}
                placeholderTextColor={theme.textInactive}
                multiline
              />
            </View>

            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={miniLabel(theme)}>WARRANTY</Text>
                <TextInput
                  style={[S.input, { paddingVertical: 7, fontSize: 13 }]}
                  value={r.warranty}
                  onChangeText={(t) => updateRow(r.id, "warranty", t)}
                  placeholder="-"
                  placeholderTextColor={theme.textInactive}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={miniLabel(theme)}>DATE PURCHASED</Text>
                <DateInput
                  value={r.purchased}
                  onChange={(v) => updateRow(r.id, "purchased", v)}
                  style={[S.input, { paddingVertical: 7, fontSize: 13 }]}
                  placeholderColor={theme.textInactive}
                />
              </View>
            </View>
          </View>
        ))}
        <View style={{ flexDirection: "row" }}>
          <Btn label="Add row" Icon={Plus} onPress={() => setRows((rs) => [...rs, newRow()])} small dashed />
        </View>
      </View>

      {/* 4. Remarks */}
      <View style={S.card}>
        <SectionTitle n={4} title="Remarks" />
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <Chip
            active={form.remarks === STD_REMARK}
            label="Standard (damage clause)"
            onPress={() => setField("remarks", STD_REMARK)}
          />
          <Chip
            active={form.remarks === SHORT_REMARK}
            label="Working good"
            onPress={() => setField("remarks", SHORT_REMARK)}
          />
        </View>
        <TextInput
          style={[S.input, { minHeight: 84, textAlignVertical: "top" }]}
          value={form.remarks}
          onChangeText={(t) => setField("remarks", t)}
          multiline
          placeholder="Remarks"
          placeholderTextColor={theme.textInactive}
        />
      </View>

      {/* 5. Signatories */}
      <View style={S.card}>
        <SectionTitle n={5} title="Signatories" />

        <Field label="Issued to" hint="— signature over printed name">
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TextInput
              style={[S.input, { flex: 1 }]}
              value={form.issuedName}
              onChangeText={(t) => setField("issuedName", t)}
              placeholder="Auto-fills from Name above"
              placeholderTextColor={theme.textInactive}
            />
            <DateInput
              value={form.issuedDate}
              onChange={(v) => setField("issuedDate", v)}
              style={[S.input, { width: 118 }]}
              placeholderColor={theme.textInactive}
            />
          </View>
        </Field>

        <Field label="Delivered by" hint="— IT Support">
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TextInput
              style={[S.input, { flex: 1 }]}
              value={form.delName}
              onChangeText={(t) => setField("delName", t)}
              placeholder="FirstName LastName"
              placeholderTextColor={theme.textInactive}
            />
            <DateInput
              value={form.delDate}
              onChange={(v) => setField("delDate", v)}
              style={[S.input, { width: 118 }]}
              placeholderColor={theme.textInactive}
            />
          </View>
        </Field>

        <Field label="Approved by" hint="— IT Supervisor (fixed)">
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TextInput
              style={[S.input, { flex: 1, backgroundColor: theme.bgHover, color: theme.textInactive }]}
              value={SUPERVISOR}
              editable={false}
            />
            <DateInput
              value={form.supDate}
              onChange={(v) => setField("supDate", v)}
              style={[S.input, { width: 118 }]}
              placeholderColor={theme.textInactive}
            />
          </View>
        </Field>
        <Text style={{ fontFamily: "Outfit", fontSize: 11.5, color: theme.textInactive }}>
          Leave a date blank to print an empty line for wet-ink signing.
        </Text>
      </View>
    </View>
  );

  // ── PREVIEW COLUMN (A4 paper, 794 x 1123 px like the mockup) ───────────────
  // Wide layout: 20px page padding x2 + 480px form + 20px gap + 36px paper-frame padding
  const previewScale = stacked
    ? Math.min(1, (width - 40 - 36) / PAPER_W)
    : Math.min(1, (width - 40 - 480 - 20 - 36) / PAPER_W);
  const scale = Math.max(0.4, previewScale);

  const ul = (text: string, extra?: any) => (
    <View style={[{ flex: 1, borderBottomWidth: 1, borderBottomColor: "#000", minHeight: 19, paddingHorizontal: 4, justifyContent: "flex-end" }, extra]}>
      <Text style={[P.txt, { fontSize: 14.5 }]} numberOfLines={1}>{text}</Text>
    </View>
  );

  const logoEl = (
    <Image source={company.logo} style={{ width: company.logoW, height: company.logoH }} resizeMode="contain" />
  );
  const textEl = (
    <View style={{ flex: 1, alignItems: company.layout === "logo-left" ? "flex-end" : "flex-start", marginTop: company.layout === "logo-left" ? 6 : 16 }}>
      <Text style={[P.txt, { fontFamily: "Outfit-Bold", fontSize: 15 }]}>{company.name}</Text>
      {company.address.map((a, i) => (
        <Text key={i} style={[P.txt, { fontSize: 13, lineHeight: 17 }]}>{a}</Text>
      ))}
    </View>
  );

  // ── Pagination (estimated heights, in paper px) ───────────────────────────
  const HEADER_H = 118;
  const BOTTOM_MARGIN = 60; // blank space kept above the footer on every page
  const PAGE_TOP = 48 + HEADER_H;
  const PAGE_LIMIT = PAPER_H - BOTTOM_MARGIN;
  const FIRST_BLOCK_H = 168; // title + copy label + meta fields
  const TABLE_HEAD_H = 30;
  const ROW_MIN_H = 30;
  const SIG_H = 250; // both signature rows

  type PageDef = { rows: ItemRow[]; first: boolean; tail: boolean; pad: number };

  const lineCount = (text: string, cpl: number) =>
    (text || "").split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.length / cpl)), 0);

  const rowHeight = (r: ItemRow) => {
    const lines = Math.max(
      lineCount(r.desc, 36),
      lineCount(r.brand, 19),
      lineCount(r.warranty, 15),
      lineCount(r.purchased, 16),
    );
    return rowH[r.id] ?? Math.max(ROW_MIN_H, lines * 17 + 9);
  };

  const pages = useMemo<PageDef[]>(() => {
    const pad = Math.max(0, 5 - filledRows.length);
    const out: PageDef[] = [{ rows: [], first: true, tail: false, pad }];
    let cur = out[0];
    let y = PAGE_TOP + FIRST_BLOCK_H + TABLE_HEAD_H;

    filledRows.forEach((r) => {
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

    // remarks + signatures are kept together
    const tailEst = Math.max(80, 22 + 36 + lineCount(form.remarks, 100) * 20) + 236;
    const tailNeed = tailH || tailEst;
    if (y + tailNeed <= PAGE_LIMIT) cur.tail = true;
    else out.push({ rows: [], first: false, tail: true, pad: 0 });

    return out;
  }, [filledRows, form.remarks, rowH, tailH]);

  const renderPage = (pg: PageDef, pageIdx: number, total: number) => (
    <View
      key={pageIdx}
      nativeID={`eia-page-${pageIdx}`}
      style={{
        width: PAPER_W * scale,
        height: PAPER_H * scale,
        alignSelf: "center",
        marginBottom: pageIdx < total - 1 ? 18 : 0,
      }}
    >
      <View
        nativeID={`eia-inner-${pageIdx}`}
        style={{
          width: PAPER_W,
          height: PAPER_H,
          backgroundColor: "#fff",
          paddingTop: 48,
          paddingRight: 54,
          paddingBottom: 30,
          paddingLeft: 54,
          transform: [{ scale }],
          transformOrigin: "top left" as any,
          ...(Platform.OS === "web" ? ({ boxShadow: "0 6px 30px rgba(0,0,0,.35)" } as any) : {}),
        }}
      >
        {/* header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 10,
            minHeight: HEADER_H,
            paddingBottom: 10,
            borderBottomWidth: 1.6,
            borderBottomColor: "#000",
          }}
        >
          {company.layout === "logo-left" ? (
            <>
              {logoEl}
              {textEl}
            </>
          ) : (
            <>
              {textEl}
              {logoEl}
            </>
          )}
        </View>

        {pg.first && (
        <>
        {/* title */}
        <View style={{ marginTop: 14, marginBottom: 6, borderWidth: 1.4, borderColor: "#000", backgroundColor: "#d9d9d9", paddingVertical: 5, alignItems: "center" }}>
          <Text style={[P.txt, { fontFamily: "Outfit-Bold", fontSize: 15 }]}>EQUIPMENT ISSUANCE AGREEMENT SIGN SHEET</Text>
        </View>
        <Text style={[P.txt, { fontStyle: "italic", fontSize: 13.5, minHeight: 18, marginBottom: 6 }]}>{form.copyLabel}</Text>

        {/* meta */}
        <View style={{ marginTop: 8, marginBottom: 14, gap: 3 }}>
          <View style={{ flexDirection: "row", gap: 24 }}>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "flex-end" }}>
              <Text style={[P.txt, { width: 88, fontSize: 14.5 }]}>Name:</Text>
              {ul(form.name)}
            </View>
            <View style={{ width: 250, flexDirection: "row", alignItems: "flex-end" }}>
              <Text style={[P.txt, { width: 62, fontSize: 14.5 }]}>Date:</Text>
              {ul(fmtLong(form.date))}
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 24 }}>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "flex-end" }}>
              <Text style={[P.txt, { width: 88, fontSize: 14.5 }]}>Department:</Text>
              {ul(form.dept)}
            </View>
            <View style={{ width: 250, flexDirection: "row", alignItems: "flex-end" }}>
              <Text style={[P.txt, { width: 62, fontSize: 14.5 }]}>Ref. No.:</Text>
              {ul(form.refNo)}
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 24 }}>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "flex-end" }}>
              <Text style={[P.txt, { width: 88, fontSize: 14.5 }]}>Issued No.:</Text>
              {ul(form.issuedNo)}
            </View>
            <View style={{ width: 250 }} />
          </View>
        </View>

        </>
        )}

        {/* table */}
        {(pg.rows.length > 0 || pg.first) && (
        <View style={{ borderTopWidth: 1, borderLeftWidth: 1, borderColor: "#000" }}>
          <View style={{ flexDirection: "row", backgroundColor: "#d9d9d9" }}>
            {[
              ["Qty.", 52],
              ["Brand / Model", 150],
              ["Description", undefined],
              ["Warranty", 110],
              ["Date Purchase", 118],
            ].map(([h, w], i) => (
              <View key={i} style={[P.cell, { width: w as any, flex: w ? undefined : 1, paddingVertical: 6 }]}>
                <Text style={[P.txt, { fontFamily: "Outfit-Bold", fontSize: 13.5, textAlign: "center" }]}>{h as string}</Text>
              </View>
            ))}
          </View>
          {pg.rows.map((r) => (
            <View
              key={r.id}
              onLayout={(e) => {
                const h = e.nativeEvent.layout.height;
                setRowH((m) => (Math.abs((m[r.id] ?? 0) - h) < 0.5 ? m : { ...m, [r.id]: h }));
              }}
              style={{ flexDirection: "row", minHeight: 30 }}
            >
              <View style={[P.cell, { width: 52 }]}><Text style={P.cellTxt}>{r.qty}</Text></View>
              <View style={[P.cell, { width: 150 }]}><Text style={P.cellTxt}>{r.brand}</Text></View>
              <View style={[P.cell, { flex: 1 }]}><Text style={P.cellTxt}>{r.desc}</Text></View>
              <View style={[P.cell, { width: 110 }]}><Text style={P.cellTxt}>{r.warranty}</Text></View>
              <View style={[P.cell, { width: 118 }]}><Text style={P.cellTxt}>{fmtShort(r.purchased)}</Text></View>
            </View>
          ))}
          {Array.from({ length: pg.pad }).map((_, i) => (
            <View key={`e${i}`} style={{ flexDirection: "row", height: 30 }}>
              <View style={[P.cell, { width: 52 }]} />
              <View style={[P.cell, { width: 150 }]} />
              <View style={[P.cell, { flex: 1 }]} />
              <View style={[P.cell, { width: 110 }]} />
              <View style={[P.cell, { width: 118 }]} />
            </View>
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
        {/* remarks */}
        <View style={{ marginTop: 22, borderWidth: 1.4, borderColor: "#000", paddingTop: 7, paddingHorizontal: 10, paddingBottom: 9, minHeight: 78 }}>
          <Text style={[P.txt, { fontFamily: "Outfit-Bold", fontSize: 14.5, marginBottom: 8 }]}>Remarks:</Text>
          <Text style={[P.txt, { fontSize: 14.5, lineHeight: 20 }]}>{form.remarks}</Text>
        </View>

        {/* signatures */}
        <View style={{ marginTop: 26, flexDirection: "row", gap: 26 }}>
          <SigBlock label="Issued to:" name={form.issuedName || form.name} date={fmtShort(form.issuedDate)} cap="Signature Over Printed Name" />
          <SigBlock label="Delivered by:" name={form.delName} date={fmtShort(form.delDate)} cap="IT Support" />
        </View>
        <View style={{ marginTop: 24, width: "50%", paddingRight: 13 }}>
          <SigBlock label="Approved by:" name={SUPERVISOR} date={fmtShort(form.supDate)} cap="IT Supervisor" />
        </View>

        </View>
        )}

        {/* footer */}
        <View style={{ position: "absolute", left: 54, bottom: 22 }}>
          <Text style={[P.txt, { fontSize: 9.5, lineHeight: 12 }]}>{company.formCode}</Text>
          <Text style={[P.txt, { fontSize: 9.5, lineHeight: 12 }]}>{company.rev}</Text>
        </View>
        <Text style={{ position: "absolute", right: 54, bottom: 38, fontFamily: "Outfit", fontSize: 9, color: "#888", letterSpacing: 2 }}>
          {pageIdx + 1} | {total}
        </Text>
      </View>
    </View>
  );

  const paper = (
    <View>{pages.map((pg, i) => renderPage(pg, i, pages.length))}</View>
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
      <View style={{ backgroundColor: "#8a93a0", borderRadius: 12, padding: 18, overflow: "hidden" }}>{paper}</View>
    </View>
  );

  // ── Layout ────────────────────────────────────────────────────────────────
  if (view === "saved") {
    return (
      <SavedFormsPage
        user={user}
        onBack={() => setView("form")}
        onView={handleViewFromSaved}
        onEdit={handleEditFromSaved}
        onNew={handleNewForm}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.surface }}>
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
          <Text style={{ fontFamily: "Outfit-Bold", fontSize: 20, color: theme.textActive }}>Forms</Text>
          <Text style={{ fontFamily: "Outfit", fontSize: 12.5, color: theme.textInactive }}>
            Equipment Issuance Agreement · fill in, then export for printing
          </Text>
        </View>
        <Btn label="Saved Forms" Icon={List} onPress={goToSaved} />
        {readOnly ? (
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
            <Text style={{ fontFamily: "Outfit-medium", fontSize: 12, color: theme.textInactive }}>
              View only
            </Text>
          </View>
        ) : (
          <>
            <Btn label="Clear" Icon={RotateCcw} onPress={resetAll} />
            <Btn label="Save" onPress={handleSaveClick} />
          </>
        )}
        <Btn label="Print" Icon={Printer} onPress={handlePrint} />
        <Btn label="Export…" Icon={Download} onPress={() => setExportOpen(true)} primary />
      </View>

      {stacked ? (
        // Narrow screens: one column, one scroll (form on top, preview below).
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          {formColumn}
          {previewColumn}
        </ScrollView>
      ) : (
        // Wide screens: two independent scroll areas side by side, so the
        // live preview stays visible while you scroll through the form.
        <View style={{ flex: 1, flexDirection: "row", gap: 20, padding: 20, minHeight: 0 }}>
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

      {/* confirm update dialog */}
      {confirmUpdateOpen && (
        <View
          style={{
            position: "absolute",
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: "rgba(10,14,20,0.55)",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 55,
          }}
        >
          <View style={{ width: 380, maxWidth: "92%", backgroundColor: theme.surface, borderRadius: 14, padding: 22 }}>
            <Text style={{ fontFamily: "Outfit-Bold", fontSize: 18, color: theme.textActive }}>Update this record?</Text>
            <Text style={{ fontFamily: "Outfit", fontSize: 13, color: theme.textInactive, marginTop: 8, marginBottom: 20, lineHeight: 19 }}>
              A saved record for {form.refNo} already exists. Saving now will overwrite its details. This can't be undone.
            </Text>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
              <Btn label="Cancel" onPress={() => setConfirmUpdateOpen(false)} />
              <Btn label="Update" onPress={doSaveOrCreate} primary />
            </View>
          </View>
        </View>
      )}

      {/* export dialog */}
      {exportOpen && (
        <View
          style={{
            position: "absolute",
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: "rgba(10,14,20,0.55)",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
        >
          <View style={{ width: 380, maxWidth: "92%", backgroundColor: theme.surface, borderRadius: 14, padding: 22 }}>
            <Text style={{ fontFamily: "Outfit-Bold", fontSize: 18, color: theme.textActive }}>Export sign sheet</Text>
            <Text style={{ fontFamily: "Outfit", fontSize: 13, color: theme.textInactive, marginTop: 3, marginBottom: 16 }}>
              Header: {company.name}
            </Text>
            <TouchableOpacity
              onPress={() => handleExport("docx")}
              activeOpacity={0.8}
              style={{ borderWidth: 1, borderColor: theme.navBorder, borderRadius: 9, padding: 12, marginBottom: 8 }}
            >
              <Text style={{ fontFamily: "Outfit-Bold", fontSize: 14, color: theme.textActive }}>Word (.docx)</Text>
              <Text style={{ fontFamily: "Outfit", fontSize: 12, color: theme.textInactive }}>Editable, same layout as the existing sheets</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleExport("pdf")}
              activeOpacity={0.8}
              style={{ borderWidth: 1, borderColor: theme.navBorder, borderRadius: 9, padding: 12 }}
            >
              <Text style={{ fontFamily: "Outfit-Bold", fontSize: 14, color: theme.textActive }}>PDF (.pdf)</Text>
              <Text style={{ fontFamily: "Outfit", fontSize: 12, color: theme.textInactive }}>Ready to print or send</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 16 }}>
              <Btn label="Cancel" onPress={() => setExportOpen(false)} />
            </View>
          </View>
        </View>
      )}

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
          <Text style={{ fontFamily: "Outfit", fontSize: 13.5, color: theme.surface }}>{toast}</Text>
        </View>
      )}
    </View>
  );
}

// ── Small pieces ─────────────────────────────────────────────────────────────

// The paper always prints black-on-white, regardless of the app theme.
const P = {
  txt: { fontFamily: "Outfit", color: "#000" } as const,
  cell: {
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#000",
    paddingHorizontal: 6,
    paddingVertical: 4,
    justifyContent: "center",
  } as const,
  cellTxt: { fontFamily: "Outfit", fontSize: 13.5, color: "#000", textAlign: "center" } as const,
};

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

const miniLabel = (theme: any) =>
  ({
    fontFamily: "Outfit-Bold",
    fontSize: 10,
    letterSpacing: 0.6,
    color: theme.textInactive,
    marginBottom: 3,
  }) as const;

function SigBlock({
  label,
  name,
  date,
  cap,
}: {
  label: string;
  name: string;
  date: string;
  cap: string;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[P.txt, { fontSize: 14.5 }]}>{label}</Text>
      <View style={{ marginTop: 38, flexDirection: "row", gap: 14 }}>
        <View style={{ flex: 1, borderBottomWidth: 1, borderBottomColor: "#000", minHeight: 20, alignItems: "center", justifyContent: "flex-end" }}>
          <Text style={[P.txt, { fontSize: 14.5 }]} numberOfLines={1}>{name}</Text>
        </View>
        <View style={{ width: 96, borderBottomWidth: 1, borderBottomColor: "#000", minHeight: 20, alignItems: "center", justifyContent: "flex-end" }}>
          <Text style={[P.txt, { fontSize: 14.5 }]} numberOfLines={1}>{date}</Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 14 }}>
        <Text style={[P.txt, { flex: 1, textAlign: "center", fontSize: 14 }]}>{cap}</Text>
        <Text style={[P.txt, { width: 96, textAlign: "center", fontSize: 14 }]}>Date</Text>
      </View>
    </View>
  );
}

// Web gets the native date picker; native platforms fall back to typing YYYY-MM-DD.
function DateInput({
  value,
  onChange,
  style,
  placeholderColor,
}: {
  value: string;
  onChange: (v: string) => void;
  style: any;
  placeholderColor: string;
}) {
  const { theme } = useTheme();

  // Same brightness check as the page, so the popup calendar matches the theme.
  const hex = String(theme.surface || "").replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  const brightness =
    full.length === 6
      ? (parseInt(full.slice(0, 2), 16) * 299 +
          parseInt(full.slice(2, 4), 16) * 587 +
          parseInt(full.slice(4, 6), 16) * 114) /
        1000
      : 255;
  const dark = 128 > brightness;

  if (Platform.OS === "web") {
    const iconColor = encodeURIComponent(theme.iconActive || "#3b82f6");
    const iconSvg =
      `data:image/svg+xml,` +
      `%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' ` +
      `stroke='${iconColor}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E` +
      `%3Crect x='3' y='4' width='18' height='18' rx='2'/%3E` +
      `%3Cline x1='16' y1='2' x2='16' y2='6'/%3E` +
      `%3Cline x1='8' y1='2' x2='8' y2='6'/%3E` +
      `%3Cline x1='3' y1='10' x2='21' y2='10'/%3E%3C/svg%3E`;

    return React.createElement("input", {
      type: "date",
      className: "sums-date-input",
      value,
      onChange: (e: any) => onChange(e.target.value),
      style: {
        fontFamily: "Outfit, sans-serif",
        fontSize: 13.5,
        border: "1px solid",
        boxSizing: "border-box",
        width: "100%",
        position: "relative",
        colorScheme: dark ? "dark" : "light",
        accentColor: theme.iconActive,
        outline: "none",
        backgroundImage: `url("${iconSvg}")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 8px center",
        backgroundSize: "16px 16px",
        paddingRight: "30px",
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
      placeholderTextColor={placeholderColor}
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
  // RN-only keys that a DOM input doesn't understand
  const { paddingHorizontal, paddingVertical, borderRadius, borderColor, backgroundColor, color, width } = flat;
  return {
    padding: `${paddingVertical ?? 9}px ${paddingHorizontal ?? 11}px`,
    borderRadius,
    borderColor,
    backgroundColor,
    color,
    ...(width ? { width } : {}),
  };
}