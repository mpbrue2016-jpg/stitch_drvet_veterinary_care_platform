import { ExamOrders } from '@/components/exam-orders';

export default function ExamOrdersPage({
  searchParams,
}: {
  searchParams: { appointmentId?: string };
}) {
  return (
    <div className="mx-auto max-w-6xl">
      <ExamOrders appointmentId={searchParams.appointmentId ?? ''} />
    </div>
  );
}
