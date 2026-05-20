export type Rgb = [number, number, number];

export interface OrbTone {
  core: Rgb;
  glow: Rgb;
  rim: Rgb;
}

export const theme = {
  background: {
    base: [0.008, 0.01, 0.014] as Rgb,
    upper: [0.03, 0.036, 0.044] as Rgb,
    warmth: [0.11, 0.085, 0.065] as Rgb,
    depth: [0.012, 0.018, 0.026] as Rgb,
  },
  friendTones: [
    { core: [0.98, 0.58, 0.68], glow: [0.58, 0.12, 0.24], rim: [1.0, 0.82, 0.86] },
    { core: [0.55, 0.88, 1.0], glow: [0.08, 0.36, 0.58], rim: [0.78, 0.96, 1.0] },
    { core: [0.98, 0.78, 0.38], glow: [0.58, 0.34, 0.08], rim: [1.0, 0.9, 0.62] },
    { core: [0.78, 0.66, 1.0], glow: [0.28, 0.2, 0.58], rim: [0.9, 0.84, 1.0] },
    { core: [0.62, 0.96, 0.78], glow: [0.12, 0.46, 0.3], rim: [0.82, 1.0, 0.9] },
    { core: [1.0, 0.62, 0.44], glow: [0.62, 0.22, 0.1], rim: [1.0, 0.82, 0.68] },
    { core: [0.58, 0.94, 0.9], glow: [0.08, 0.42, 0.44], rim: [0.78, 1.0, 0.96] },
    { core: [0.95, 0.5, 0.82], glow: [0.52, 0.12, 0.38], rim: [1.0, 0.78, 0.94] },
    { core: [0.82, 0.92, 0.5], glow: [0.38, 0.48, 0.12], rim: [0.94, 1.0, 0.72] },
    { core: [0.72, 0.82, 1.0], glow: [0.2, 0.3, 0.62], rim: [0.86, 0.92, 1.0] },
  ] as OrbTone[],
  youTone: {
    core: [0.98, 0.98, 0.94],
    glow: [0.72, 0.76, 0.72],
    rim: [1.0, 1.0, 0.96],
  } as OrbTone,
};

export function toneFor(index: number): OrbTone {
  return theme.friendTones[index % theme.friendTones.length];
}

export function rgbCss(rgb: Rgb, alpha = 1): string {
  const [r, g, b] = rgb.map((value) => Math.round(value * 255));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
