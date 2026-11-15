import { validateNewReport, type NewReport } from "./reports/validation";

export type WizardDraft = { type: "lost" | "found"; name: string; category: string; description: string; place: string; itemDate: string };
export type WizardStep = 1 | 2 | 3;
export const blankDraft = (type: WizardDraft["type"]): WizardDraft => ({ type, name: "", category: "", description: "", place: "", itemDate: "" });
export const nextStep = (step: WizardStep): WizardStep => step < 3 ? (step + 1) as WizardStep : 3;
export const previousStep = (step: WizardStep): WizardStep => step > 1 ? (step - 1) as WizardStep : 1;

export function stepError(step: WizardStep, draft: WizardDraft): string {
  if (step === 1) {
    if (!draft.name.trim()) return "Enter an item name to continue.";
    if (draft.name.trim().length > 120) return "Item name must be 120 characters or fewer.";
    if (!draft.category.trim() || draft.category.trim().length > 60) return "Choose a category to continue.";
    if (!draft.description.trim()) return "Add a description to continue.";
    if (draft.description.trim().length > 3000) return "Description must be 3000 characters or fewer.";
  }
  if (step === 2) {
    if (!draft.place.trim()) return "Choose and confirm a campus location, or enter one manually.";
    if (draft.place.trim().length > 200) return "Location must be 200 characters or fewer.";
    if (draft.itemDate && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(draft.itemDate) || Number.isNaN(new Date(draft.itemDate).getTime()))) return "Enter a valid date and time, or leave it blank.";
  }
  return "";
}

export function reportPayload(draft: WizardDraft): NewReport {
  const payload: NewReport = { report_type: draft.type, title: draft.name, category: draft.category, description: draft.description, location: draft.place };
  if (draft.itemDate) payload.item_date = new Date(draft.itemDate).toISOString();
  const result = validateNewReport(payload);
  if (!result.data) throw new Error(result.error);
  return result.data;
}

export function parseDraft(value: unknown): { draft: WizardDraft; step: WizardStep } | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (!row.draft || typeof row.draft !== "object") return null;
  const draft = row.draft as Record<string, unknown>;
  if (draft.type !== "lost" && draft.type !== "found") return null;
  if (!(["name", "category", "description", "place", "itemDate"] as const).every(key => typeof draft[key] === "string")) return null;
  const restored = draft as WizardDraft;
  if (restored.name.length > 120 || restored.category.length > 60 || restored.description.length > 3000 || restored.place.length > 200 || restored.itemDate.length > 30) return null;
  return { draft: restored, step: row.step === 2 || row.step === 3 ? row.step : 1 };
}
