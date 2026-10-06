export type PlanFieldName = 'wordsPerScene' | 'maxSceneSeconds';
export const PLAN_FIELDS: Record<PlanFieldName, { label: string; min: number; max: number }>;
export function validatePlanSettings(plan: unknown): Partial<Record<PlanFieldName, string>>;
