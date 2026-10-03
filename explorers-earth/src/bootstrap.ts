import { bootstrapPublicRuntime, isCanonicalRuntime } from './lib/publicRuntimeConfig';
// Optional remote typography never participates in the application CSS preload.
// Existing system/serif fallback stacks render when the font network is unavailable.
const start = async () => {
  await import('./main');
  const fonts = document.createElement('link');
  fonts.rel = 'stylesheet';
  fonts.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&family=Fraunces:opsz,wght@9..144,600;9..144,700;9..144,800&family=Inter:wght@400;500;600;700&family=Lato:ital,wght@0,100;0,300;0,400;0,700;0,900;1,100;1,300;1,400;1,700;1,900&family=Montserrat:ital,wght@0,100..900;1,100..900&family=Poppins:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900&family=Space+Grotesk:wght@300..700&display=swap';
  document.head.append(fonts);
};
if (isCanonicalRuntime()) {
  bootstrapPublicRuntime(fetch, window.location.origin, start).catch(() => {
    const root = document.getElementById('root');
    if (root) { root.textContent = 'The application configuration is unavailable. Please try again later.'; root.setAttribute('role','alert'); }
  });
} else { void start(); }
