// One function per scene in script.md. Each function draws one frame of its
// scene, and s.t is the time in seconds since the scene started. Give elements
// an `at` time (seconds, a spoken word or "#marker") and the look animates
// them in. The full scene API is in AGENTS.md in the explainroo folder.

export default {
  hook(s) {
    s.title('{{title}}', { y: s.H * 0.4 });
    s.icon('mouse-pointer-click', { y: s.H * 0.66, size: 130, at: '#click', color: 'accent' });
  },

  steps(s) {
    s.text('Three steps', { font: 'display', size: 76, y: 170, at: 0 });
    const xs = s.row(3, { width: 1180 });
    s.box('Find the server', { id: 'find', x: xs[0], y: 560, icon: 'search', color: 'blue', at: '#one' });
    s.box('Ask for the page', { id: 'ask', x: xs[1], y: 560, icon: 'send', color: 'green', at: '#two' });
    s.box('Draw it', { id: 'draw', x: xs[2], y: 560, icon: 'paintbrush', color: 'purple', at: '#three' });
    s.arrow('find', 'ask', { at: s.cue('Then') - 0.4 });
    s.arrow('ask', 'draw', { at: s.cue('Finally') - 0.4 });
  },

  outro(s) {
    s.number(3, { suffix: ' steps', y: s.H * 0.42, at: 0.2 });
    s.subtitle('in less time than a blink', { at: '#fast', y: s.H * 0.62 });
  },
};
