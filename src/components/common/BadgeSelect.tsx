import React, { useEffect, useRef, useState } from "react";
import { useTheme } from "../../theme/ThemeContext";

type BadgeOption = {
  label: string;
  value: string;
  badgeClass?: string;
  /** Fallback inline colors used when badgeClass isn't provided (e.g. options
   * that only carry raw hex values, like the IT Inventory dropdowns). */
  bgColor?: string;
  textColor?: string;
};

type BadgeSelectProps = {
  value: string;
  displayName: string;
  options: BadgeOption[];
  placeholder?: string;
  onChange: (value: string, label: string) => void;
  className?: string;
  badgeWidth?: number;
};

const defaultBadge =
  "inline-flex items-center rounded-lg px-3 py-1 text-sm font-medium";

/** True when badgeClass is missing/blank — i.e. we need to fall back to
 * bgColor/textColor inline styling instead of Tailwind classes. */
const hasBadgeClass = (badgeClass?: string) =>
  !!badgeClass && badgeClass.trim().length > 0;

export default function BadgeSelect({
  value,
  displayName,
  options,
  placeholder = "Select",
  onChange,
  className = "",
  badgeWidth = 130,
}: BadgeSelectProps) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(
    (option) => option.value === value && option.value !== "",
  );

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const badgeStyle = (option?: BadgeOption): React.CSSProperties => {
    if (!option || hasBadgeClass(option.badgeClass)) return {};
    return {
      backgroundColor: option.bgColor ?? theme.surfaceRaised,
      color: option.textColor ?? theme.text,
    };
  };

  return (
    <div ref={wrapRef} className={`relative min-w-[140px] ${className}`}>
      <button type="button" onClick={() => setOpen((prev) => !prev)}>
        {selectedOption ? (
          <span
            className={
              hasBadgeClass(selectedOption.badgeClass)
                ? selectedOption.badgeClass
                : defaultBadge
            }
            style={{
              borderRadius: "8px",
              width: `${badgeWidth}px`,
              fontWeight: 500,
              ...badgeStyle(selectedOption),
            }}
          >
            <span className="flex items-center justify-between w-full">
              <span>{selectedOption.label}</span>
              <span style={{ opacity: 0.7, fontSize: "11px" }}>▾</span>
            </span>
          </span>
        ) : (
          <span
            className="inline-flex items-center justify-between px-3 py-1 text-sm"
            style={{ color: theme.subtext, width: `${badgeWidth}px` }}
          >
            <span>—</span>
            <span style={{ opacity: 0.7, fontSize: "11px" }}>▾</span>
          </span>
        )}
      </button>

      {open && (
        <ul
          className="absolute z-50 left-0 mt-2 overflow-hidden rounded-2xl shadow-lg text-sm"
          style={{
            backgroundColor: theme.surface,
            border: `1px solid ${theme.border}`,
            minWidth: "max-content",
          }}
        >
          {options.map((option) => (
            <li
              key={option.value}
              style={{ borderBottom: `1px solid ${theme.border}` }}
              className="last:border-b-0"
            >
              <button
                type="button"
                onClick={() => {
                  onChange(option.value, option.label);
                  setOpen(false);
                }}
                className="w-full px-4 py-1.5 flex items-center transition-colors"
                style={{ backgroundColor: "transparent" }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = theme.bgHover)
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = "transparent")
                }
              >
                {option.value === "" ? (
                  <span
                    className="inline-flex items-center px-2 py-1 text-sm"
                    style={{ color: theme.subtext }}
                  >
                    —
                  </span>
                ) : (
                  <span
                    className={
                      hasBadgeClass(option.badgeClass)
                        ? option.badgeClass
                        : defaultBadge
                    }
                    style={{
                      borderRadius: "8px",
                      width: `${badgeWidth}px`,
                      justifyContent: "flex-start",
                      fontWeight: 500,
                      ...badgeStyle(option),
                    }}
                  >
                    {option.label}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}