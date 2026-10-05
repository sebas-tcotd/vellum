import { App } from '../App';
import { LandingIsland } from './LandingIsland';

/** Client-only island for the current home page and its consent bar. */
export function HomeIsland() {
  return (
    <LandingIsland privacyPage={false}>
      <App />
    </LandingIsland>
  );
}
