module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        "surface-dim": "#0e0e0e",
        "outline": "#767575",
        "surface-variant": "#262626",
        "on-surface-variant": "#adaaaa",
        // ── Surface & neutral ──────────────────────────────────────────────
        "surface-dim":              "#0e0e0e",
        "surface":                  "#0e0e0e",
        "background":               "#0e0e0e",
        "surface-container-lowest": "#000000",
        "surface-container-low":    "#131313",
        "surface-container":        "#1a1919",
        "surface-container-high":   "#201f1f",
        "surface-container-highest":"#262626",
        "surface-variant":          "#262626",
        "surface-bright":           "#2c2c2c",
        "outline":                  "#767575",
        "outline-variant":          "#484847",
        "inverse-surface":          "#fcf9f8",
        "inverse-on-surface":       "#565555",
        "on-surface":               "#ffffff",
        "on-surface-variant":       "#adaaaa",
        "on-background":            "#ffffff",
        "surface-tint":             "#F09AB5",
        // ── Primary — rosa câncer de mama ──────────────────────────────────
        "primary":                  "#F09AB5",
        "primary-dim":              "#D4607E",
        "primary-container":        "#F09AB5",
        "primary-fixed":            "#F09AB5",
        "primary-fixed-dim":        "#D4607E",
        "on-primary":               "#3D0018",
        "on-primary-container":     "#5C0028",
        "on-primary-fixed":         "#000000",
        "on-primary-fixed-variant": "#6B0030",
        "inverse-primary":          "#B03060",
        // ── Secondary (ciano) ─────────────────────────────────────────────
        "secondary":                "#00e3fd",
        "secondary-dim":            "#00d4ec",
        "secondary-container":      "#006875",
        "secondary-fixed":          "#26e6ff",
        "secondary-fixed-dim":      "#00d7f0",
        "on-secondary":             "#004d57",
        "on-secondary-container":   "#e8fbff",
        "on-secondary-fixed":       "#003a42",
        "on-secondary-fixed-variant":"#005964",
        // ── Tertiary ──────────────────────────────────────────────────────
        "tertiary":                 "#ff9ec7",
        "tertiary-dim":             "#ef7aaf",
        "tertiary-container":       "#ff87bc",
        "tertiary-fixed":           "#ff8cbe",
        "tertiary-fixed-dim":       "#f27db1",
        "on-tertiary":              "#6d0f44",
        "on-tertiary-container":    "#600039",
        "on-tertiary-fixed":        "#37001f",
        "on-tertiary-fixed-variant":"#6e1045",
        // ── Error ─────────────────────────────────────────────────────────
        "error":                    "#ff6e84",
        "error-dim":                "#d73357",
        "error-container":          "#a70138",
        "on-error":                 "#490013",
        "on-error-container":       "#ffb2b9"
      },
      fontFamily: {
        "headline": ["Manrope", "sans-serif"],
        "body": ["Inter", "sans-serif"],
        "label": ["Inter", "sans-serif"]
      }
    },
  },
  plugins: [],
}
