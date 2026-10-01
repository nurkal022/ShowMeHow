'use client';
import { IconPrint } from '@/components/icons';
import { useT } from '@/i18n/client';
import { orgPeople } from '@/i18n/messages/org-people';

export default function PrintButton() {
  const t = useT(orgPeople);
  return (
    <button type="button" className="btn btn-primary no-print" onClick={() => window.print()}>
      <IconPrint size={16} />{t('printSheet')}
    </button>
  );
}
