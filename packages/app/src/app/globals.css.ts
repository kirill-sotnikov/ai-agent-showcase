import { globalStyle } from "@vanilla-extract/css";

globalStyle(":root", {
  colorScheme: "light",
  fontFamily: "Arial, Helvetica, sans-serif",
  background: "#f7f8fa",
  color: "#172033",
});

globalStyle("*", { boxSizing: "border-box" });
globalStyle("body", { margin: 0 });
