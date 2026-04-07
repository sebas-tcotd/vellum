import { useAppMeta } from '../../context/AppMetaContext';

export function Version() {
  const { version } = useAppMeta();

  return (
    <span
      className="text-xs text-(--color-text-subtle) absolute bottom-2 right-2 opacity-25"
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      v{version}
    </span>
  );
}
