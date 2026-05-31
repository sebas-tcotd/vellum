import { useTranslation } from 'react-i18next';
import { Progress } from '../../lib/progress';
import { useProgressEvents } from '../../hooks/use-progress-events';

export function ProgressBar() {
  const { t } = useTranslation();
  const { percent, listenError } = useProgressEvents();

  if (listenError) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
      <div className="w-64">
        <Progress
          value={percent}
          aria-label={t('a11y.loadingProgress', 'Loading...')}
          aria-valuenow={Math.round(percent)}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}
