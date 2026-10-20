import { describe, expect, it } from 'vitest';
import '../../../../i18n';
import { getBudgetDisplayText } from '../priceLevelUtils';
import { toBudgetPlace, toCanonicalBudgetPlace, toGuide } from '../../api/guidesViewModel';
import { guideBudgetPlaceSchema } from '../../../../../../tunes/shared/explorersGuideContract';

// Guide budgets are money too: any currency, at that currency's own precision, 0 as Free,
// and no USD invented anywhere.
describe('guide budget display', () => {
  it.each([
    [{ budgetAmount: 450.5, budgetCurrency: 'INR' }, '₹450.50'],
    [{ budgetAmount: 100, budgetCurrency: 'JPY' }, '¥100'],
    [{ budgetAmount: 1.25, budgetCurrency: 'KWD' }, 'KWD 1.250'],
    [{ budgetAmount: 0, budgetCurrency: 'EUR' }, 'Free'],
    [{ budgetAmount: 12 }, '12'],
  ])('%j -> %s', (place, expected) => {
    // Layout may use a no-break space between the code and the amount.
    expect(getBudgetDisplayText(place)?.replace(/\u00A0/g, ' ')).toBe(expected);
  });

  it('falls through to the legacy text, the Google range and the price level when there is no amount', () => {
    expect(getBudgetDisplayText({ customBudget: '$50' })).toBe('$50');
    expect(getBudgetDisplayText({ priceRange: '₹200–₹400' })).toBe('₹200–₹400');
    expect(getBudgetDisplayText({ priceLevel: 2 })).toBe('Moderate');
    expect(getBudgetDisplayText({})).toBeNull();
  });
});

describe('guide budget on the wire', () => {
  const place = { localId: 'm1', place_id: 'ChIJ1', name: 'Cafe' };
  it.each([
    [100, 'JPY', '100'],
    [1.25, 'KWD', '1.250'],
    [450.5, 'INR', '450.50'],
    [0, 'USD', '0.00'],
    [5, 'XYZ', '5.00'],
  ])('writes %s %s as the exact decimal %s the contract accepts', (budgetAmount, budgetCurrency, expected) => {
    const wire = toCanonicalBudgetPlace({ ...place, budgetAmount, budgetCurrency } as never);
    expect(wire.budgetAmount).toBe(expected);
    expect(wire.budgetCurrency).toBe(budgetCurrency);
    expect(guideBudgetPlaceSchema.safeParse({ ...wire, priceLevel: null, priceRange: null, customBudget: null }).success).toBe(true);
  });

  it('reads the amount back as a number with its currency', () => {
    expect(toBudgetPlace({ ...place, placeId: 'ChIJ1', priceLevel: null, priceRange: null, customBudget: null, budgetAmount: '1.250', budgetCurrency: 'KWD' } as never))
      .toMatchObject({ budgetAmount: 1.25, budgetCurrency: 'KWD' });
  });

  it('carries the guide estimate\'s currency so no surface has to assume one', () => {
    const collection = { id: 'c', title: 'Trip', description: null, slug: 't', visibility: 'private' } as never;
    const aggregate = { details: { guideType: null, multiCity: false, numberOfDays: null, estimatedBudget: '1200.00', budgetCurrency: 'EUR', budgetType: null, budgetTier: null,
      bestTimeToVisit: [], categories: [], tags: [], tipsNotes: null, place: { name: 'x', types: [], formattedAddress: null, geometry: null, placeId: null }, locationEntityId: null },
      coverMediaId: null, sections: [] } as never;
    expect(toGuide(collection, aggregate)).toMatchObject({ Estimated_Budget: 1200, Estimated_Budget_Currency: 'EUR' });
  });
});
