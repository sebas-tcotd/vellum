import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/500.css';
import { App } from './App';
import { i18nReady } from './i18n';
import './styles.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Landing root element was not found.');
}

async function bootstrap(container: HTMLElement) {
  await i18nReady;

  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap(root);
