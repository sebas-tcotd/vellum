// packages/ui/src/components/empty-state/ContextualHint.tsx
import type { ReactNode } from 'react';
import type { HintPhase } from './useHintCycle';

interface ContextualHintProps {
  phase: Exclude<HintPhase, 'hidden'>;
  children: ReactNode;
}

const ANIMATION: Record<Exclude<HintPhase, 'hidden'>, string> = {
  visible: 'vellum-hint-fadein 300ms ease forwards',
  leaving: 'vellum-hint-fadeout 300ms ease forwards',
};

/**
 * Párrafo de hint animado. Solo se monta cuando `phase !== 'hidden'` — el padre
 * es responsable de condicionar el montaje.
 *
 * @remarks
 * La animación se aplica via style prop (no className) porque un className de
 * Tailwind con `animation-*` sobreescribiría el keyframe inmediatamente.
 * `forwards` retiene el estado final (opacity: 0) hasta que React desmonta el nodo.
 */
export function ContextualHint({ phase, children }: ContextualHintProps) {
  return (
    <p
      role="status"
      aria-hidden={phase === 'leaving'}
      className="font-extralight text-xs text-(--color-text-subtle) m-0 max-w-[400px]"
      style={{ animation: ANIMATION[phase] }}
    >
      {children}
    </p>
  );
}
