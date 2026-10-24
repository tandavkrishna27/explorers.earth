import {fireEvent,render,screen} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import '../../test/englishI18n';
import CurrencyPriceInput,{defaultCurrencyForLocale} from '../CurrencyPriceInput';
it.each([['en-IN','INR'],['de-DE','EUR'],['ja-JP','JPY'],['en-US','USD'],['xx','USD']])('%s -> %s',(locale,code)=>expect(defaultCurrencyForLocale(locale)).toBe(code));
it('one field: amount + inline currency; JPY refuses decimals inline',()=>{
 const onChange=vi.fn();render(<CurrencyPriceInput value={{price:null,currencyCode:'JPY'}} onChange={onChange} locale="ja-JP"/>);
 fireEvent.change(screen.getByLabelText('Price'),{target:{value:'100.5'}});
 expect(screen.getByRole('alert').textContent).toMatch(/JPY/);
 fireEvent.change(screen.getByLabelText('Currency'),{target:{value:'USD'}});
 expect(onChange).toHaveBeenLastCalledWith({price:'100.5',currencyCode:'USD'});
});
