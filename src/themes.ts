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
    id: "abyss",
    name: "Abyss",
    tagline: "deep-sea neon",
    bg0: "#040913",
    bg1: "#0a1a30",
    ink: "#e9f3ff",
    dim: "#90a8c6",
    acc0: "#33d6ff",
    acc1: "#4f8dff",
    acc2: "#79f2c8",
    orbs: ["#1fb6ff", "#3a63ff", "#2ee6a8"],
  },
  {
    id: "ember",
    name: "Ember",
    tagline: "molten late-night",
    bg0: "#120604",
    bg1: "#1d0c07",
    ink: "#fff1e6",
    dim: "#c79f8b",
    acc0: "#ffb43a",
    acc1: "#ff5e3a",
    acc2: "#ffd97a",
    orbs: ["#ff7a1a", "#ff3d5e", "#ffc53d"],
  },
  {
    id: "verdant",
    name: "Verdant",
    tagline: "bioluminescent grove",
    bg0: "#04120b",
    bg1: "#0a2417",
    ink: "#eafff2",
    dim: "#8fc0a5",
    acc0: "#a4f441",
    acc1: "#31e0a1",
    acc2: "#e2ff9e",
    orbs: ["#35d46d", "#a4f441", "#19c99d"],
  },
  {
    id: "orchid",
    name: "Orchid",
    tagline: "electric bloom",
    bg0: "#140718",
    bg1: "#251031",
    ink: "#ffeefb",
    dim: "#c39ecb",
    acc0: "#ff77d4",
    acc1: "#a86bff",
    acc2: "#ffb3ec",
    orbs: ["#ff5ec4", "#8f5bff", "#ff9de2"],
  },
];
