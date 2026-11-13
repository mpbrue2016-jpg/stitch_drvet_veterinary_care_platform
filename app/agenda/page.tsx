import { ProfessionalSetup } from '@/components/professional-setup';
import { WeeklyAgenda } from '@/components/weekly-agenda';

export default function Agenda() {
  return <WeeklyAgenda setup={<div className="mb-5"><ProfessionalSetup /></div>} />;
}
