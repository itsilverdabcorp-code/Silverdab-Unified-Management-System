import React, { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { ADUser } from "../../../../types"; // adjust to your actual path
import SavedStatementsPage from "./SavedStatementsPage";
import StatementFormPage from "./Statementformpage";

/* ============================================================================
   Statement of Account (FPD) — Executive > Forms entry point.
   Same job as FormsPage does for the EIA sign sheet: switches between the
   blank/loaded form and the Saved Statements list, and keeps the URL in sync
   so refresh, shared links and the browser back button all work.

     <base>/new                  blank form
     <base>/view/FPD.2026.01     read-only
     <base>/edit/FPD.2026.01     editable
     <base>                      saved list
   ============================================================================ */

type Props = { user: ADUser; initialView?: "form" | "saved" };

const isWeb = () => Platform.OS === "web" && typeof window !== "undefined";
const RECORD_RE = /\/(view|edit)\/([^/]+)\/?$/;
const NEW_RE = /\/new\/?$/;

type Route =
  | { mode: "view" | "edit"; statementNo: string }
  | { mode: "new"; statementNo: null }
  | null;

const parseRoute = (): Route => {
  if (!isWeb()) return null;
  const p = window.location.pathname;
  const m = p.match(RECORD_RE);
  if (m) return { mode: m[1] as "view" | "edit", statementNo: decodeURIComponent(m[2]) };
  if (NEW_RE.test(p)) return { mode: "new", statementNo: null };
  return null;
};

export default function StatementsPage({ user, initialView }: Props) {
  const [initialRoute] = useState(parseRoute);

  const [view, setView] = useState<"form" | "saved">(
    initialRoute ? "form" : initialView ?? "saved",
  );
  const [statementNo, setStatementNo] = useState<string | null>(initialRoute?.statementNo ?? null);
  const [readOnly, setReadOnly] = useState(initialRoute?.mode === "view");
  // Bumped whenever we want a completely fresh form (New / switching records),
  // since StatementFormPage keeps its own state and only reloads on statementNo change.
  const [formKey, setFormKey] = useState(0);

  // The route without any /view, /edit or /new suffix.
  const basePathRef = useRef(
    isWeb()
      ? window.location.pathname
          .replace(/\/(view|edit)\/[^/]+\/?$/, "")
          .replace(/\/new\/?$/, "")
          .replace(/\/$/, "")
      : "",
  );

  const pushPath = (suffix: string) => {
    if (!isWeb()) return;
    const target = basePathRef.current + suffix;
    if (window.location.pathname !== target) window.history.pushState({}, "", target);
  };

  const openNew = () => {
    setStatementNo(null);
    setReadOnly(false);
    setFormKey((k) => k + 1);
    setView("form");
    pushPath("/new");
  };

  const openRecord = (no: string, mode: "view" | "edit") => {
    setStatementNo(no);
    setReadOnly(mode === "view");
    setFormKey((k) => k + 1);
    setView("form");
    pushPath(`/${mode}/${encodeURIComponent(no)}`);
  };

  const openSaved = () => {
    setView("saved");
    pushPath("");
  };

  // Browser back / forward.
  const applyRoute = () => {
    if (!isWeb() || !window.location.pathname.startsWith(basePathRef.current)) return;
    const r = parseRoute();
    if (r && r.statementNo) {
      setStatementNo(r.statementNo);
      setReadOnly(r.mode === "view");
      setFormKey((k) => k + 1);
      setView("form");
    } else if (r && r.mode === "new") {
      setStatementNo(null);
      setReadOnly(false);
      setFormKey((k) => k + 1);
      setView("form");
    } else {
      setView("saved");
    }
  };

  useEffect(() => {
    if (!isWeb()) return;
    window.addEventListener("popstate", applyRoute);
    return () => window.removeEventListener("popstate", applyRoute);
  }, []);

  if (view === "saved") {
    return (
      <SavedStatementsPage
        user={user}
        onBack={() => {
          setView("form");
          pushPath(statementNo ? `/${readOnly ? "view" : "edit"}/${encodeURIComponent(statementNo)}` : "/new");
        }}
        onView={(no) => openRecord(no, "view")}
        onEdit={(no) => openRecord(no, "edit")}
        onNew={openNew}
      />
    );
  }

  return (
    <StatementFormPage
      key={formKey}
      user={user}
      statementNo={statementNo}
      readOnly={readOnly}
      onBack={openSaved}
    />
  );
}
