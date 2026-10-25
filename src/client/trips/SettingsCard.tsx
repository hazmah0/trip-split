import type { ReactNode } from 'react';

export function SettingsCard({
  title,
  hint,
  note,
  children,
}: {
  title: string;
  hint: string;
  note: string;
  children?: ReactNode;
}) {
  return (
    <div className="mx-4 mt-4 flex flex-col gap-3 card px-4 pt-4.5 pb-5 wide:mx-0">
      <h2 className="text-3xl font-extrabold">{title}</h2>
      <p className="hint">{hint}</p>
      {children}
      {note && (
        <p className="hint" role="status">
          {note}
        </p>
      )}
    </div>
  );
}
