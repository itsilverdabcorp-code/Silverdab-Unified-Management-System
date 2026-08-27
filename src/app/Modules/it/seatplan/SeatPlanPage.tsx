import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  GestureResponderEvent,
  PanResponder,
  Platform,
  Modal,
} from "react-native";
import { ADUser, ITInventory, SeatPlanLayout, SeatPlanPod, SeatPlanRoom, SeatPlanSeat, SeatPlanDoor } from "../../../../../types";
import { useTheme } from "../../../../theme/ThemeContext";
import { getSeatPlanLayout, saveSeatPlanLayout } from "@/services/seatPlan";
import { getAllAssets } from "@/services/itInventory"; // adjust the path if it doesn't resolve — same idea as the seatPlan import above
import { useEmployees } from "../../../../hooks/useEmployees";
import {
  SEAT_PLAN_OPTIONS,
  SeatPlanKey,
  SEAT_W,
  SEAT_H,
  DOOR_W,
  DOOR_H,
  CANVAS_W,
  CANVAS_H,
} from "./seatPlanDefaults";

const SAVE_DEBOUNCE_MS = 500;

type Props = { user: ADUser };

type SaveState = "saved" | "saving" | "error";

type DragTarget =
  | { kind: "room"; id: string }
  | { kind: "pod"; id: string }
  | { kind: "seat"; id: string }
  | { kind: "door"; id: string };

const SeatPlanPage: React.FC<Props> = ({ user }) => {
  const { theme } = useTheme();

  // Webkit browsers ignore scrollbarColor/scrollbarWidth, so inject a
  // scoped stylesheet once to theme the NameSelect dropdown's scrollbar.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const id = "seatplan-nameselect-scrollbar";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      .seatplan-nameselect-scroll::-webkit-scrollbar { width: 8px; }
      .seatplan-nameselect-scroll::-webkit-scrollbar-track { background: ${theme.surface}; }
      .seatplan-nameselect-scroll::-webkit-scrollbar-thumb { background: ${theme.borderStrong}; border-radius: 4px; }
    `;
    document.head.appendChild(style);
  }, [theme.surface, theme.borderStrong]);
  const { employees } = useEmployees();
  const employeeNames = useMemo(() => employees.map((e) => e.name), [employees]);

  const [planKey, setPlanKey] = useState<SeatPlanKey>(SEAT_PLAN_OPTIONS[0].key);
  const [unitMenuOpen, setUnitMenuOpen] = useState(false);
  const [layout, setLayout] = useState<SeatPlanLayout>(SEAT_PLAN_OPTIONS[0].defaultLayout);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState(true); // default: locked
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [selected, setSelected] = useState<DragTarget | null>(null);
  const [snapGuides, setSnapGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const [gridModalPod, setGridModalPod] = useState<{ id: string; rows: number; cols: number } | null>(null);
  const [inventory, setInventory] = useState<ITInventory[]>([]);
  const [devicesModal, setDevicesModal] = useState<{ name: string; target: DragTarget | { kind: "podCell"; podId: string; index: number } } | null>(null);
  const [editingDevicesModalName, setEditingDevicesModalName] = useState(false);
  const [history, setHistory] = useState<SeatPlanLayout[]>([]);
  const UNDO_LIMIT = 20;
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragStart = useRef<{ x: number; y: number; origX: number; origY: number } | null>(null);
  const resizeStart = useRef<{ x: number; y: number; origW: number; origH: number } | null>(null);
  const panStart = useRef<{ x: number; y: number; origPanX: number; origPanY: number } | null>(null);
  const pinchStart = useRef<{ dist: number; zoom: number } | null>(null);
  const viewportSize = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const viewportRef = useRef<any>(null);
  const zoomRef = useRef(zoom);
  const panXRef = useRef(panX);
  const panYRef = useRef(panY);
  const rightPanStart = useRef<{ x: number; y: number; origPanX: number; origPanY: number } | null>(null);
  const leftPanStart = useRef<{ x: number; y: number; origPanX: number; origPanY: number } | null>(null);
  const canvasRef = useRef<any>(null);
  zoomRef.current = zoom;
  panXRef.current = panX;
  panYRef.current = panY;

  // ── Load (re-runs whenever the selected unit changes) ────────────────
  const load = useCallback(async () => {
    setLoading(true);
    const option = SEAT_PLAN_OPTIONS.find((o) => o.key === planKey) ?? SEAT_PLAN_OPTIONS[0];
    try {
      const saved = await getSeatPlanLayout(planKey);
      // Older saved layouts predate the doors feature and won't have a
      // `doors` array — backfill it so every array access below is safe.
      setLayout(saved ? { ...saved, doors: saved.doors ?? [] } : option.defaultLayout);
    } catch (err) {
      console.error("Failed to load seat plan, using default:", err);
      setLayout(option.defaultLayout);
    } finally {
      setLoading(false);
    }
  }, [planKey]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!loading) {
      const t = setTimeout(() => recenter(), 50);
      return () => clearTimeout(t);
    }
  }, [loading]);

  // ── IT inventory lookup (for the "assigned devices" popup on double-click) ──
  useEffect(() => {
    getAllAssets()
      .then(setInventory)
      .catch((err) => console.error("Failed to load IT inventory for seat plan:", err));
  }, []);

  const openDevicesForName = useCallback(
    (name: string, target: DragTarget | { kind: "podCell"; podId: string; index: number }) => {
      setEditingDevicesModalName(false);
      setDevicesModal({ name: name.trim(), target });
    },
    [],
  );

  const renameFromDevicesModal = useCallback(
    (newName: string) => {
      if (!devicesModal) return;
      const t = devicesModal.target;
      if (t.kind === "seat") setSeatName(t.id, newName);
      else if (t.kind === "podCell") setPodCell(t.podId, t.index, newName);
      setDevicesModal((m) => (m ? { ...m, name: newName.trim() } : m));
    },
    [devicesModal],
  );

  const devicesForModal = useMemo(() => {
    if (!devicesModal) return [];
    const target = devicesModal.name.toLowerCase();
    return inventory.filter((d) => (d.assigneeName ?? "").trim().toLowerCase() === target);
  }, [devicesModal, inventory]);

  // ── Save (debounced, shared across every user) ──────────────────────────
  const scheduleSave = useCallback(
    (next: SeatPlanLayout) => {
      setSaveState("saving");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        try {
          await saveSeatPlanLayout(planKey, next, user.displayName);
          setSaveState("saved");
        } catch (err) {
          console.error("Seat plan save failed:", err);
          setSaveState("error");
        }
      }, SAVE_DEBOUNCE_MS);
    },
    [user.displayName, planKey],
  );

  const updateLayout = useCallback(
    (updater: (prev: SeatPlanLayout) => SeatPlanLayout) => {
      setLayout((prev) => {
        setHistory((h) => [...h.slice(-(UNDO_LIMIT - 1)), prev]);
        const next = updater(prev);
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  // ── Mutations ─────────────────────────────────────────────────────────
  const renameRoom = (id: string, label: string) =>
    updateLayout((prev) => ({
      ...prev,
      rooms: prev.rooms.map((r) => (r.id === id ? { ...r, label } : r)),
    }));

  const resizeRoom = (id: string, w: number, h: number) =>
    updateLayout((prev) => ({
      ...prev,
      rooms: prev.rooms.map((r) => (r.id === id ? { ...r, w, h } : r)),
    }));

  const moveItem = (target: DragTarget, x: number, y: number) =>
    updateLayout((prev) => {
      if (target.kind === "room") {
        return { ...prev, rooms: prev.rooms.map((r) => (r.id === target.id ? { ...r, x, y } : r)) };
      }
      if (target.kind === "pod") {
        return { ...prev, pods: prev.pods.map((p) => (p.id === target.id ? { ...p, x, y } : p)) };
      }
      if (target.kind === "door") {
        return { ...prev, doors: prev.doors.map((d) => (d.id === target.id ? { ...d, x, y } : d)) };
      }
      return { ...prev, seats: prev.seats.map((s) => (s.id === target.id ? { ...s, x, y } : s)) };
    });

  // ── Edge snapping: while dragging, snap the moving item's edges/center
  // to the nearest edge/center of any other room, pod, or seat ─────────
  const SNAP_THRESHOLD = 8;

  const getAllBoxes = useCallback(
    (exclude: DragTarget): { x: number; y: number; w: number; h: number }[] => {
      const boxes: { x: number; y: number; w: number; h: number }[] = [];
      layout.rooms.forEach((r) => {
        if (exclude.kind === "room" && exclude.id === r.id) return;
        boxes.push({ x: r.x, y: r.y, w: r.w, h: r.h });
      });
      layout.pods.forEach((p) => {
        if (exclude.kind === "pod" && exclude.id === p.id) return;
        boxes.push({ x: p.x, y: p.y, w: p.w, h: p.h });
      });
      layout.seats.forEach((s) => {
        if (exclude.kind === "seat" && exclude.id === s.id) return;
        const w = s.rot === 90 ? SEAT_H : SEAT_W;
        const h = s.rot === 90 ? SEAT_W : SEAT_H;
        boxes.push({ x: s.x, y: s.y, w, h });
      });
      layout.doors.forEach((d) => {
        if (exclude.kind === "door" && exclude.id === d.id) return;
        boxes.push({ x: d.x, y: d.y, w: d.w, h: d.h });
      });
      return boxes;
    },
    [layout],
  );

  const snapPosition = useCallback(
    (target: DragTarget, nx: number, ny: number, w: number, h: number) => {
      const boxes = getAllBoxes(target);
      const movingEdgesX = [nx, nx + w / 2, nx + w];
      const movingEdgesY = [ny, ny + h / 2, ny + h];

      let bestDx = SNAP_THRESHOLD;
      let bestVGuide: number | null = null;
      let snappedX = nx;

      let bestDy = SNAP_THRESHOLD;
      let bestHGuide: number | null = null;
      let snappedY = ny;

      boxes.forEach((b) => {
        const targetEdgesX = [b.x, b.x + b.w / 2, b.x + b.w];
        const targetEdgesY = [b.y, b.y + b.h / 2, b.y + b.h];

        movingEdgesX.forEach((me) => {
          targetEdgesX.forEach((te) => {
            const d = Math.abs(me - te);
            if (d < bestDx) {
              bestDx = d;
              bestVGuide = te;
              snappedX = nx + (te - me);
            }
          });
        });

        movingEdgesY.forEach((me) => {
          targetEdgesY.forEach((te) => {
            const d = Math.abs(me - te);
            if (d < bestDy) {
              bestDy = d;
              bestHGuide = te;
              snappedY = ny + (te - me);
            }
          });
        });
      });

      return {
        x: snappedX,
        y: snappedY,
        vGuides: bestVGuide !== null ? [bestVGuide] : [],
        hGuides: bestHGuide !== null ? [bestHGuide] : [],
      };
    },
    [getAllBoxes],
  );

  const snapEdge = useCallback(
    (target: DragTarget, edgeValue: number, axis: "x" | "y") => {
      const boxes = getAllBoxes(target);
      let best = SNAP_THRESHOLD;
      let snappedEdge = edgeValue;
      let guide: number | null = null;
      boxes.forEach((b) => {
        const edges = axis === "x" ? [b.x, b.x + b.w / 2, b.x + b.w] : [b.y, b.y + b.h / 2, b.y + b.h];
        edges.forEach((te) => {
          const d = Math.abs(edgeValue - te);
          if (d < best) {
            best = d;
            snappedEdge = te;
            guide = te;
          }
        });
      });
      return { value: snappedEdge, guide };
    },
    [getAllBoxes],
  );

  const snapSize = useCallback(
    (target: DragTarget, x: number, y: number, w: number, h: number) => {
      const rightSnap = snapEdge(target, x + w, "x");
      const bottomSnap = snapEdge(target, y + h, "y");
      return {
        w: Math.max(60, rightSnap.value - x),
        h: Math.max(40, bottomSnap.value - y),
        vGuides: rightSnap.guide !== null ? [rightSnap.guide] : [],
        hGuides: bottomSnap.guide !== null ? [bottomSnap.guide] : [],
      };
    },
    [snapEdge],
  );

  const setPodCell = (podId: string, index: number, name: string) =>
    updateLayout((prev) => ({
      ...prev,
      pods: prev.pods.map((p) =>
        p.id === podId
          ? { ...p, seats: p.seats.map((s, i) => (i === index ? name : s)) }
          : p,
      ),
    }));

  const setSeatName = (seatId: string, name: string) =>
    updateLayout((prev) => ({
      ...prev,
      seats: prev.seats.map((s) => (s.id === seatId ? { ...s, name } : s)),
    }));

  const reshapePod = (podId: string, deltaRows: number, deltaCols: number) =>
    updateLayout((prev) => ({
      ...prev,
      pods: prev.pods.map((p) => {
        if (p.id !== podId) return p;
        const newRows = Math.max(1, Math.min(20, p.rows + deltaRows));
        const newCols = Math.max(1, Math.min(8, p.cols + deltaCols));
        const fresh: string[] = [];
        for (let r = 0; r < newRows; r++) {
          for (let c = 0; c < newCols; c++) {
            fresh.push(r < p.rows && c < p.cols ? (p.seats[r * p.cols + c] ?? "") : "");
          }
        }
        const cellW = p.portrait ? 55 : 99;
        const cellH = p.portrait ? 99 : 55;
        return { ...p, rows: newRows, cols: newCols, seats: fresh, w: newCols * cellW + 9, h: newRows * cellH + 24 };
      }),
    }));

  const setPodDimensions = (podId: string, rows: number, cols: number) =>
    updateLayout((prev) => ({
      ...prev,
      pods: prev.pods.map((p) => {
        if (p.id !== podId) return p;
        const newRows = Math.max(1, Math.min(20, rows));
        const newCols = Math.max(1, Math.min(8, cols));
        const fresh: string[] = [];
        for (let r = 0; r < newRows; r++) {
          for (let c = 0; c < newCols; c++) {
            fresh.push(r < p.rows && c < p.cols ? (p.seats[r * p.cols + c] ?? "") : "");
          }
        }
        const cellW = p.portrait ? 55 : 99;
        const cellH = p.portrait ? 99 : 55;
        return { ...p, rows: newRows, cols: newCols, seats: fresh, w: newCols * cellW + 9, h: newRows * cellH + 24 };
      }),
    }));

  const togglePodPortrait = (podId: string) =>
    updateLayout((prev) => ({
      ...prev,
      pods: prev.pods.map((p) => {
        if (p.id !== podId) return p;
        const portrait = !p.portrait;
        const cellW = portrait ? 55 : 99;
        const cellH = portrait ? 99 : 55;
        return { ...p, portrait, w: p.cols * cellW + 9, h: p.rows * cellH + 24 };
      }),
    }));

  const toggleSeatRotation = (seatId: string) =>
    updateLayout((prev) => ({
      ...prev,
      seats: prev.seats.map((s) => (s.id === seatId ? { ...s, rot: s.rot === 90 ? 0 : 90 } : s)),
    }));

  const addSeat = () =>
    updateLayout((prev) => ({
      ...prev,
      seats: [
        ...prev.seats,
        { id: `s-${Date.now()}`, x: 60 + Math.random() * 200, y: 460 + Math.random() * 60, name: "" },
      ],
    }));

  const addRoom = () =>
    updateLayout((prev) => ({
      ...prev,
      rooms: [
        ...prev.rooms,
        { id: `r-${Date.now()}`, x: 60, y: 560, w: 160, h: 100, label: "NEW ROOM" },
      ],
    }));

  const addPod = () =>
    updateLayout((prev) => ({
      ...prev,
      pods: [
        ...prev.pods,
        {
          id: `p-${Date.now()}`,
          x: 80,
          y: 560,
          w: 4 * 99 + 9,
          h: 2 * 55 + 24,
          rows: 2,
          cols: 4,
          seats: new Array(8).fill(""),
        },
      ],
    }));

  const deleteRoom = (id: string) =>
    updateLayout((prev) => ({ ...prev, rooms: prev.rooms.filter((r) => r.id !== id) }));
  const deletePod = (id: string) =>
    updateLayout((prev) => ({ ...prev, pods: prev.pods.filter((p) => p.id !== id) }));
  const deleteSeat = (id: string) =>
    updateLayout((prev) => ({ ...prev, seats: prev.seats.filter((s) => s.id !== id) }));

  // Drops a new door near the middle of the canvas; fully freeform from
  // there — drag it onto whichever wall it belongs on.
  const addDoor = () =>
    updateLayout((prev) => ({
      ...prev,
      doors: [
        ...prev.doors,
        {
          id: `d-${Date.now()}`,
          x: CANVAS_W / 2 - DOOR_W / 2 + (Math.random() * 40 - 20),
          y: CANVAS_H / 2 - DOOR_H / 2 + (Math.random() * 40 - 20),
          w: DOOR_W,
          h: DOOR_H,
          rot: 0,
        },
      ],
    }));

  const toggleDoorRotation = (doorId: string) =>
    updateLayout((prev) => ({
      ...prev,
      doors: prev.doors.map((d) => {
        if (d.id !== doorId) return d;
        const rot = d.rot === 90 ? 0 : 90;
        return { ...d, rot, w: d.h, h: d.w };
      }),
    }));

  const deleteDoor = (id: string) =>
    updateLayout((prev) => ({ ...prev, doors: prev.doors.filter((d) => d.id !== id) }));

  const undo = () => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const previous = h[h.length - 1];
      setLayout(previous);
      scheduleSave(previous);
      return h.slice(0, -1);
    });
  };

  // ── Recenter: fit zoom + pan to actual content bounds ────────────────
  const getContentBounds = useCallback(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const consider = (x: number, y: number, w: number, h: number) => {
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
    };
    layout.rooms.forEach((r) => consider(r.x, r.y, r.w, r.h));
    layout.pods.forEach((p) => consider(p.x, p.y, p.w, p.h));
    layout.seats.forEach((s) => {
      const w = s.rot === 90 ? SEAT_H : SEAT_W;
      const h = s.rot === 90 ? SEAT_W : SEAT_H;
      consider(s.x, s.y, w, h);
    });
    layout.doors.forEach((d) => consider(d.x, d.y, d.w, d.h));
    if (minX === Infinity) return { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H };
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }, [layout]);

  const recenter = useCallback(() => {
    const { width, height } = viewportSize.current;
    if (!width || !height) {
      setZoom(1);
      setPanX(0);
      setPanY(0);
      return;
    }
    const pad = 60;
    const bounds = getContentBounds();
    const fitZoom = Math.min(
      (width - pad) / bounds.w,
      (height - pad) / bounds.h,
      1.5,
    );
    const newZoom = Math.min(3, Math.max(0.2, fitZoom));
    setZoom(newZoom);
    setPanX((width - bounds.w * newZoom) / 2 - bounds.x * newZoom);
    setPanY((height - bounds.h * newZoom) / 2 - bounds.y * newZoom);
  }, [getContentBounds]);

  // ── Scroll-wheel zoom (web only, zooms toward cursor position) ──────
  useEffect(() => {
    if (Platform.OS !== "web" || loading) return;
    const node = viewportRef.current as any;
    if (!node || !node.addEventListener) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = node.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;
      const prevZoom = zoomRef.current;
      const factor = Math.exp(-e.deltaY * 0.001);
      const newZoom = Math.min(3, Math.max(0.2, prevZoom * factor));
      const contentX = (offsetX - panXRef.current) / prevZoom;
      const contentY = (offsetY - panYRef.current) / prevZoom;
      setZoom(newZoom);
      setPanX(offsetX - contentX * newZoom);
      setPanY(offsetY - contentY * newZoom);
    };

    node.addEventListener("wheel", handleWheel, { passive: false });
    return () => node.removeEventListener("wheel", handleWheel);
  }, [loading]);

  // ── Right-click-drag pan (web only) — suppresses the context menu and
  // text selection so dragging over labels doesn't highlight them ──────
  useEffect(() => {
    if (Platform.OS !== "web" || loading) return;
    const node = viewportRef.current as any;
    if (!node || !node.addEventListener) return;

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 2) return; // right mouse button only
      e.preventDefault();
      rightPanStart.current = {
        x: e.clientX,
        y: e.clientY,
        origPanX: panXRef.current,
        origPanY: panYRef.current,
      };
      node.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!rightPanStart.current) return;
      e.preventDefault();
      const dx = e.clientX - rightPanStart.current.x;
      const dy = e.clientY - rightPanStart.current.y;
      setPanX(rightPanStart.current.origPanX + dx);
      setPanY(rightPanStart.current.origPanY + dy);
    };

    const handleMouseUp = () => {
      if (!rightPanStart.current) return;
      rightPanStart.current = null;
      node.style.cursor = "";
      document.body.style.userSelect = "";
    };

    node.addEventListener("contextmenu", handleContextMenu);
    node.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      node.removeEventListener("contextmenu", handleContextMenu);
      node.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
    };
  }, [loading]);

  // ── Left-click-drag pan on empty canvas space (web only) — same
  // process as the HTML version's pointerdown pan, no boundary ─────────
  useEffect(() => {
    if (Platform.OS !== "web" || loading) return;
    const node = viewportRef.current as any;
    const canvasNode = canvasRef.current as any;
    if (!node || !node.addEventListener || !canvasNode) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return; // left mouse button only
      // Only start a pan if the click landed on empty canvas space —
      // i.e. directly on the viewport or the canvas background, not on
      // a room/pod/seat, which are the elements nested inside it.
      if (e.target !== node && e.target !== canvasNode) return;
      leftPanStart.current = {
        x: e.clientX,
        y: e.clientY,
        origPanX: panXRef.current,
        origPanY: panYRef.current,
      };
      node.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!leftPanStart.current) return;
      const dx = e.clientX - leftPanStart.current.x;
      const dy = e.clientY - leftPanStart.current.y;
      setPanX(leftPanStart.current.origPanX + dx);
      setPanY(leftPanStart.current.origPanY + dy);
    };

    const handleMouseUp = () => {
      if (!leftPanStart.current) return;
      leftPanStart.current = null;
      node.style.cursor = "";
      document.body.style.userSelect = "";
    };

    node.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      node.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
    };
  }, [loading]);

  // ── Viewport pan + pinch-zoom (empty-space drag / two-finger pinch) ──
  function dist(touches: any[]) {
    const [a, b] = touches;
    return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
  }

  const viewportPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (e) => {
          // On web, left-click-drag panning is handled by the native
          // mousedown/mousemove listeners above instead — this responder
          // stays active only for real touch input (pinch, touch-drag).
          if (Platform.OS === "web" && e.nativeEvent.touches.length < 2) return false;
          return true;
        },
        onMoveShouldSetPanResponder: (e, gesture) => {
          if (Platform.OS === "web" && e.nativeEvent.touches.length < 2) return false;
          return Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2;
        },
        onPanResponderGrant: (e) => {
          const touches = e.nativeEvent.touches;
          if (touches.length === 2) {
            pinchStart.current = { dist: dist(touches), zoom };
            panStart.current = null;
          } else {
            panStart.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, origPanX: panX, origPanY: panY };
            pinchStart.current = null;
          }
        },
        onPanResponderMove: (e) => {
          const touches = e.nativeEvent.touches;
          if (touches.length === 2 && pinchStart.current) {
            const newDist = dist(touches);
            const scale = newDist / pinchStart.current.dist;
            const newZoom = Math.min(3, Math.max(0.2, pinchStart.current.zoom * scale));
            setZoom(newZoom);
          } else if (panStart.current) {
            const dx = e.nativeEvent.pageX - panStart.current.x;
            const dy = e.nativeEvent.pageY - panStart.current.y;
            setPanX(panStart.current.origPanX + dx);
            setPanY(panStart.current.origPanY + dy);
          }
        },
        onPanResponderRelease: () => {
          panStart.current = null;
          pinchStart.current = null;
        },
      }),
    [zoom, panX, panY],
  );

  // ── Drag handling (mouse/touch via PanResponder) ─────────────────────
  const startDrag = (target: DragTarget, origX: number, origY: number) => (e: GestureResponderEvent) => {
    if (viewMode) return;
    setSelected(target);
    dragStart.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, origX, origY };
  };

  const panResponderFor = (target: DragTarget, origX: number, origY: number, w: number, h: number) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => !viewMode,
      onMoveShouldSetPanResponder: () => !viewMode,
      onPanResponderGrant: (e) => {
        startDrag(target, origX, origY)(e);
        if (Platform.OS === "web") {
          (document.body.style as any).userSelect = "none";
        }
      },
      onPanResponderMove: (e) => {
        if (!dragStart.current) return;
        const dx = e.nativeEvent.pageX - dragStart.current.x;
        const dy = e.nativeEvent.pageY - dragStart.current.y;
        const rawX = dragStart.current.origX + dx;
        const rawY = dragStart.current.origY + dy;
        const snapped = snapPosition(target, rawX, rawY, w, h);
        setSnapGuides({ v: snapped.vGuides, h: snapped.hGuides });
        moveItem(target, snapped.x, snapped.y);
      },
      onPanResponderRelease: () => {
        dragStart.current = null;
        setSnapGuides({ v: [], h: [] });
        if (Platform.OS === "web") {
          (document.body.style as any).userSelect = "";
        }
      },
    });

  // ── Room resize handle (bottom-right corner drag) ─────────────────────
  const resizeResponderFor = (room: SeatPlanRoom) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => !viewMode,
      onMoveShouldSetPanResponder: () => !viewMode,
      onPanResponderGrant: (e) => {
        resizeStart.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, origW: room.w, origH: room.h };
        if (Platform.OS === "web") {
          (document.body.style as any).userSelect = "none";
        }
      },
      onPanResponderMove: (e) => {
        if (!resizeStart.current) return;
        const dx = e.nativeEvent.pageX - resizeStart.current.x;
        const dy = e.nativeEvent.pageY - resizeStart.current.y;
        const rawW = Math.max(60, resizeStart.current.origW + dx);
        const rawH = Math.max(40, resizeStart.current.origH + dy);
        const snapped = snapSize({ kind: "room", id: room.id }, room.x, room.y, rawW, rawH);
        setSnapGuides({ v: snapped.vGuides, h: snapped.hGuides });
        resizeRoom(room.id, snapped.w, snapped.h);
      },
      onPanResponderRelease: () => {
        resizeStart.current = null;
        setSnapGuides({ v: [], h: [] });
        if (Platform.OS === "web") {
          (document.body.style as any).userSelect = "";
        }
      },
    });

  const styles = useMemo(() => makeStyles(theme), [theme]);

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={{ color: theme.subtext }}>Loading seat plan…</Text>
      </View>
    );
  }

  return (
    <>
    <View style={styles.container}>
      {/* Toolbar */}
      <View style={[styles.toolbar, { position: "relative", zIndex: 50 }]}>
        <Text style={styles.title}>Seat Plan</Text>

        <View style={{ position: "relative", zIndex: 30 }}>
          <Pressable
            style={styles.toolBtn}
            onPress={() => setUnitMenuOpen((v) => !v)}
          >
            <Text style={styles.toolBtnText}>
              {(SEAT_PLAN_OPTIONS.find((o) => o.key === planKey)?.label ?? "Select unit")} ▾
            </Text>
          </Pressable>

          {unitMenuOpen && (
            <View
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                marginTop: 4,
                backgroundColor: theme.surfaceRaised,
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 8,
                overflow: "hidden",
                minWidth: 150,
                zIndex: 30,
                elevation: 8,
                ...(Platform.OS === "web" ? { boxShadow: "0 4px 12px rgba(0,0,0,0.15)" } as any : {}),
              }}
            >
              {SEAT_PLAN_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.key}
                  onPress={() => {
                    setUnitMenuOpen(false);
                    if (opt.key !== planKey) {
                      setPlanKey(opt.key);
                      setHistory([]);
                      setSelected(null);
                      setViewMode(true);
                    }
                  }}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    backgroundColor: opt.key === planKey ? theme.border : "transparent",
                  }}
                >
                  <Text style={{ color: theme.text, fontSize: 13, fontWeight: opt.key === planKey ? "700" : "500" }}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <Pressable
          onPress={() => setViewMode((v) => !v)}
          style={[styles.modeBtn, viewMode ? styles.modeBtnView : styles.modeBtnEdit]}
        >
          <Text style={styles.modeBtnText}>{viewMode ? "👁 View mode" : "✎ Edit mode"}</Text>
        </Pressable>

        {!viewMode && (
          <>
            <Pressable style={styles.toolBtn} onPress={addSeat}>
              <Text style={styles.toolBtnText}>+ Seat</Text>
            </Pressable>
            <Pressable style={styles.toolBtn} onPress={addPod}>
              <Text style={styles.toolBtnText}>+ Seat block</Text>
            </Pressable>
            <Pressable style={styles.toolBtn} onPress={addRoom}>
              <Text style={styles.toolBtnText}>+ Room</Text>
            </Pressable>

            <Pressable style={styles.toolBtn} onPress={addDoor}>
              <Text style={styles.toolBtnText}>+ Door</Text>
            </Pressable>

            <Pressable
              style={[styles.toolBtn, history.length === 0 && { opacity: 0.4 }]}
              onPress={undo}
              disabled={history.length === 0}
            >
              <Text style={styles.toolBtnText}>↶ Undo</Text>
            </Pressable>
          </>
        )}

        <Pressable style={styles.toolBtn} onPress={() => setZoom((z) => Math.max(0.2, z - 0.15))}>
          <Text style={styles.toolBtnText}>−</Text>
        </Pressable>
        <Text style={{ color: theme.subtext, fontSize: 11, minWidth: 36, textAlign: "center" }}>
          {Math.round(zoom * 100)}%
        </Text>
        <Pressable style={styles.toolBtn} onPress={() => setZoom((z) => Math.min(3, z + 0.15))}>
          <Text style={styles.toolBtnText}>+</Text>
        </Pressable>
        <Pressable style={styles.toolBtn} onPress={recenter}>
          <Text style={styles.toolBtnText}>⤢ Recenter</Text>
        </Pressable>

        <View style={styles.saveIndicator}>
          <View
            style={[
              styles.saveDot,
              saveState === "saving" && styles.saveDotSaving,
              saveState === "error" && styles.saveDotError,
            ]}
          />
          <Text style={styles.saveText}>
            {saveState === "saving" ? "Saving…" : saveState === "error" ? "Save failed" : "Saved"}
          </Text>
        </View>
      </View>

      {/* Canvas */}
      <View
        ref={viewportRef}
        style={[
          { flex: 1, overflow: "hidden" },
          Platform.OS === "web"
            ? ({
                backgroundImage: `linear-gradient(${theme.border} 1px, transparent 1px), linear-gradient(90deg, ${theme.border} 1px, transparent 1px), linear-gradient(${theme.borderStrong} 1px, transparent 1px), linear-gradient(90deg, ${theme.borderStrong} 1px, transparent 1px)`,
                backgroundSize: "20px 20px, 20px 20px, 100px 100px, 100px 100px",
                backgroundPosition: "-1px -1px",
              } as any)
            : {},
        ]}
        onLayout={(e) => {
          viewportSize.current = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height };
        }}
        {...viewportPanResponder.panHandlers}
      >
        <View
          ref={canvasRef}
          style={[
            styles.canvas,
            {
              width: CANVAS_W,
              height: CANVAS_H,
              transform: [{ translateX: panX }, { translateY: panY }, { scale: zoom }],
              transformOrigin: "0 0" as any,
            },
          ]}
        >
            {layout.rooms.map((room) => (
              <View key={room.id} style={{ zIndex: 1 }}>
              <RoomBlock
                room={room}
                theme={theme}
                viewMode={viewMode}
                selected={selected?.kind === "room" && selected.id === room.id}
                panResponder={panResponderFor({ kind: "room", id: room.id }, room.x, room.y, room.w, room.h)}
                resizeResponder={resizeResponderFor(room)}
                onRename={(label) => renameRoom(room.id, label)}
                onDelete={() => deleteRoom(room.id)}
              />
              </View>
            ))}
            {layout.pods.map((pod) => (
              <PodBlock
                key={pod.id}
                pod={pod}
                theme={theme}
                viewMode={viewMode}
                selected={selected?.kind === "pod" && selected.id === pod.id}
                panResponder={panResponderFor({ kind: "pod", id: pod.id }, pod.x, pod.y, pod.w, pod.h)}
                onCellChange={(i, name) => setPodCell(pod.id, i, name)}
                onReshape={(dr, dc) => reshapePod(pod.id, dr, dc)}
                onTogglePortrait={() => togglePodPortrait(pod.id)}
                onDelete={() => deletePod(pod.id)}
                onOpenGrid={() => setGridModalPod({ id: pod.id, rows: pod.rows, cols: pod.cols })}
                onOpenDevices={(name, index) => openDevicesForName(name, { kind: "podCell", podId: pod.id, index })}
                employeeNames={employeeNames}
              />
            ))}
            {layout.seats.map((seat) => (
              <SeatBlock
                key={seat.id}
                seat={seat}
                theme={theme}
                viewMode={viewMode}
                selected={selected?.kind === "seat" && selected.id === seat.id}
                panResponder={panResponderFor(
                  { kind: "seat", id: seat.id },
                  seat.x,
                  seat.y,
                  seat.rot === 90 ? SEAT_H : SEAT_W,
                  seat.rot === 90 ? SEAT_W : SEAT_H,
                )}
                onNameChange={(name) => setSeatName(seat.id, name)}
                onToggleRotate={() => toggleSeatRotation(seat.id)}
                onDelete={() => deleteSeat(seat.id)}
                onOpenDevices={(name) => openDevicesForName(name, { kind: "seat", id: seat.id })}
                employeeNames={employeeNames}
              />
            ))}
            {layout.doors.map((door) => (
              <DoorBlock
                key={door.id}
                door={door}
                theme={theme}
                viewMode={viewMode}
                selected={selected?.kind === "door" && selected.id === door.id}
                panResponder={panResponderFor({ kind: "door", id: door.id }, door.x, door.y, door.w, door.h)}
                onToggleRotate={() => toggleDoorRotation(door.id)}
                onDelete={() => deleteDoor(door.id)}
              />
            ))}

            {/* Snap guide lines — shown only while dragging near another edge/center */}
            {snapGuides.v.map((x, i) => (
              <View
                key={`snap-v-${i}`}
                pointerEvents="none"
                style={{ position: "absolute", left: x, top: 0, width: 1, height: CANVAS_H, backgroundColor: "#e8a33d" }}
              />
            ))}
            {snapGuides.h.map((y, i) => (
              <View
                key={`snap-h-${i}`}
                pointerEvents="none"
                style={{ position: "absolute", left: 0, top: y, width: CANVAS_W, height: 1, backgroundColor: "#e8a33d" }}
              />
            ))}
          </View>
        </View>
      </View>

      {/* Grid size modal */}
      <Modal visible={!!gridModalPod} transparent animationType="fade" onRequestClose={() => setGridModalPod(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" }}>
          <View style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 20, width: 260, borderWidth: 1, borderColor: theme.border }}>
            <Text style={{ color: theme.text, fontSize: 15, fontWeight: "700", marginBottom: 14 }}>Seat block size</Text>

            {gridModalPod && (
              <>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <Text style={{ color: theme.subtext, fontSize: 13 }}>Rows</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Pressable
                      onPress={() => setGridModalPod((g) => (g ? { ...g, rows: Math.max(1, g.rows - 1) } : g))}
                      style={styles_modalStepBtn}
                    >
                      <Text style={styles_modalStepText}>−</Text>
                    </Pressable>
                    <Text style={{ color: theme.text, fontSize: 14, minWidth: 24, textAlign: "center" }}>{gridModalPod.rows}</Text>
                    <Pressable
                      onPress={() => setGridModalPod((g) => (g ? { ...g, rows: Math.min(20, g.rows + 1) } : g))}
                      style={styles_modalStepBtn}
                    >
                      <Text style={styles_modalStepText}>+</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                  <Text style={{ color: theme.subtext, fontSize: 13 }}>Columns</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Pressable
                      onPress={() => setGridModalPod((g) => (g ? { ...g, cols: Math.max(1, g.cols - 1) } : g))}
                      style={styles_modalStepBtn}
                    >
                      <Text style={styles_modalStepText}>−</Text>
                    </Pressable>
                    <Text style={{ color: theme.text, fontSize: 14, minWidth: 24, textAlign: "center" }}>{gridModalPod.cols}</Text>
                    <Pressable
                      onPress={() => setGridModalPod((g) => (g ? { ...g, cols: Math.min(8, g.cols + 1) } : g))}
                      style={styles_modalStepBtn}
                    >
                      <Text style={styles_modalStepText}>+</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
                  <Pressable onPress={() => setGridModalPod(null)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 7 }}>
                    <Text style={{ color: theme.subtext, fontSize: 13, fontWeight: "600" }}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setPodDimensions(gridModalPod.id, gridModalPod.rows, gridModalPod.cols);
                      setGridModalPod(null);
                    }}
                    style={{ backgroundColor: theme.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 7 }}
                  >
                    <Text style={{ color: theme.primaryText, fontSize: 13, fontWeight: "700" }}>Apply</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Assigned devices modal */}
      <Modal visible={!!devicesModal} transparent animationType="fade" onRequestClose={() => setDevicesModal(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" }}>
          <View style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 20, width: 320, maxHeight: "70%", borderWidth: 1, borderColor: theme.border, overflow: "visible" }}>
            <Text style={{ color: theme.subtext, fontSize: 11, marginBottom: 6 }}>Devices assigned to</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4, position: "relative", zIndex: 1000, elevation: 1000 }}>
              {editingDevicesModalName ? (
                <View
                  style={[
                    { flex: 1, zIndex: 1000, elevation: 1000 },
                    Platform.OS === "web" ? ({ isolation: "isolate" } as any) : {},
                  ]}
                >
                  <NameSelect
                    value={devicesModal?.name ?? ""}
                    options={employeeNames}
                    viewMode={false}
                    theme={theme}
                    placeholder="Unassigned"
                    autoOpen
                    onChange={(v) => {
                      renameFromDevicesModal(v);
                      setEditingDevicesModalName(false);
                    }}
                    textStyle={{ fontSize: 15, fontWeight: "700", color: theme.text }}
                  />
                </View>
              ) : (
                <>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: theme.text, flex: 1 }}>
                    {devicesModal?.name || "Unassigned"}
                  </Text>
                  <Pressable
                    onPress={() => setEditingDevicesModalName(true)}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 6,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: theme.surfaceRaised,
                      borderWidth: 1,
                      borderColor: theme.border,
                    }}
                  >
                    <Text style={{ fontSize: 12, color: theme.subtext }}>✎</Text>
                  </Pressable>
                </>
              )}
            </View>
            <Text style={{ color: theme.subtext, fontSize: 11, marginBottom: 12, position: "relative", zIndex: 1 }}>
              {devicesForModal.length} device{devicesForModal.length !== 1 ? "s" : ""} in IT Inventory
            </Text>

            <ScrollView style={{ maxHeight: 320, position: "relative", zIndex: 1 }}>
              {devicesForModal.length === 0 ? (
                <Text style={{ color: theme.subtext, fontSize: 12 }}>No devices found for this person.</Text>
              ) : (
                devicesForModal.map((d) => (
                  <View
                    key={d.assetTag}
                    style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.border }}
                  >
                    <Text style={{ color: theme.text, fontSize: 13, fontWeight: "600" }}>
                      {d.assetTag} — {d.brand} {d.model}
                    </Text>
                    <Text style={{ color: theme.subtext, fontSize: 11, marginTop: 2 }}>
                      {d.category} · {d.status} · {d.location}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>

            <Pressable
              onPress={() => {
                setEditingDevicesModalName(false);
                setDevicesModal(null);
              }}
              style={{ alignSelf: "flex-end", marginTop: 14, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 7 }}
            >
              <Text style={{ color: theme.subtext, fontSize: 13, fontWeight: "600" }}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
};

// ── Sub-components ──────────────────────────────────────────────────────

const RoomBlock: React.FC<{
  room: SeatPlanRoom;
  theme: any;
  viewMode: boolean;
  selected: boolean;
  panResponder: ReturnType<typeof PanResponder.create>;
  resizeResponder: ReturnType<typeof PanResponder.create>;
  onRename: (label: string) => void;
  onDelete: () => void;
}> = ({ room, theme, viewMode, selected, panResponder, resizeResponder, onRename, onDelete }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(room.label);

  return (
    <View
      style={{
        position: "absolute",
        left: room.x,
        top: room.y,
        width: room.w,
        height: room.h,
        borderWidth: 2,
        borderColor: selected ? theme.primary : theme.borderStrong,
        borderRadius: 2,
      }}
    >
      <View {...(!viewMode ? panResponder.panHandlers : {})} style={{ position: "absolute", top: 0, left: 0, right: 0, height: 22 }} />
      {editing ? (
        <TextInput
          autoFocus
          value={draft}
          onChangeText={setDraft}
          onBlur={() => {
            onRename(draft.trim() || room.label);
            setEditing(false);
          }}
          style={{ position: "absolute", top: 22, left: 0, right: 0, bottom: 0, textAlign: "center", color: theme.text, fontSize: 12 }}
        />
      ) : (
        <Pressable
          disabled={viewMode}
          onPress={() => !viewMode && setEditing(true)}
          style={{ position: "absolute", top: 22, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ color: theme.text, fontSize: 12, fontWeight: "700", textAlign: "center", textTransform: "uppercase" }}>
            {room.label}
          </Text>
        </Pressable>
      )}
      {!viewMode && (
        <Pressable onPress={onDelete} style={styles_del}>
          <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>×</Text>
        </Pressable>
      )}
      {!viewMode && <View {...resizeResponder.panHandlers} style={styles_resize} />}
    </View>
  );
};

const DoorBlock: React.FC<{
  door: SeatPlanDoor;
  theme: any;
  viewMode: boolean;
  selected: boolean;
  panResponder: ReturnType<typeof PanResponder.create>;
  onToggleRotate: () => void;
  onDelete: () => void;
}> = ({ door, theme, viewMode, selected, panResponder, onToggleRotate, onDelete }) => {
  return (
    <View
      {...(!viewMode ? panResponder.panHandlers : {})}
      style={{
        position: "absolute",
        left: door.x,
        top: door.y,
        width: door.w,
        height: door.h,
        backgroundColor: selected ? "#e8a33d" : "#8a6f3a",
        borderRadius: 2,
        ...(Platform.OS === "web" && !viewMode ? ({ cursor: "grab" } as any) : {}),
      }}
    >
      {!viewMode && (
        <>
          <Pressable
            onPress={onToggleRotate}
            style={[styles_rot, { width: 16, height: 16, bottom: -8, right: -8 }]}
          >
            <Text style={{ color: "#fff", fontSize: 9, fontWeight: "700" }}>⟳</Text>
          </Pressable>
          <Pressable
            onPress={onDelete}
            style={[styles_del, { width: 16, height: 16, top: -8, right: -8 }]}
          >
            <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>×</Text>
          </Pressable>
        </>
      )}
    </View>
  );
};

const PodBlock: React.FC<{
  pod: SeatPlanPod;
  theme: any;
  viewMode: boolean;
  selected: boolean;
  panResponder: ReturnType<typeof PanResponder.create>;
  onCellChange: (index: number, name: string) => void;
  onReshape: (deltaRows: number, deltaCols: number) => void;
  onTogglePortrait: () => void;
  onDelete: () => void;
  onOpenGrid: () => void;
  onOpenDevices: (name: string, index: number) => void;
  employeeNames: string[];
}> = ({ pod, theme, viewMode, selected, panResponder, onCellChange, onReshape, onTogglePortrait, onDelete, onOpenGrid, onOpenDevices, employeeNames }) => {
  const cellW = pod.portrait ? 52 : 96;
  const cellH = pod.portrait ? 96 : 52;
  const [openCellIndex, setOpenCellIndex] = useState<number | null>(null);

  return (
    <View
      {...(!viewMode ? panResponder.panHandlers : {})}
      style={{
        position: "absolute",
        left: pod.x,
        top: pod.y,
        width: pod.w,
        height: pod.h,
        backgroundColor: theme.surface,
        borderWidth: 1.5,
        borderColor: selected ? theme.primary : theme.borderStrong,
        borderRadius: 6,
        zIndex: openCellIndex !== null ? 1000 : 1,
        elevation: openCellIndex !== null ? 30 : 1,
      }}
    >
      <View {...(!viewMode ? panResponder.panHandlers : {})} style={{ height: 8 }} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", padding: 4, gap: 3, overflow: "visible" }}>
        {pod.seats.map((name, i) => (
          <View
            key={i}
            style={{
              zIndex: openCellIndex === i ? 9999 : 1,
              elevation: openCellIndex === i ? 40 : 1,
              position: "relative",
            }}
          >
            <PodCell
              name={name}
              w={cellW}
              h={cellH}
              portrait={!!pod.portrait}
              viewMode={viewMode}
              theme={theme}
              employeeNames={employeeNames}
              onChange={(v) => onCellChange(i, v)}
              onOpenChange={(open) => setOpenCellIndex(open ? i : null)}
              onOpenDevices={(name) => onOpenDevices(name, i)}
            />
          </View>
        ))}
      </View>
      {!viewMode && (
        <>
          <Pressable onPress={onOpenGrid} style={styles_grid}>
            <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>▦</Text>
          </Pressable>
          <Pressable onPress={onTogglePortrait} style={styles_rot}>
            <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>⟳</Text>
          </Pressable>
          <Pressable onPress={onDelete} style={styles_del}>
            <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>×</Text>
          </Pressable>
        </>
      )}
    </View>
  );
};

// ── Searchable name picker — same idea as the Assignee column's
// SearchableSelect on the web inventory table, rebuilt with RN primitives
// so it works inside seat/pod cells here. Free typing still works (in case
// the person isn't in the employee list); the dropdown is just a shortcut.
const NameSelect: React.FC<{
  value: string;
  options: string[];
  viewMode: boolean;
  theme: any;
  placeholder?: string;
  textStyle?: any;
  autoOpen?: boolean;
  onChange: (value: string) => void;
  onOpenChange?: (open: boolean) => void;
}> = ({ value, options, viewMode, theme, placeholder = "—", textStyle, autoOpen, onChange, onOpenChange }) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (autoOpen && !viewMode) setOpen(true);
  }, [autoOpen, viewMode]);
  const [query, setQuery] = useState(value);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<any>(null);

  // Web: clicking anywhere outside this control (canvas, another cell,
  // the modal backdrop, etc.) won't always fire the TextInput's onBlur,
  // so close explicitly on any outside pointerdown while open.
  useEffect(() => {
    if (Platform.OS !== "web" || !open) return;
    const handlePointerDown = (e: MouseEvent) => {
      const node = wrapperRef.current as any;
      if (node && node.contains && !node.contains(e.target as Node)) {
        setOpen(false);
        if (query.trim() === "" && value.trim() !== "") {
          onChange("");
        }
      }
    };
    document.addEventListener("mousedown", handlePointerDown, true);
    return () => document.removeEventListener("mousedown", handlePointerDown, true);
  }, [open, query, value]);

  // Hard-close the dropdown/input the instant we flip into view mode,
  // so a focused TextInput can't keep accepting keystrokes after the
  // toolbar toggle fires.
  useEffect(() => {
    if (viewMode) {
      setOpen(false);
      if (blurTimer.current) {
        clearTimeout(blurTimer.current);
        blurTimer.current = null;
      }
    }
  }, [viewMode]);

  useEffect(() => {
    if (!open) setQuery(value);
  }, [value, open]);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  const [highlightIndex, setHighlightIndex] = useState(-1);
  const rowRefs = useRef<Record<number, any>>({});

  // Reset the highlight whenever the dropdown opens or the filtered list changes
  // so a stale index from a previous query doesn't point at the wrong row.
  useEffect(() => {
    setHighlightIndex(-1);
    rowRefs.current = {};
  }, [open, query]);

  // Keep the highlighted row visible as arrow keys move past the
  // scrollable dropdown's current viewport.
  useEffect(() => {
    if (highlightIndex < 0) return;
    const node = rowRefs.current[highlightIndex];
    if (node && node.scrollIntoView) {
      node.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIndex]);

  const showUseRow = query.trim().length > 0 && !options.some((o) => o.toLowerCase() === query.trim().toLowerCase());
  // Combined list in the order rows are actually rendered, so index math
  // for arrow-key navigation matches what's on screen (the "Use ..." row
  // counts as index 0 when present).
  const navItems = showUseRow ? [query.trim(), ...filtered] : filtered;

  const commitHighlighted = () => {
    if (highlightIndex >= 0 && highlightIndex < navItems.length) {
      onChange(navItems[highlightIndex]);
      setOpen(false);
      return true;
    }
    return false;
  };

  const handleKeyDown = (e: any) => {
    if (!open) return;
    const key = e.nativeEvent?.key ?? e.key;
    if (key === "ArrowDown") {
      e.preventDefault?.();
      setHighlightIndex((i) => Math.min(navItems.length - 1, i + 1));
    } else if (key === "ArrowUp") {
      e.preventDefault?.();
      setHighlightIndex((i) => Math.max(0, i - 1));
    } else if (key === "Enter") {
      e.preventDefault?.();
      if (!commitHighlighted() && query.trim()) {
        onChange(query.trim());
        setOpen(false);
      }
    } else if (key === "Escape") {
      e.preventDefault?.();
      setOpen(false);
    }
  };

  if (viewMode) {
    const displayName = (() => {
      if (!value) return "";
      const tokens = value.trim().split(/\s+/);
      if (tokens.length <= 1) return tokens[0] ?? "";
      // Drop the last token (surname) always.
      let kept = tokens.slice(0, -1);
      // If what's left ends in a middle initial ("L." or "L"), drop that
      // too so we land on first name only; a full middle name ("Paul")
      // is kept as-is.
      if (kept.length > 1 && /^[A-Za-z]\.?$/.test(kept[kept.length - 1])) {
        kept = kept.slice(0, -1);
      }
      return kept.join(" ");
    })();
    return (
      <Text
        style={[
          textStyle,
          Platform.OS === "web"
            ? ({ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" } as any)
            : {},
        ]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {displayName || placeholder}
      </Text>
    );
  }

  return (
    <View ref={wrapperRef} style={{ width: "100%", position: "relative", overflow: "visible" }}>
      <TextInput
        value={open ? query : value}
        editable={!viewMode}
        multiline={false}
        numberOfLines={1}
        style={[
          textStyle,
          Platform.OS === "web" ? ({ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } as any) : {},
        ]}
        onChangeText={(t) => {
          if (viewMode) return; // belt-and-braces: never mutate in view mode
          setQuery(t);
          if (!open) setOpen(true);
        }}
        onBlur={() => {
          // slight delay so a tap on a dropdown row registers before we close,
          // and so a re-render from autosave (which can steal focus) doesn't
          // yank the dropdown closed mid-interaction
          blurTimer.current = setTimeout(() => {
            setOpen(false);
            if (query.trim() === "" && value.trim() !== "") {
              onChange("");
            }
          }, 300);
        }}
        onFocus={() => {
          if (blurTimer.current) {
            clearTimeout(blurTimer.current);
            blurTimer.current = null;
          }
          setQuery(value);
          setOpen(true);
        }}
        onKeyPress={handleKeyDown}
        {...(Platform.OS === "web" ? { onKeyDown: handleKeyDown } : {})}
        placeholder={placeholder}
      />
      {open && (
        <View
          style={{
            position: "absolute",
            top: "100%",
            left: -6,
            minWidth: 130,
            marginTop: 3,
            maxHeight: 150,
            backgroundColor: theme.surface,
            opacity: 1,
            borderWidth: 1,
            borderColor: theme.border,
            borderRadius: 6,
            zIndex: 9999,
            elevation: 60,
            ...(Platform.OS === "web" ? { boxShadow: "0 4px 14px rgba(0,0,0,0.35)" } as any : {}),
          }}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            {...(Platform.OS === "web" ? ({ className: "seatplan-nameselect-scroll" } as any) : {})}
            style={[
              { maxHeight: 150 },
              Platform.OS === "web" ? ({ scrollbarWidth: "thin", scrollbarColor: `${theme.borderStrong} ${theme.surface}` } as any) : {},
            ]}
            nestedScrollEnabled
          >
            {showUseRow && (
              <Pressable
                ref={(node) => { rowRefs.current[0] = node; }}
                onPress={() => {
                  onChange(query.trim());
                  setOpen(false);
                }}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 7,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.border,
                  backgroundColor: highlightIndex === 0 ? theme.border : "transparent",
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: "700", color: theme.primary }} numberOfLines={1}>
                  Use "{query.trim()}"
                </Text>
              </Pressable>
            )}
            {filtered.length === 0 ? (
              <Text style={{ fontSize: 11, color: theme.subtext, paddingHorizontal: 10, paddingVertical: 7 }}>
                No matches
              </Text>
            ) : (
              filtered.map((opt, i) => {
                const navIndex = showUseRow ? i + 1 : i;
                return (
                  <Pressable
                    key={opt}
                    ref={(node) => { rowRefs.current[navIndex] = node; }}
                    onPress={() => {
                      if (viewMode) return;
                      onChange(opt);
                      setOpen(false);
                    }}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 7,
                      backgroundColor: highlightIndex === navIndex ? theme.border : "transparent",
                    }}
                  >
                    <Text
                      style={{ fontSize: 11, fontWeight: opt === value ? "700" : "500", color: opt === value ? theme.primary : theme.text }}
                      numberOfLines={1}
                    >
                      {opt}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

const PodCell: React.FC<{
  name: string;
  w: number;
  h: number;
  portrait: boolean;
  viewMode: boolean;
  theme: any;
  employeeNames: string[];
  onChange: (value: string) => void;
  onOpenChange?: (open: boolean) => void;
  onOpenDevices: (name: string) => void;
}> = ({ name, w, h, portrait, viewMode, theme, employeeNames, onChange, onOpenChange, onOpenDevices }) => {
  const lastTap = useRef(0);
  const cellRef = useRef<any>(null);

  const [forceEditEmpty, setForceEditEmpty] = useState(false);

  const handleTouchTap = () => {
    if (!viewMode) return;
    const now = Date.now();
    if (now - lastTap.current < 300) {
      if (name.trim()) {
        onOpenDevices(name);
      } else {
        setForceEditEmpty(true);
      }
    }
    lastTap.current = now;
  };

  // Web: native double-click selects text before our tap-timing logic
  // gets a clean second press, so drive the popup straight off the DOM
  // dblclick event instead and block native selection on the 2nd+ click.
  useEffect(() => {
    if (Platform.OS !== "web" || !viewMode) return;
    const node = cellRef.current as any;
    if (!node || !node.addEventListener) return;

    const handleDoubleClick = (e: MouseEvent) => {
      e.preventDefault();
      if (name.trim()) {
        onOpenDevices(name);
      } else {
        setForceEditEmpty(true);
      }
    };
    const handleMouseDown = (e: MouseEvent) => {
      if (e.detail > 1) e.preventDefault();
    };

    node.addEventListener("dblclick", handleDoubleClick);
    node.addEventListener("mousedown", handleMouseDown);
    return () => {
      node.removeEventListener("dblclick", handleDoubleClick);
      node.removeEventListener("mousedown", handleMouseDown);
    };
  }, [viewMode, name]);

  return (
    <Pressable
      ref={cellRef}
      onPress={handleTouchTap}
      style={[
        {
          width: w,
          height: h,
          backgroundColor: name.trim() ? theme.primarySubtle : theme.surfaceRaised,
          borderWidth: 1.5,
          borderColor: name.trim() ? theme.primary : theme.borderStrong,
          borderStyle: name.trim() ? "solid" : "dashed",
          borderRadius: 3,
          alignItems: "center",
          justifyContent: "center",
          overflow: "visible",
        },
        Platform.OS === "web" ? ({ userSelect: "none" } as any) : {},
      ]}
    >
      <NameSelect
        value={name}
        options={employeeNames}
        viewMode={viewMode && !forceEditEmpty}
        autoOpen={forceEditEmpty}
        theme={theme}
        placeholder="—"
        onChange={(v) => {
          onChange(v);
          setForceEditEmpty(false);
        }}
        onOpenChange={onOpenChange}
        textStyle={{
          textAlign: "center",
          fontSize: 11,
          fontWeight: "600",
          color: name.trim() ? theme.primarySubtleText : theme.subtext,
          width: "100%",
        }}
      />
    </Pressable>
  );
};

const SeatBlock: React.FC<{
  seat: SeatPlanSeat;
  theme: any;
  viewMode: boolean;
  selected: boolean;
  panResponder: ReturnType<typeof PanResponder.create>;
  onNameChange: (name: string) => void;
  onToggleRotate: () => void;
  onDelete: () => void;
  onOpenDevices: (name: string) => void;
  employeeNames: string[];
}> = ({ seat, theme, viewMode, selected, panResponder, onNameChange, onToggleRotate, onDelete, onOpenDevices, employeeNames }) => {
  const rotated = seat.rot === 90;
  const w = rotated ? SEAT_H : SEAT_W;
  const h = rotated ? SEAT_W : SEAT_H;
  const lastTap = useRef(0);

  const [forceEditEmpty, setForceEditEmpty] = useState(false);

  const handleNameAreaPress = () => {
    if (!viewMode) return; // already editable via normal Edit mode
    const now = Date.now();
    if (now - lastTap.current < 300) {
      if (seat.name.trim()) {
        onOpenDevices(seat.name);
      } else {
        setForceEditEmpty(true);
      }
    }
    lastTap.current = now;
  };

  const nameAreaRef = useRef<any>(null);

  // Web: the browser's native "select text on double-click" fires before
  // our tap-timing logic gets a clean second press, so drive the popup
  // straight off the DOM dblclick event instead, and suppress native
  // text selection on the 2nd+ click.
  useEffect(() => {
    if (Platform.OS !== "web" || !viewMode) return;
    const node = nameAreaRef.current as any;
    if (!node || !node.addEventListener) return;

    const handleDoubleClick = (e: MouseEvent) => {
      e.preventDefault();
      if (seat.name.trim()) {
        onOpenDevices(seat.name);
      } else {
        setForceEditEmpty(true);
      }
    };
    const handleMouseDown = (e: MouseEvent) => {
      if (e.detail > 1) e.preventDefault(); // block native text selection on 2nd+ click
    };

    node.addEventListener("dblclick", handleDoubleClick);
    node.addEventListener("mousedown", handleMouseDown);
    return () => {
      node.removeEventListener("dblclick", handleDoubleClick);
      node.removeEventListener("mousedown", handleMouseDown);
    };
  }, [viewMode, seat.name]);

  return (
    <View
      style={{
        position: "absolute",
        left: seat.x,
        top: seat.y,
        width: w,
        height: h,
        backgroundColor: seat.name.trim() ? theme.primarySubtle : theme.surfaceRaised,
        borderWidth: 1.5,
        borderColor: selected ? theme.primary : seat.name.trim() ? theme.primary : theme.borderStrong,
        borderRadius: 5,
        flexDirection: rotated ? "row" : "column",
      }}
    >
      <View {...(!viewMode ? panResponder.panHandlers : {})} style={rotated ? { width: 11, height: "100%" } : { height: 11, width: "100%" }} />
      <Pressable
        ref={nameAreaRef}
        onPress={handleNameAreaPress}
        style={[
          { flex: 1, alignItems: "center", justifyContent: "center", overflow: "visible", width: "100%" },
          Platform.OS === "web" ? ({ userSelect: "none" } as any) : {},
        ]}
      >
        <NameSelect
          value={seat.name}
          options={employeeNames}
          viewMode={viewMode && !forceEditEmpty}
          autoOpen={forceEditEmpty}
          theme={theme}
          placeholder="Unassigned"
          onChange={(v) => {
            onNameChange(v);
            setForceEditEmpty(false);
          }}
          textStyle={{
            textAlign: "center",
            fontSize: 11,
            fontWeight: "600",
            color: seat.name.trim() ? theme.primarySubtleText : theme.subtext,
            width: "100%",
          }}
        />
      </Pressable>
      {!viewMode && (
        <>
          <Pressable onPress={onToggleRotate} style={[styles_rot, { bottom: -8, right: -8, width: 18, height: 18 }]}>
            <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>⟳</Text>
          </Pressable>
          <Pressable onPress={onDelete} style={[styles_del, { top: -8, right: -8, width: 18, height: 18 }]}>
            <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>×</Text>
          </Pressable>
        </>
      )}
    </View>
  );
};

// ── Shared small styles (kept outside makeStyles since they don't need theme) ──
const styles_del = {
  position: "absolute" as const,
  top: -9,
  right: -9,
  width: 20,
  height: 20,
  borderRadius: 10,
  backgroundColor: "#c1503f",
  alignItems: "center" as const,
  justifyContent: "center" as const,
};
const styles_rot = {
  position: "absolute" as const,
  bottom: -9,
  right: -9,
  width: 20,
  height: 20,
  borderRadius: 10,
  backgroundColor: "#5c7a94",
  alignItems: "center" as const,
  justifyContent: "center" as const,
};
const styles_resize = {
  position: "absolute" as const,
  right: -2,
  bottom: -2,
  width: 16,
  height: 16,
  backgroundColor: "#e8a33d",
  borderRadius: 3,
  ...(Platform.OS === "web" ? ({ cursor: "nwse-resize" } as any) : {}),
};
const styles_grid = {
  position: "absolute" as const,
  top: -9,
  left: -9,
  width: 20,
  height: 20,
  borderRadius: 10,
  backgroundColor: "#8a6f3a",
  alignItems: "center" as const,
  justifyContent: "center" as const,
};

const styles_modalStepBtn = {
  width: 26,
  height: 26,
  borderRadius: 6,
  backgroundColor: "#e8e2d3",
  alignItems: "center" as const,
  justifyContent: "center" as const,
};
const styles_modalStepText = { fontSize: 15, fontWeight: "700" as const, color: "#14243b" };

function makeStyles(theme: any) {
  return {
    container: { flex: 1, backgroundColor: theme.background },
    centered: { alignItems: "center" as const, justifyContent: "center" as const },
    toolbar: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      backgroundColor: theme.surface,
      flexWrap: "wrap" as const,
    },
    title: { color: theme.text, fontSize: 18, fontWeight: "700" as const, marginRight: 8 },
    modeBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 7 },
    modeBtnView: { backgroundColor: "#2f6690" },
    modeBtnEdit: { backgroundColor: "#c1503f" },
    modeBtnText: { color: "#fff", fontSize: 12.5, fontWeight: "600" as const },
    toolBtn: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 7,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceRaised,
    },
    toolBtnText: { color: theme.text, fontSize: 12.5, fontWeight: "600" as const },
    dangerBtn: { borderColor: "#8f3a2d" },
    dangerBtnText: { color: "#c1503f" },
    saveIndicator: { flexDirection: "row" as const, alignItems: "center" as const, gap: 5, marginLeft: "auto" as const },
    saveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#4caf6b" },
    saveDotSaving: { backgroundColor: "#e8a33d" },
    saveDotError: { backgroundColor: "#c1503f" },
    saveText: { color: theme.subtext, fontSize: 11 },
    canvas: {
      backgroundColor: "transparent",
      position: "relative" as const,
    },
  };
}

export default SeatPlanPage;