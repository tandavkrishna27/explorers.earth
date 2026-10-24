import {render,screen} from '@testing-library/react';
import {expect,it} from 'vitest';
import ProviderRatingChip from '../ProviderRatingChip';
it.each([['TMDB',7.84,'TMDB 7.8'],['IGDB',86.2,'IGDB 86'],['Google Books',4.5,'Google Books 4.5']])('%s',(source,value,text)=>{
 render(<ProviderRatingChip source={source as string} value={value as number}/>);expect(screen.getByText(text as string)).toBeTruthy();
 expect(screen.queryByRole('img',{name:/star/i})).toBeNull();
});
it('renders nothing without a value',()=>{const {container}=render(<ProviderRatingChip source="TMDB" value={null}/>);expect(container.firstChild).toBeNull();});
