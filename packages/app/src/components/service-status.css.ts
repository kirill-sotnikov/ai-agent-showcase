import { style } from "@vanilla-extract/css";

export const panel = style({
  marginTop: "2rem",
  padding: "1.5rem",
  background: "#ffffff",
  border: "1px solid #dce0e8",
  borderRadius: "0.75rem",
});

export const button = style({
  padding: "0.75rem 1rem",
  border: 0,
  borderRadius: "0.5rem",
  background: "#244ed8",
  color: "#ffffff",
  font: "inherit",
  cursor: "pointer",
  ":disabled": { opacity: 0.6, cursor: "wait" },
  ":focus-visible": { outline: "2px solid #244ed8", outlineOffset: 3 },
});
