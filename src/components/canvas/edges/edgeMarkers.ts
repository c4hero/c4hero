/** Encode an edge id into a marker-id-safe suffix. Injective: every char
 *  outside [A-Za-z0-9-] (including `_`) becomes `_<hex>_`, so distinct edge
 *  ids (e.g. dynamic-view `rel#2`) never share a marker. */
export function markerIdSuffix(edgeId: string): string {
  return edgeId.replace(/[^A-Za-z0-9-]/g, (c) => `_${c.codePointAt(0)!.toString(16)}_`)
}
