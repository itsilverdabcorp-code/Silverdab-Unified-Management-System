import React from "react";

// Web-only (renders a DOM <p>): shows the exact address (unit / floor /
// building / landmark) the requestor typed in the booking modal, directly
// under the matching pickup / drop-off line in the admin review modals.
// Renders nothing when the requestor left it blank.
export default function TripExactAddressLine({
  text,
  indent,
  theme,
}: {
  text: string | null | undefined;
  indent: number;
  theme: any;
}) {
  const value = text?.trim();
  if (!value) return null;
  return (
    <p
      style={{ color: theme.subtext, paddingLeft: indent }}
      className="text-[11.5px] leading-snug mt-0.5 break-words"
    >
      {value}
    </p>
  );
}
