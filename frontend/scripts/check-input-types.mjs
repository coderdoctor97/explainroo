// A rendered-DOM contract for the Studio fields audited in docs/input-types.md.
// Check the attribute, not just .type: browsers silently default missing or
// misspelled types to text. New field purposes must be reviewed explicitly.
const purposes = [
  [/^(Video topic|video title|heading of .+|add a word to scene .+)$/, 'text'],
  [/^(words per scene|longest scene seconds)$/, 'number'],
  [/^choose (transcript\.txt|timestamps\.json|voiceover\.wav|an image)$/, 'file'],
  [/^(Voice-over position|pace|lead|hold|end)$/, 'range'],
  [/^(on|off|keep the explainroo\.com watermark)$/, 'checkbox'],
];

export function checkInputTypes(document) {
  const problems = [];
  for (const input of document.querySelectorAll('input')) {
    const name = input.getAttribute('aria-label') || Array.from(input.labels || [], (label) => label.textContent.trim()).join(' ');
    const expected = purposes.find(([pattern]) => pattern.test(name))?.[1];
    if (!expected) problems.push(`unreviewed input purpose: ${name || '(unnamed)'}`);
    else if (input.getAttribute('type') !== expected) {
      problems.push(`${name}: expected explicit type="${expected}", got ${JSON.stringify(input.getAttribute('type'))}`);
    }
  }
  return problems;
}
