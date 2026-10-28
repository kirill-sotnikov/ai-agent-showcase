import {
  createGlobalTheme,
  globalStyle,
  keyframes,
  style,
} from "@vanilla-extract/css";

export const vars = createGlobalTheme(":root", {
  green: "#254b40",
  muted: "#8a908a",
  border: "#e5e7df",
  minimumFontSize: "14px",
});

const pulseAnimation = keyframes({ "50%": { opacity: 0.3 } });

export const appShell = style({
  display: "flex",
  flexDirection: "column",
  height: "100dvh",
});

export const appHeader = style({
  height: "89px",
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 36px",
  borderBottom: `1px solid ${vars.border}`,
  gap: "20px",
  background: "#fafbf7",
});

export const brand = style({
  display: "flex",
  alignItems: "center",
  gap: "12px",
  fontSize: "20px",
  fontWeight: 600,
  letterSpacing: "-0.6px",
});

export const brandMark = style({
  background: vars.green,
  color: "#fff",
  display: "grid",
  placeItems: "center",
  width: "40px",
  height: "44px",
  borderRadius: "13px 13px 15px 15px",
});

export const active = style({});

export const localIndicator = style({
  display: "flex",
  gap: "8px",
  alignItems: "center",
  fontSize: vars.minimumFontSize,
  color: "#8c9389",
  letterSpacing: "0.1px",
});

export const welcomeBanner = style({
  display: "flex",
  alignItems: "flex-start",
  gap: "14px",
  margin: "18px 22px 0",
  padding: "18px 20px",
  border: "1px solid #ccd9c5",
  borderRadius: "12px",
  background: "#edf4e6",
  color: vars.green,
  fontSize: vars.minimumFontSize,
  lineHeight: 1.6,
});

globalStyle(`${welcomeBanner} p`, { margin: "4px 0 0" });

export const welcomeDismiss = style({
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
  marginLeft: "auto",
  minWidth: "32px",
  minHeight: "32px",
  borderRadius: "6px",
  ":hover": { background: "#dce8d5" },
});

export const dot = style({});

export const online = style({});

export const assistantGrid = style({
  flex: "1 0 0",
  width: "100%",
  height: "calc(100dvh - 89px)",
  minHeight: "560px",
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  padding: "22px",
  gap: "18px",
  maxWidth: "1900px",
  margin: "auto",
});

export const panel = style({
  border: `1px solid ${vars.border}`,
  borderRadius: "13px",
  background: "#fdfefa",
  overflow: "hidden",
  minWidth: 0,
  minHeight: 0,
  boxShadow: "0 2px 3px #28332d02",
});

export const chatPanel = style({
  display: "flex",
  flexDirection: "column",
});

export const panelHeading = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "26px 27px 24px",
  borderBottom: `1px solid ${vars.border}`,
});

export const eyebrow = style({
  fontSize: vars.minimumFontSize,
  fontWeight: 600,
  color: "#8f998d",
  lineHeight: 1.5,
});

export const connection = style({
  display: "flex",
  alignItems: "center",
  gap: "7px",
  fontSize: vars.minimumFontSize,
  color: "#788570",
  background: "#f0f4e9",
  padding: "7px 10px",
  border: "1px solid #e5ebdc",
  borderRadius: "30px",
});

export const rightPanels = style({
  display: "grid",
  gridTemplateRows: "1fr 1fr",
  gap: "18px",
  minHeight: 0,
  minWidth: 0,
});

export const conversation = style({
  flex: 1,
  minHeight: 0,
  overflow: "auto",
  overscrollBehavior: "contain",
  padding: "24px 28px",
});

export const welcome = style({
  maxWidth: "370px",
  margin: "8% auto 0",
  textAlign: "center",
});

export const welcomeIcon = style({
  width: "70px",
  height: "70px",
  margin: "0 auto 24px",
  display: "grid",
  placeItems: "center",
  borderRadius: "23px",
  background: "#edf2e8",
  color: "#668266",
  transform: "rotate(-7deg)",
});

export const suggestions = style({
  display: "grid",
  gap: "8px",
  textAlign: "left",
  margin: "29px auto 0",
});

export const composerArea = style({
  padding: "12px 24px 0",
});

export const runStatus = style({
  minHeight: "23px",
  flexWrap: "wrap",
  display: "flex",
  alignItems: "center",
  gap: "7px",
  fontSize: vars.minimumFontSize,
  color: "#92988b",
  marginBottom: "7px",
});

export const composer = style({
  display: "flex",
  alignItems: "flex-end",
  gap: "10px",
  background: "#fff",
  border: "1px solid #dce3d7",
  borderRadius: "10px",
  padding: "13px",
  boxShadow: "0 2px 4px #243d3110",
});

export const button = style({
  display: "inline-flex",
  justifyContent: "center",
  alignItems: "center",
  gap: "9px",
  background: vars.green,
  border: `1px solid ${vars.green}`,
  color: "#fff",
  borderRadius: "7px",
  padding: "10px 15px",
  fontWeight: 500,
  fontSize: vars.minimumFontSize,
  whiteSpace: "nowrap",
  transition: "background 0.15s",
});

export const secondary = style({});

export const inputHint = style({
  fontSize: vars.minimumFontSize,
  textAlign: "center",
  color: "#a1a799",
  padding: "11px 0",
});

export const chatFootnote = style({
  flexWrap: "wrap",
  padding: "12px 25px",
  borderTop: "1px solid #edf0e7",
  display: "flex",
  alignItems: "center",
  gap: "6px",
  color: "#8f998b",
  fontSize: vars.minimumFontSize,
});

export const compactHeading = style({
  padding: "19px 23px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  borderBottom: `1px solid ${vars.border}`,
  gap: "10px",
});

export const headingLabel = style({
  display: "flex",
  alignItems: "center",
  gap: "10px",
  color: "#6c8065",
});

export const count = style({
  background: "#edf1e6",
  color: "#7a8d6b",
  fontSize: vars.minimumFontSize,
  padding: "3px 6px",
  borderRadius: "5px",
  minWidth: "21px",
  textAlign: "center",
  fontWeight: 500,
});

export const cartPanel = style({});

export const logPanel = style({});

export const cartScroll = style({});

export const logScroll = style({
  margin: 0,
  padding: "16px 18px",
  background: "#1c211e",
  color: "#dce4dc",
  fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
  fontSize: vars.minimumFontSize,
  lineHeight: 1.7,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  tabSize: 2,
  selectors: {
    "&:focus-visible": {
      outline: "2px solid #a4bd94",
      outlineOffset: "-2px",
    },
  },
});

export const emptyCart = style({
  textAlign: "center",
  maxWidth: "310px",
  margin: "20px auto",
  padding: "0 15px",
});

export const emptyIllustration = style({
  height: "66px",
  width: "80px",
  display: "grid",
  placeItems: "center",
  color: "#bac6a9",
  background: "#f1f4e8",
  borderRadius: "50%",
  margin: "0 auto 12px",
});

export const cartTotal = style({
  padding: "16px 23px 19px",
  borderTop: `1px solid ${vars.border}`,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  background: "#fafcf5",
  fontSize: vars.minimumFontSize,
  fontWeight: 500,
});

export const muted = style({
  color: "#969d90",
});

export const small = style({
  fontSize: vars.minimumFontSize,
});

export const cartItem = style({
  display: "flex",
  position: "relative",
  gap: "14px",
  padding: "20px 22px",
  borderBottom: "1px solid #ecf0e5",
  alignItems: "flex-start",
});

export const productTile = style({
  width: "67px",
  height: "74px",
  borderRadius: "8px",
  display: "grid",
  placeItems: "center",
  color: "#8a977b",
  flexShrink: 0,
});

export const sage = style({});

export const sand = style({});

export const lavender = style({});

export const cartItemMain = style({
  minWidth: 0,
  flex: 1,
});

export const linePrice = style({
  fontSize: vars.minimumFontSize,
  fontWeight: 500,
  marginTop: "18px",
});

export const quantityRow = style({
  display: "flex",
  alignItems: "center",
  gap: "14px",
  marginTop: "10px",
});

export const stepper = style({
  display: "flex",
  alignItems: "center",
  border: "1px solid #dde4d4",
  borderRadius: "5px",
  height: "26px",
});

export const textButton = style({
  fontSize: vars.minimumFontSize,
  color: "#7c8b70",
  padding: "4px 0",
  textDecoration: "underline",
  textUnderlineOffset: "3px",
});

export const danger = style({
  color: "#ab7669",
});

export const messages = style({
  display: "grid",
  gap: "28px",
  padding: "4px 0 18px",
});

export const message = style({
  display: "flex",
  alignItems: "flex-start",
  gap: "12px",
  minWidth: 0,
});

export const messageAvatar = style({
  width: "29px",
  height: "29px",
  borderRadius: "9px",
  background: "#edf2e6",
  color: "#7f966a",
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
  fontSize: vars.minimumFontSize,
});

export const user = style({});

export const messageMeta = style({
  fontSize: vars.minimumFontSize,
  fontWeight: 600,
  color: "#435c3c",
  display: "flex",
  alignItems: "center",
  gap: "10px",
  margin: "3px 0 9px",
});

export const savedTag = style({
  fontSize: vars.minimumFontSize,
  borderRadius: "3px",
  background: "#eef4e7",
  padding: "3px 5px",
  color: "#6e8b5c",
});

export const settingsPage = style({
  maxWidth: "1050px",
  padding: "40px 30px",
  margin: "auto",
});

export const settingsTitle = style({
  marginBottom: "30px",
});

export const settingsCard = style({
  background: "#fdfefa",
  border: `1px solid ${vars.border}`,
  borderRadius: "12px",
  padding: "27px",
  marginBottom: "23px",
});

export const identityCard = style({
  display: "grid",
  gridTemplateColumns: "1fr 1.7fr",
  gap: "45px",
});

export const sectionNumber = style({
  fontSize: vars.minimumFontSize,
  color: "#abb39b",
  letterSpacing: "1px",
});

export const formFooter = style({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginTop: "12px",
});

export const catalogHeader = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "20px",
  marginBottom: "22px",
});

export const catalogItem = style({
  display: "flex",
  alignItems: "center",
  gap: "18px",
  borderTop: "1px solid #e8eddf",
  padding: "22px 0",
});

export const catalogItemInfo = style({
  flex: 1,
  minWidth: 0,
});

export const catalogActions = style({
  display: "grid",
  gap: "8px",
  marginLeft: "14px",
  minWidth: "35px",
});

export const attributeTags = style({
  display: "flex",
  flexWrap: "wrap",
  gap: "5px",
  marginTop: "9px",
});

export const settingsFooter = style({
  fontSize: vars.minimumFontSize,
  color: "#9da78f",
  display: "flex",
  justifyContent: "space-between",
  gap: "20px",
  alignItems: "center",
  padding: "2px 4px 22px",
});

export const productForm = style({
  background: "#f3f6ed",
  border: "1px solid #dce5d1",
  borderRadius: "8px",
  padding: "22px",
  marginBottom: "25px",
});

export const formGrid = style({
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "16px",
});

export const fullWidth = style({
  gridColumn: "1/-1",
});

export const formButtons = style({
  display: "flex",
  justifyContent: "flex-end",
  gap: "10px",
  marginTop: "18px",
});

export const notice = style({});

export const pending = style({
  margin: "12px",
});

export const settingsEmpty = style({
  textAlign: "center",
  padding: "45px",
});

export const fieldError = style({
  color: "#a25b4c !important",
  marginTop: "12px !important",
});

export const errorBanner = style({
  position: "relative",
  padding: "12px 25px",
  background: "#f5e9df",
  color: "#8f5644",
  fontSize: vars.minimumFontSize,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "20px",
});

export const loading = style({
  padding: "80px",
  textAlign: "center",
  color: "#7e8e73",
});

export const srOnly = style({
  position: "absolute",
  width: "1px",
  height: "1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
});

export const pulse = style({
  animation: `${pulseAnimation} 1.3s ease-in-out infinite`,
});

export const assistant = style({});

export const stop = style({});

export const catalogCard = style({});

export const catalogList = style({});

globalStyle(`:root`, {
  fontFamily: 'Inter, "Segoe UI", Arial, sans-serif',
  color: "#252d2a",
  background: "#f5f4ef",
  fontSynthesis: "none",
  WebkitFontSmoothing: "antialiased",
  fontWeight: 400,
  fontSize: vars.minimumFontSize,
});

globalStyle(`*`, {
  boxSizing: "border-box",
});

globalStyle(`body`, {
  margin: 0,
});

globalStyle(
  `button,
input,
textarea`,
  {
    font: "inherit",
  },
);

globalStyle(
  `button,
a,
input,
textarea`,
  {
    WebkitTapHighlightColor: "transparent",
  },
);

globalStyle(`button`, {
  cursor: "pointer",
});

globalStyle(`button:disabled`, {
  cursor: "not-allowed",
  opacity: 0.42,
});

globalStyle(
  `button:focus-visible,
a:focus-visible,
input:focus-visible,
textarea:focus-visible,
summary:focus-visible`,
  {
    outline: "3px solid #86af97",
    outlineOffset: "3px",
  },
);

globalStyle(`a`, {
  color: "inherit",
  textDecoration: "none",
});

globalStyle(
  `h1,
h2,
h3,
p`,
  {
    margin: 0,
  },
);

globalStyle(
  `h1,
h2,
h3`,
  {
    fontWeight: 550,
    letterSpacing: "-0.025em",
  },
);

globalStyle(`button`, {
  border: 0,
  background: "none",
  color: "inherit",
});

globalStyle(`svg`, {
  flexShrink: 0,
});

globalStyle(`${brand} small`, {
  display: "block",
  fontSize: vars.minimumFontSize,
  fontWeight: 500,
  letterSpacing: "1.65px",
  color: "#91988e",
  marginTop: "5px",
});

globalStyle(`${appHeader} nav`, {
  display: "flex",
  border: "1px solid #e5e7df",
  borderRadius: "9px",
  padding: "4px",
  gap: "4px",
  background: "#f0f2eb",
});

globalStyle(`${appHeader} nav a`, {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "10px 18px",
  color: "#747d73",
  fontSize: vars.minimumFontSize,
  borderRadius: "6px",
});

globalStyle(`${appHeader} nav a${active}`, {
  background: "#fff",
  color: "#264d3f",
  boxShadow: "0 1px 4px #26332d10",
});

globalStyle(
  `${localIndicator} > span,
${dot}`,
  {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    display: "inline-block",
    background: "#a2a79f",
    flexShrink: 0,
  },
);

globalStyle(
  `${online},
${localIndicator} > span`,
  {
    background: "#7a9c79",
  },
);

globalStyle(`${panelHeading} h1`, {
  fontSize: "24px",
  marginTop: "5px",
  lineHeight: 1.2,
});

globalStyle(`${welcomeIcon} svg`, {
  transform: "rotate(7deg)",
});

globalStyle(`${welcome} > h2`, {
  fontFamily: 'Georgia, "Times New Roman", serif',
  fontSize: "34px",
  lineHeight: 1.16,
  fontWeight: 400,
  letterSpacing: "-1px",
  maxWidth: "340px",
  margin: "12px auto 15px",
  color: "#304039",
});

globalStyle(`${welcome} > p`, {
  fontSize: vars.minimumFontSize,
  lineHeight: 1.8,
  color: "#858d82",
  margin: "auto",
  maxWidth: "300px",
});

globalStyle(`${suggestions} button`, {
  border: "1px solid #e3e8dc",
  background: "#f7f9f2",
  position: "relative",
  textAlign: "left",
  padding: "13px 34px 13px 16px",
  fontSize: vars.minimumFontSize,
  lineHeight: 1.4,
  borderRadius: "9px",
  color: "#75816f",
  transition: "background 0.15s",
});

globalStyle(`${suggestions} button:hover`, {
  background: "#eff4e9",
});

globalStyle(`${suggestions} button > span`, {
  display: "block",
  fontSize: vars.minimumFontSize,
  fontWeight: 600,
  color: "#3b5243",
  marginBottom: "5px",
});

globalStyle(`${suggestions} button > svg`, {
  position: "absolute",
  right: "13px",
  top: "calc(50% - 8px)",
  color: "#94a38a",
});

globalStyle(`${composer} textarea`, {
  border: 0,
  resize: "none",
  flex: 1,
  minWidth: 0,
  background: "transparent",
  padding: "1px",
  fontSize: vars.minimumFontSize,
  lineHeight: 1.6,
  outline: "none",
  color: "#33453b",
});

globalStyle(`${composer} textarea::placeholder`, {
  color: "#a3aa9c",
});

globalStyle(`${button}:hover:not(:disabled)`, {
  background: "#366450",
});

globalStyle(`${button}${secondary}`, {
  color: "#52634e",
  background: "#fff",
  borderColor: "#dae1d4",
});

globalStyle(`${inputHint} span`, {
  margin: "0 6px",
});

globalStyle(`${chatFootnote} > span:last-child`, {
  marginLeft: "auto",
});

globalStyle(`${headingLabel} h2`, {
  fontSize: "16px",
  color: "#354331",
});

globalStyle(
  `${cartPanel},
${logPanel}`,
  {
    display: "flex",
    flexDirection: "column",
  },
);

globalStyle(
  `${cartScroll},
${logScroll}`,
  {
    overflow: "auto",
    minHeight: 0,
    flex: 1,
    overscrollBehavior: "contain",
  },
);

globalStyle(`${emptyCart} h3`, {
  fontFamily: "Georgia, serif",
  fontWeight: 400,
  fontSize: "20px",
  color: "#5f6c56",
  letterSpacing: "-0.3px",
});

globalStyle(`${emptyCart} p`, {
  fontSize: vars.minimumFontSize,
  color: "#929b87",
  lineHeight: 1.8,
  marginTop: "9px",
});

globalStyle(`${cartTotal} small`, {
  display: "block",
  fontSize: vars.minimumFontSize,
  color: "#9aa28d",
  marginTop: "5px",
  fontWeight: 400,
});

globalStyle(`${cartTotal} strong`, {
  fontSize: "24px",
  letterSpacing: "-0.8px",
  color: "#3b533a",
  fontWeight: 500,
});

globalStyle(`${productTile} svg`, {
  width: "52px",
  height: "52px",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.3,
  strokeLinecap: "round",
  strokeLinejoin: "round",
});

globalStyle(`${productTile}${sage}`, {
  background: "#edf1e2",
});

globalStyle(`${productTile}${sand}`, {
  background: "#f1ebe1",
  color: "#a29479",
});

globalStyle(`${productTile}${lavender}`, {
  background: "#eeedf2",
  color: "#9590a2",
});

globalStyle(`${cartItem} h3`, {
  fontSize: vars.minimumFontSize,
  margin: "4px 60px 5px 0",
  overflowWrap: "anywhere",
});

globalStyle(`${stepper} button`, {
  width: "24px",
  height: "24px",
  fontSize: vars.minimumFontSize,
  color: "#6a7d5c",
});

globalStyle(`${stepper} input`, {
  width: "30px",
  border: 0,
  textAlign: "center",
  background: "none",
  fontSize: vars.minimumFontSize,
  padding: 0,
  appearance: "textfield",
  MozAppearance: "textfield",
  color: "#55694b",
});

globalStyle(`${stepper} input::-webkit-inner-spin-button`, {
  appearance: "none",
});

globalStyle(`${message}${user} ${messageAvatar}`, {
  background: "#ebece6",
  color: "#9a9c90",
});

globalStyle(`${message} > div`, {
  minWidth: 0,
  flex: 1,
});

globalStyle(`${messageMeta} time`, {
  fontSize: vars.minimumFontSize,
  fontWeight: 400,
  color: "#a2a995",
});

globalStyle(`${message} p`, {
  fontSize: vars.minimumFontSize,
  lineHeight: 1.85,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  color: "#63715c",
});

globalStyle(`${message}${user} p`, {
  color: "#536349",
  background: "#f1f4e9",
  padding: "12px 15px",
  borderRadius: "0 10px 10px 10px",
});

globalStyle(`${message} small`, {
  display: "block",
  fontSize: vars.minimumFontSize,
  color: "#ab9074",
  marginTop: "6px",
});

globalStyle(`${settingsTitle} h1`, {
  fontFamily: "Georgia, serif",
  fontSize: "40px",
  fontWeight: 400,
  margin: "9px 0",
  color: "#344d3c",
});

globalStyle(`${settingsTitle} p`, {
  fontSize: vars.minimumFontSize,
  color: "#8c9983",
});

globalStyle(`${settingsCard} h2`, {
  fontSize: "20px",
  marginTop: "8px",
  marginBottom: "11px",
  display: "flex",
  alignItems: "center",
  gap: "10px",
});

globalStyle(`${settingsCard} p`, {
  fontSize: vars.minimumFontSize,
  lineHeight: 1.8,
  color: "#929d87",
});

globalStyle(`${settingsCard} label`, {
  display: "flex",
  flexDirection: "column",
  gap: "9px",
  fontSize: vars.minimumFontSize,
  fontWeight: 500,
  color: "#6a7a5e",
});

globalStyle(
  `${settingsCard} textarea,
${settingsCard} input`,
  {
    border: "1px solid #dce4d4",
    borderRadius: "6px",
    padding: "12px",
    fontSize: vars.minimumFontSize,
    color: "#5d7052",
    lineHeight: 1.7,
    background: "#fff",
    maxWidth: "100%",
    width: "100%",
  },
);

globalStyle(`${identityCard} > form > textarea`, {
  marginTop: "9px",
  resize: "vertical",
});

globalStyle(`${formFooter} > span`, {
  fontSize: vars.minimumFontSize,
  color: "#a2ac96",
});

globalStyle(`${catalogHeader} > div`, {
  maxWidth: "520px",
});

globalStyle(`${catalogItemInfo} h3`, {
  fontSize: vars.minimumFontSize,
  margin: "4px 0 7px",
  overflowWrap: "anywhere",
});

globalStyle(`${catalogItemInfo} > p`, {
  fontSize: vars.minimumFontSize,
  maxWidth: "500px",
  overflowWrap: "anywhere",
});

globalStyle(`${catalogItem} > strong`, {
  fontSize: vars.minimumFontSize,
  fontWeight: 500,
  color: "#5b7050",
  whiteSpace: "nowrap",
});

globalStyle(`${attributeTags} span`, {
  fontSize: vars.minimumFontSize,
  background: "#f1f5e9",
  color: "#99a68b",
  borderRadius: "4px",
  padding: "3px 6px",
});

globalStyle(`${productForm} h3`, {
  fontSize: "16px",
  marginBottom: "18px",
});

globalStyle(`${productForm} fieldset`, {
  border: 0,
  padding: 0,
  margin: 0,
  minWidth: 0,
});

globalStyle(`${formGrid} textarea`, {
  resize: "vertical",
});

globalStyle(`${formGrid} small`, {
  fontSize: vars.minimumFontSize,
  color: "#99a88c",
  lineHeight: 1.6,
});

globalStyle(
  `${notice},
${pending}`,
  {
    fontSize: vars.minimumFontSize,
    color: "#8b8e62",
    background: "#f1f1de",
    padding: "12px",
    borderRadius: "6px",
    marginBottom: "18px",
  },
);

globalStyle(`${errorBanner} button`, {
  fontSize: vars.minimumFontSize,
  textDecoration: "underline",
  display: "flex",
  alignItems: "center",
});

globalStyle(`${errorBanner} ~ ${assistantGrid}`, {
  height: "calc(100dvh - 135px)",
});

globalStyle(`${welcome}`, {
  "@media": {
    "(min-height: 1000px)": {
      marginTop: "18%",
    },
  },
});

globalStyle(`${emptyCart}`, {
  "@media": {
    "(min-height: 1000px)": {
      marginTop: "12%",
    },
  },
});

globalStyle(`${appHeader}`, {
  "@media": {
    "(max-width: 1000px)": {
      padding: "0 23px",
    },
  },
});

globalStyle(`${localIndicator}`, {
  "@media": {
    "(max-width: 1000px)": {
      display: "none",
    },
  },
});

globalStyle(`${assistantGrid}`, {
  "@media": {
    "(max-width: 1000px)": {
      padding: "14px",
      gap: "13px",
    },
  },
});

globalStyle(`${rightPanels}`, {
  "@media": {
    "(max-width: 1000px)": {
      gap: "13px",
    },
  },
});

globalStyle(`${panelHeading}`, {
  "@media": {
    "(max-width: 1000px)": {
      padding: "22px",
    },
  },
});

globalStyle(`${welcome} > h2`, {
  "@media": {
    "(max-width: 1000px)": {
      fontSize: "30px",
    },
  },
});

globalStyle(`${conversation}`, {
  "@media": {
    "(max-width: 1000px)": {
      padding: "24px 20px",
    },
  },
});

globalStyle(`${linePrice}`, {
  "@media": {
    "(max-width: 1000px)": {
      fontSize: vars.minimumFontSize,
    },
  },
});

globalStyle(`${cartItem}`, {
  "@media": {
    "(max-width: 1000px)": {
      padding: "18px 16px",
      gap: "10px",
    },
  },
});

globalStyle(`${cartItem} ${productTile}`, {
  "@media": {
    "(max-width: 1000px)": {
      width: "51px",
      height: "61px",
    },
  },
});

globalStyle(`${cartItem} h3`, {
  "@media": {
    "(max-width: 1000px)": {
      marginRight: 0,
      fontSize: vars.minimumFontSize,
    },
  },
});

globalStyle(`${compactHeading}`, {
  "@media": {
    "(max-width: 1000px)": {
      padding: "18px",
    },
  },
});

globalStyle(`${identityCard}`, {
  "@media": {
    "(max-width: 1000px)": {
      gap: "25px",
    },
  },
});

globalStyle(`${appHeader}`, {
  "@media": {
    "(max-width: 720px)": {
      height: "76px",
      padding: "0 16px",
      gap: "12px",
    },
  },
});

globalStyle(`${brand}`, {
  "@media": {
    "(max-width: 720px)": {
      fontSize: "16px",
      gap: "8px",
    },
  },
});

globalStyle(`${brand} small`, {
  "@media": {
    "(max-width: 720px)": {
      fontSize: vars.minimumFontSize,
      letterSpacing: "0.8px",
    },
  },
});

globalStyle(`${brandMark}`, {
  "@media": {
    "(max-width: 720px)": {
      width: "32px",
      height: "36px",
      borderRadius: "10px",
    },
  },
});

globalStyle(`${appHeader} nav a`, {
  "@media": {
    "(max-width: 720px)": {
      padding: "9px 11px",
      fontSize: vars.minimumFontSize,
    },
  },
});

globalStyle(`${appHeader} nav svg`, {
  "@media": {
    "(max-width: 720px)": {
      display: "none",
    },
  },
});

globalStyle(`${assistantGrid}`, {
  "@media": {
    "(max-width: 720px)": {
      display: "flex",
      flexDirection: "column",
      height: "auto !important",
      minHeight: 0,
      padding: "13px",
      gap: "14px",
    },
  },
});

globalStyle(`${chatPanel}`, {
  "@media": {
    "(max-width: 720px)": {
      height: "650px",
      minHeight: "570px",
    },
  },
});

globalStyle(`${rightPanels}`, {
  "@media": {
    "(max-width: 720px)": {
      display: "flex",
      flexDirection: "column",
      gap: "14px",
    },
  },
});

globalStyle(`${cartPanel}`, {
  "@media": {
    "(max-width: 720px)": {
      height: "380px",
    },
  },
});

globalStyle(`${logPanel}`, {
  "@media": {
    "(max-width: 720px)": {
      height: "390px",
    },
  },
});

globalStyle(`${welcome}`, {
  "@media": {
    "(max-width: 720px)": {
      marginTop: "7%",
    },
  },
});

globalStyle(`${welcome} > h2`, {
  "@media": {
    "(max-width: 720px)": {
      fontSize: "32px",
    },
  },
});

globalStyle(`${panelHeading} h1`, {
  "@media": {
    "(max-width: 720px)": {
      fontSize: "22px",
    },
  },
});

globalStyle(`${eyebrow}`, {
  "@media": {
    "(max-width: 720px)": {
      fontSize: vars.minimumFontSize,
    },
  },
});

globalStyle(`${settingsPage}`, {
  "@media": {
    "(max-width: 720px)": {
      padding: "27px 16px",
    },
  },
});

globalStyle(`${settingsCard}`, {
  "@media": {
    "(max-width: 720px)": {
      padding: "20px",
    },
  },
});

globalStyle(`${identityCard}`, {
  "@media": {
    "(max-width: 720px)": {
      display: "block",
    },
  },
});

globalStyle(`${identityCard} form`, {
  "@media": {
    "(max-width: 720px)": {
      marginTop: "20px",
    },
  },
});

globalStyle(`${catalogHeader}`, {
  "@media": {
    "(max-width: 720px)": {
      alignItems: "flex-start",
      gap: "12px",
    },
  },
});

globalStyle(`${catalogHeader} ${button}`, {
  "@media": {
    "(max-width: 720px)": {
      fontSize: vars.minimumFontSize,
      padding: "9px",
    },
  },
});

globalStyle(`${catalogHeader} p`, {
  "@media": {
    "(max-width: 720px)": {
      fontSize: vars.minimumFontSize,
    },
  },
});

globalStyle(`${catalogItem}`, {
  "@media": {
    "(max-width: 720px)": {
      gap: "12px",
      flexWrap: "wrap",
    },
  },
});

globalStyle(`${catalogItem} ${productTile}`, {
  "@media": {
    "(max-width: 720px)": {
      width: "50px",
      height: "60px",
    },
  },
});

globalStyle(`${catalogItemInfo}`, {
  "@media": {
    "(max-width: 720px)": {
      flexBasis: "calc(100% - 65px)",
    },
  },
});

globalStyle(`${catalogItem} > strong`, {
  "@media": {
    "(max-width: 720px)": {
      marginLeft: "62px",
      fontSize: vars.minimumFontSize,
    },
  },
});

globalStyle(`${catalogActions}`, {
  "@media": {
    "(max-width: 720px)": {
      display: "flex",
      marginLeft: "auto",
      gap: "18px",
    },
  },
});

globalStyle(`${settingsFooter}`, {
  "@media": {
    "(max-width: 720px)": {
      alignItems: "flex-start",
      fontSize: vars.minimumFontSize,
    },
  },
});

globalStyle(`${formGrid}`, {
  "@media": {
    "(max-width: 720px)": {
      gridTemplateColumns: "1fr",
    },
  },
});

globalStyle(`${fullWidth}`, {
  "@media": {
    "(max-width: 720px)": {
      gridColumn: "auto",
    },
  },
});

globalStyle(`${formFooter}`, {
  "@media": {
    "(max-width: 720px)": {
      gap: "10px",
    },
  },
});

globalStyle(`${settingsTitle} h1`, {
  "@media": {
    "(max-width: 720px)": {
      fontSize: "34px",
    },
  },
});

globalStyle(
  `*,
  *::before,
  *::after`,
  {
    "@media": {
      "(prefers-reduced-motion: reduce)": {
        animation: "none !important",
        scrollBehavior: "auto",
      },
    },
  },
);
