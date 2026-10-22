import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon.tsx';

export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
    // React's autoFocus fires while the dialog is still closed, so focus once it is open.
    d.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    return () => d.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="mx-auto mt-auto mb-0 max-h-[94dvh] w-full max-w-full overscroll-contain rounded-t-sheet bg-ground text-ink backdrop:bg-ink/40 open:animate-sheet-in wide:m-auto wide:max-h-[88dvh] wide:w-sheet wide:rounded-sheet"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className="px-4 pb-[calc(20px+env(safe-area-inset-bottom))]">
        <header className="sticky top-0 z-1 -mr-2 flex items-center justify-between bg-ground pt-2.5">
          <h2 className="text-3xl font-extrabold">{title}</h2>
          <button type="button" className="btn-icon" aria-label="Close" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
