import { X } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { useId, useRef } from 'react';

interface ImageLightboxProps {
  alt: string;
  imageClassName?: string;
  label: string;
  src: string;
}

export function ImageLightbox({
  alt,
  imageClassName = '',
  label,
  src,
}: ImageLightboxProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  function openLightbox() {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }

  function closeLightbox() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button
        className="image-trigger"
        type="button"
        aria-label={t('common.viewFullSize', { label })}
        onClick={openLightbox}
      >
        <img className={imageClassName} src={src} alt={alt} />
      </button>
      <dialog
        ref={dialogRef}
        className="image-lightbox"
        aria-labelledby={titleId}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeLightbox();
        }}
      >
        <div className="image-lightbox-content">
          <div className="image-lightbox-header">
            <p id={titleId}>{label}</p>
            <button
              className="image-lightbox-close"
              type="button"
              onClick={closeLightbox}
              aria-label={t('common.closeImage')}
            >
              <X size={19} weight="regular" aria-hidden="true" />
            </button>
          </div>
          <img className="image-lightbox-image" src={src} alt={alt} />
        </div>
      </dialog>
    </>
  );
}
