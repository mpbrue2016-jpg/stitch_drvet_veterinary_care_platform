import { ClinicalRecordForm } from '@/components/clinical-record-form';

export default function ClinicalRecordPage({
  params,
}: {
  params: { appointmentId: string };
}) {
  return (
    <div className="mx-auto max-w-5xl">
      <ClinicalRecordForm appointmentId={params.appointmentId} />
    </div>
  );
}
