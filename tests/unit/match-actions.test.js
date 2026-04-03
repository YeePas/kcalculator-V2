import { describe, it, expect } from 'vitest';
import { deriveAiSuggestedPortion } from '../../src/modals/match-actions.js';

describe('deriveAiSuggestedPortion', () => {
  it('uses explicit gram values from the AI portion label', () => {
    expect(deriveAiSuggestedPortion({ naam: 'Lasagne', portie: '350 gram' }, 'avondeten')).toBe(350);
  });

  it('uses explicit ml values for drinks', () => {
    expect(deriveAiSuggestedPortion({ naam: 'Sinaasappelsap', portie: '1 glas', ml: 200 }, 'drinken')).toBe(200);
  });

  it('falls back to a realistic default portion based on the product name', () => {
    expect(deriveAiSuggestedPortion({ naam: 'Banaan', portie: '1 portie' }, 'ontbijt')).toBe(120);
  });
});
