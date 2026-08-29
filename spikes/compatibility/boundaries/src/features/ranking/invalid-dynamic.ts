export async function invalidDynamicBoundaryImport(): Promise<string> {
  const module = await import("../discovery/domain/internal.ts");
  return module.discoveryInternal;
}
