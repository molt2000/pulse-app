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
    { core: [0.92, 0.9, 0.84], glow: [0.56, 0.53, 0.47], rim: [1.0, 0.97, 0.9] },
    { core: [0.86, 0.9, 0.88], glow: [0.42, 0.5, 0.48], rim: [0.93, 1.0, 0.96] },
    { core: [0.9, 0.86, 0.8], glow: [0.5, 0.43, 0.38], rim: [1.0, 0.93, 0.86] },
    { core: [0.86, 0.88, 0.94], glow: [0.4, 0.44, 0.53], rim: [0.92, 0.96, 1.0] },
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
