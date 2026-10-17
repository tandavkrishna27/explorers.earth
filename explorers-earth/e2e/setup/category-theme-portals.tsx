import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import '../../src/index.css';
import ShareModal from '../../src/components/ShareModal';
import QRModal from '../../src/components/ui/QRModal';
import CircularPlacesModal from '../../src/components/CircularPlacesModal';
import DayDetailModal from '../../src/features/PublicHome/components/PublicGuideViews/DayDetailModal';
import GooglePlaceModal from '../../src/features/PublicHome/components/PublicGuideViews/GooglePlaceModal';
import PlaceContentOverview from '../../src/features/PublicHome/components/PlaceDetails/Details/Overview';
import MediaViewer from '../../src/components/ui/MediaViewer';
import Modal from '../../src/components/ui/Modal';
import { DEFAULT_THEME_SETTINGS, getThemeTokenStyles } from '../../src/features/Profile/constants/themePresets';
import { getPublicCategoryThemeStyles, PublicCategoryThemeProvider } from '../../src/features/PublicHome/components/PublicCategoryThemeContext';
import type { ThemePresetId } from '../../src/features/Profile/types/themeTypes';
import PublicNav from '../../src/components/PublicNav';
import { PublicMusicAvailabilityProvider } from '../../src/features/music/PublicMusicAvailabilityProvider';
import '../../src/features/PublicHome/components/PublicBranding.css';

// Direct component coverage for existing dialogs whose PublicHome opening state is unreachable.
void i18next.init({ lng: 'en', resources: { en: { translation: {} } }, initImmediate: false });
const query = new URLSearchParams(location.search);
const theme = { ...DEFAULT_THEME_SETTINGS, preset: (query.get('preset') || 'minimal-light') as ThemePresetId, accentColor: '' };
const styles = query.get('preset') === 'default' ? null : getPublicCategoryThemeStyles(theme);
const image = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%23203040"/%3E%3C/svg%3E';
function Harness() {
  const [open, setOpen] = useState(true);
  const [cropResult, setCropResult] = useState<'cancelled' | 'confirmed' | null>(null);
  const close = () => setOpen(false);
  return <I18nextProvider i18n={i18next}><PublicCategoryThemeProvider styles={styles}>
    <div style={styles ? { ...getThemeTokenStyles(theme), ...styles } : undefined} data-portal-component={query.get('component')}>
      {query.get('component') === 'share' ? <ShareModal isOpen={open} onClose={close} url="https://example.test/shared" shareButtons={[]} backgroundImage={image} />
        : query.get('component') === 'crop' ? <Modal type="crop" isOpen={open} onClose={close}>
          <div className="p-4 sm:p-6">
            <h2 className="text-xl font-semibold">Crop preview</h2>
            <div className="my-4 h-96 rounded-lg bg-black" aria-label="Synthetic crop surface" />
            {Array.from({ length: 8 }, (_, index) => <p className="mb-4" key={index}>Crop guidance row {index + 1}: adjust the synthetic image before choosing an action.</p>)}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => { setCropResult('cancelled'); close(); }} className="min-h-11 rounded-lg border px-4">Cancel</button>
              <button type="button" onClick={() => { setCropResult('confirmed'); close(); }} className="min-h-11 rounded-lg bg-dashboard-accent px-4 text-white">Confirm</button>
            </div>
          </div>
        </Modal>
        : query.get('component') === 'circular' ? <CircularPlacesModal isOpen={open} onClose={close} handleCitySelect={() => {}} places={[{ List_Name: 'Fixture city', Visibility: true, imageUrl: image, List_Name_Details: { thumbnail: image } }]} />
        : query.get('component') === 'day' ? <DayDetailModal isOpen={open} onClose={close} day={{ Title: 'Fixture day', Description: 'A day description', Sequence: 1, Timeline: { morning: [{ name: 'Morning place', formatted_address: 'Fixture address' }], afternoon: [], evening: [] } }} />
        : query.get('component') === 'phone' ? <PlaceContentOverview fetchedPlace={{ Place_Details: {}, Contact_Number: query.get('enabled') === 'true' ? '123456' : '' }} isPublicCategory={Boolean(styles)} />
        : query.get('component') === 'google' ? <GooglePlaceModal isOpen={open} onClose={close} place={{ place_id: 'focus-place', name: 'Focus place' }} sections={[{ Recommendation_Activity: { activities: [{ place_id: 'focus-place', photos: [{ url: image }] }] } }]} />
        : query.get('component') === 'media' ? <MediaViewer isOpen={open} onClose={close} mediaItems={[{ id: 'image', url: image, type: 'image', alt: 'Local artwork' }]} />
          : <QRModal isOpen={open} onClose={close} onCopyLink={() => {}} qrValue="https://example.test/shared" title="Profile QR" />}
      {!open && <p data-component-closed>Dialog closed</p>}
      {cropResult && <p data-crop-result>{cropResult}</p>}
    </div>
  </PublicCategoryThemeProvider></I18nextProvider>;
}
function NavHarness() {
  return <MemoryRouter initialEntries={['/fixture-owner/guides']}>
    <Routes>
      <Route path="/:username/*" element={<PublicMusicAvailabilityProvider><PublicNav /></PublicMusicAvailabilityProvider>} />
    </Routes>
  </MemoryRouter>;
}
createRoot(document.getElementById('root')!).render(query.get('component') === 'nav' ? <NavHarness /> : <Harness />);
