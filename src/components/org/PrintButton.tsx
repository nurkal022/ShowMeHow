'use client';
import { IconPrint } from '@/components/icons';

export default function PrintButton() {
  return (
    <button type="button" className="btn btn-primary no-print" onClick={() => window.print()}>
      <IconPrint size={16} />Напечатать лист паролей
    </button>
  );
}
