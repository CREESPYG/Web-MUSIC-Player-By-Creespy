export interface Theme {
  id: string;
  name: string;
  tagline: string;
  bg0: string;
  bg1: string;
  ink: string;
  dim: string;
  acc0: string;
  acc1: string;
  acc2: string;
  orbs: string[];
}

export const THEMES: Theme[] = [
  {
    id: "nordic-material",
    name: "Nordic M3",
    tagline: "Flat Scandinavian Material 3",
    bg0: "#0e131a",
    bg1: "#161e28",
    ink: "#e5edf5",
    dim: "#8295ad",
    acc0: "#88c0d0",
    acc1: "#81a1c1",
    acc2: "#8fbcbb",
    orbs: ["#1b2432", "#1f2b3b", "#223347"],
  },
  {
    id: "nordic-polar",
    name: "Nordic Polar",
    tagline: "Slate & Arctic White",
    bg0: "#0b0f14",
    bg1: "#131922",
    ink: "#f0f5fa",
    dim: "#7b8ea5",
    acc0: "#5e81ac",
    acc1: "#88c0d0",
    acc2: "#d8dee9",
    orbs: ["#151d27", "#192433", "#1e2d3f"],
  },
  {
    id: "nordic-sage",
    name: "Nordic Sage",
    tagline: "Fjord Pine & Moss",
    bg0: "#0c1310",
    bg1: "#141f19",
    ink: "#eaf3ec",
    dim: "#7d9787",
    acc0: "#a3be8c",
    acc1: "#8fbcbb",
    acc2: "#d8dee9",
    orbs: ["#17261e", "#1b3024", "#15241b"],
  },
  {
    id: "nordic-aurora",
    name: "Nordic Dusk",
    tagline: "Tonal Arctic Heather",
    bg0: "#120f17",
    bg1: "#1c1724",
    ink: "#f1ebf7",
    dim: "#8e809c",
    acc0: "#b48ead",
    acc1: "#81a1c1",
    acc2: "#88c0d0",
    orbs: ["#231a2e", "#2b1e38", "#1d1627"],
  },
  {
    id: "material-you",
    name: "Material You",
    tagline: "Google Pixel M3 Azure",
    bg0: "#0e141b",
    bg1: "#17202a",
    ink: "#e1edfc",
    dim: "#8ca2bd",
    acc0: "#7bd0ff",
    acc1: "#3b9eff",
    acc2: "#a8e5ff",
    orbs: ["#152538", "#1a2c42", "#132130"],
  },
  {
    id: "material-amber",
    name: "Material Ochre",
    tagline: "M3 Tonal Amber",
    bg0: "#16130c",
    bg1: "#241e14",
    ink: "#f6ebd7",
    dim: "#9c8e77",
    acc0: "#f5ba42",
    acc1: "#e09f25",
    acc2: "#ffd885",
    orbs: ["#2c2214", "#382c19", "#211a0f"],
  },
  {
    id: "material-coral",
    name: "Material Terracotta",
    tagline: "M3 Warm Clay",
    bg0: "#181110",
    bg1: "#251b18",
    ink: "#fbebe8",
    dim: "#9f8682",
    acc0: "#ff8a7a",
    acc1: "#e56554",
    acc2: "#ffb4ab",
    orbs: ["#2f1c19", "#3b221e", "#241613"],
  },
  {
    id: "material-emerald",
    name: "Material Botanical",
    tagline: "M3 Spruce & Mint",
    bg0: "#0c1511",
    bg1: "#14221b",
    ink: "#e1f3e8",
    dim: "#7d9987",
    acc0: "#72d596",
    acc1: "#41b56f",
    acc2: "#a6f5c2",
    orbs: ["#152b20", "#1b3829", "#112219"],
  },
];
