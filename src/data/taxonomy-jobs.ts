/**
 * Jobs taxonomy — ISCO-08 four-level occupational classification.
 * Source: ILO ISCO-08 "ISCO-08 EN Structure and definitions.xlsx".
 *
 * Generated via scripts/parse-isco.ts — do not edit by hand.
 * Re-exports the parsed JSON as typed TaxonomyNode[].
 */

import type { TaxonomyNode } from "./taxonomy-industries";
import raw from "./isco-08.json";

export const JOBS_TAXONOMY: TaxonomyNode[] = raw as TaxonomyNode[];
