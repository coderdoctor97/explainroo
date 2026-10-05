// The five looks a video can have. The front end shows them as a dropdown;
// each one maps to a theme the engine already knows, so the video really does
// change look, transitions and music.
import { THEMES } from '../../engine/themes.js';

export const LAYOUTS = {
  sync: 'the narration appears word by word as the voice says it',
  cards: 'the key words of each scene as cards',
  poster: 'one big line and one number per scene',
};

export const LOOKS = {
  paper: {
    id: 'paper',
    name: 'Paper, hand drawn',
    blurb: 'Marker lines on warm paper. Brush scene changes. Warm music.',
    theme: 'paper',
    transition: 'brush',
    music: 'warm',
    fits: 'friendly explanations, teaching, storytelling',
  },
  clean: {
    id: 'clean',
    name: 'Clean product',
    blurb: 'Flat cards with soft shadows. Slide scene changes. Upbeat music.',
    theme: 'clean',
    transition: 'slide',
    music: 'upbeat',
    fits: 'products, business, software',
  },
  chalk: {
    id: 'chalk',
    name: 'Chalkboard',
    blurb: 'Chalk on a green board. Brush scene changes. Calm music.',
    theme: 'chalk',
    transition: 'brush',
    music: 'calm',
    fits: 'lessons, science, maths',
  },
  blueprint: {
    id: 'blueprint',
    name: 'Blueprint',
    blurb: 'White drafting lines on blueprint blue. Wipe scene changes. Tech music.',
    theme: 'blueprint',
    transition: 'wipe',
    music: 'tech',
    fits: 'engineering, architecture, systems',
  },
  midnight: {
    id: 'midnight',
    name: 'Midnight',
    blurb: 'Dark background, glowing accents. Zoom scene changes. Tech music.',
    theme: 'midnight',
    transition: 'zoom',
    music: 'tech',
    fits: 'developer tools, night reading, anything technical',
  },
};

// The colours come from the engine's own themes, so the swatch in the
// dropdown is the video's real palette.
export function styleList() {
  return Object.values(LOOKS).map((look) => {
    const theme = THEMES[look.theme];
    return {
      ...look,
      swatch: {
        bg: theme.bg,
        ink: theme.ink,
        muted: theme.muted,
        accent: theme.colors[theme.accent] || theme.ink,
      },
      fonts: Object.fromEntries(Object.entries(theme.fonts).map(([role, f]) => [role, f.family])),
    };
  });
}

export function styleFor(id) {
  return LOOKS[id] || LOOKS.paper;
}
