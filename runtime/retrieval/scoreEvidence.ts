import type { EvidenceRef } from '../contracts/types.ts';

const TRUST_SCORES = {
  trusted: 1,
  partially_trusted: 0.65,
  untrusted: 0.25,
} as const;

export function scoreEvidence(evidenceRefs: EvidenceRef[]): number {
  if (evidenceRefs.length === 0) {
    return 0;
  }

  const trustTotal = evidenceRefs.reduce((total, evidence) => total + TRUST_SCORES[evidence.trust_level], 0);
  const countBonus = Math.min(0.15, Math.max(0, evidenceRefs.length - 1) * 0.05);

  return Math.min(1, trustTotal / evidenceRefs.length + countBonus);
}
