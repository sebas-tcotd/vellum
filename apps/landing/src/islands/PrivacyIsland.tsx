import { Privacy } from '../Privacy';
import { LandingIsland } from './LandingIsland';

/** Client-only island for the privacy policy; it never starts analytics. */
export function PrivacyIsland() {
  return (
    <LandingIsland privacyPage>
      <Privacy />
    </LandingIsland>
  );
}
