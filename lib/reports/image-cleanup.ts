import { isReportImagePath } from "./images";

type Storage = { remove(paths: string[]): Promise<{ error: unknown }> };
export async function cleanupDetachedImage(storage: Storage, path: string, ownerId: string, reportId: string, action: "deleted" | "replaced" | "removed"): Promise<string | undefined> {
  const prefix = action === "deleted" ? "Report deleted" : action === "replaced" ? "New photo saved" : "Photo removed from report";
  if (!isReportImagePath(path, ownerId, reportId)) {
    console.error("Unexpected detached report image path", { reportId, action });
    return `${prefix}, but the old photo path needs manual cleanup. Please contact support.`;
  }
  const result = await storage.remove([path]);
  if (result.error) {
    console.error("Detached report image cleanup failed", { reportId, action, error: result.error });
    return `${prefix}, but storage cleanup failed. Please contact support.`;
  }
  return undefined;
}
