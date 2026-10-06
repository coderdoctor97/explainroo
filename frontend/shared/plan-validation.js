// Existing Scene plan limits, shared by the form and the API boundary.
export const PLAN_FIELDS = {
  wordsPerScene: { label: 'words per scene', min: 8, max: 120 },
  maxSceneSeconds: { label: 'longest scene seconds', min: 4, max: 40 },
};

export function validatePlanSettings(plan) {
  const errors = {};
  if (!plan || typeof plan !== 'object') return errors;
  for (const [name, { label, min, max }] of Object.entries(PLAN_FIELDS)) {
    if (!Object.hasOwn(plan, name)) continue; // Partial PATCH is supported.
    const value = plan[name];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
      errors[name] = `Enter ${label} as a whole number from ${min} to ${max}.`;
    }
  }
  return errors;
}
