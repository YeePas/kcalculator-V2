import { describe, expect, it } from 'vitest';

import {
  analyzeDishNameWithAI,
  buildAiTextFallbackProposal,
  createProposalFromNutritionText,
  extractDishNameFromFreeText,
} from '../../src/ai/dish-import-service.js';

describe('extractDishNameFromFreeText', () => {
  it('extracts the dish name from a natural-language calorie question', () => {
    expect(extractDishNameFromFreeText("mag ik de calorieen voor pasta alla norma met alle macro's"))
      .toBe('pasta alla norma');
  });

  it('keeps a plain dish name intact', () => {
    expect(extractDishNameFromFreeText('caesar salad')).toBe('caesar salad');
  });
});

describe('createProposalFromNutritionText', () => {
  it('parses a pasted macro summary into a proposal', () => {
    const proposal = createProposalFromNutritionText(`🍝 Voedingswaarden per portie
Nutrient Hoeveelheid
🔥 Calorieën ±650 kcal
🍞 Koolhydraten 85 g
🍗 Eiwit 20 g
🧈 Vet 25 g
🌾 Vezels 8 g`);

    expect(proposal).not.toBeNull();
    expect(proposal?.calories).toBe(650);
    expect(proposal?.carbs_g).toBe(85);
    expect(proposal?.protein_g).toBe(20);
    expect(proposal?.fat_g).toBe(25);
    expect(proposal?.fiber_g).toBe(8);
    expect(proposal?.providerUsed).toBe('manual-parse');
  });

  it('prefers kcal over kJ and supports European number formats from labels or websites', () => {
    const proposal = createProposalFromNutritionText(`Soort\tPer 100 Gram
Energie\t1.125 kJ (269 kcal)
Vet\t14 g
waarvan verzadigd\t2,7 g
waarvan onverzadigd\t11 g
Koolhydraten\t26 g
waarvan suikers\t3,4 g
Voedingsvezel\t2,5 g
Eiwitten\t8,5 g
Zout\t1,4 g`);

    expect(proposal).not.toBeNull();
    expect(proposal?.calories).toBe(269);
    expect(proposal?.fat_g).toBe(14);
    expect(proposal?.carbs_g).toBe(26);
    expect(proposal?.protein_g).toBe(8.5);
    expect(proposal?.fiber_g).toBe(2.5);
  });
});

describe('buildAiTextFallbackProposal', () => {
  it('can recover macros from a non-JSON AI answer', () => {
    const proposal = buildAiTextFallbackProposal(`🍝 Voedingswaarden per portie
Calorieën 650 kcal
Koolhydraten 85 g
Eiwit 20 g
Vet 25 g
Vezels 8 g`, 'mag ik de calorieen voor pasta alla norma met alle macro\'s', 'openai');

    expect(proposal.title.toLowerCase()).toBe('pasta alla norma');
    expect(proposal.providerUsed).toBe('openai');
    expect(proposal.calories).toBe(650);
    expect(proposal.confidence).toBe('medium');
  });
});

describe('analyzeDishNameWithAI', () => {
  it('returns the locally parsed proposal when macro text is pasted', async () => {
    const proposal = await analyzeDishNameWithAI(`Voedingswaarden per portie
Calorieën 650 kcal
Koolhydraten 85 g
Eiwit 20 g
Vet 25 g
Vezels 8 g`);

    expect(proposal.calories).toBe(650);
    expect(proposal.providerUsed).toBe('manual-parse');
    expect(proposal.confidence).toBe('high');
  });
});
