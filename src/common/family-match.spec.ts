import { familyMatchRegex, familySearchText, familyTokens, matchFamily } from './family-match';

const family = [
  { name: 'Hirpara', aliases: [] },
  { name: 'Sonalben', aliases: ['SONALBEN', 'Sonal Ben'] },
  { name: 'utsavhi', aliases: [] },
];

describe('family matching', () => {
  it('tokens skip noise and short fragments', () => {
    expect(familyTokens({ name: 'Sonalben', aliases: ['Sonal Ben'] }).sort()).toEqual(
      ['sonal', 'sonalben'].sort(),
    );
    expect(familyTokens({ name: 'upi self HDFC' })).toEqual([]);
  });

  it('matches UPI credits that name family or own handle', () => {
    expect(
      matchFamily('UPI/CR/669091760614/Hirpara /AUBL/utsavhi/UPI', family)?.name,
    ).toBe('Hirpara');
    expect(matchFamily('UPI/CR/668680829071/SONALBEN/P PIW/7433953/UPI', family)?.name).toBe(
      'Sonalben',
    );
    expect(matchFamily('UPI/CR/1/own/AUBL/utsavhi/UPI', family)?.name).toBe('utsavhi');
  });

  it('does not treat supermarket legal text as Sonalben', () => {
    const avenue =
      'UPI/DR/1044/AVENUE S/HDFC/AVENUES/UPI • Unless the constituent notifies in writing any discrepancy in this statement, it shall be treated as correct. This is an auto generated statement for personal use.';
    expect(familySearchText(avenue)).toBe('UPI/DR/1044/AVENUE S/HDFC/AVENUES/UPI');
    expect(matchFamily(avenue, family)).toBeUndefined();
    expect(familyMatchRegex([family[1]])!.test(familySearchText(avenue))).toBe(false);
  });

  it('regex still hits real family payees', () => {
    const rx = familyMatchRegex(family)!;
    expect(rx.test('UPI/CR/669091760614/Hirpara /AUBL/utsavhi/UPI')).toBe(true);
    expect(rx.test('UPI/CR/668680829071/SONALBEN/P PIW/7433953/UPI')).toBe(true);
  });

  it('matches half names against full UPI payees and handles', () => {
    expect(
      matchFamily('UPI/CR/668680829071/SONALBEN/P PIW/7433953/UPI', [{ name: 'sonal' }])?.name,
    ).toBe('sonal');
    expect(matchFamily('UPI/CR/1/own/AUBL/utsavhi/UPI', [{ name: 'utsav' }])?.name).toBe('utsav');
    expect(matchFamily('UPI/CR/669091760614/Hirpara /AUBL/utsavhi/UPI', [{ name: 'hirpara' }])?.name).toBe(
      'hirpara',
    );
    expect(matchFamily('UPI/CR/1/Kanaiyalal/HDFC/kanaiya/UPI', [{ name: 'kanaiyalal' }])?.name).toBe(
      'kanaiyalal',
    );
    expect(
      matchFamily('UPI/659761920023/DR/ Hirp/AUBL/irpara3-3@oksbi', [{ name: 'hirpara' }])?.name,
    ).toBe('hirpara');
    expect(matchFamily('UPI/624240961781/DR/ Utsa/IDFB/irpara3', [{ name: 'utsav' }])?.name).toBe(
      'utsav',
    );
    expect(matchFamily('UPI/128060301101/CR/ KANA/UBIN/a676@okhdfcbank', [{ name: 'kanaiyalal' }])?.name).toBe(
      'kanaiyalal',
    );
  });

  it('does not treat personal or supermarket payees as short family names', () => {
    const avenue =
      'UPI/DR/1044/AVENUE S/HDFC/AVENUES/UPI • Unless the constituent notifies in writing any discrepancy in this statement, it shall be treated as correct. This is an auto generated statement for personal use.';
    expect(matchFamily(avenue, [{ name: 'sonal' }, { name: 'utsav' }, { name: 'hirpara' }])).toBeUndefined();
    expect(matchFamily('POS-HDFC/PERSONAL CARE MART', [{ name: 'sonal' }])).toBeUndefined();
  });
});
