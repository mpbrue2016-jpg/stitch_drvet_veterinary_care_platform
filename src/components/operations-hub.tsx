'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  DemoNotice,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Skeleton,
  Table,
  TableCell,
  TableHead,
  Tabs,
  Toast,
} from '@/components/ui';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { listarDisponibilidade } from '@/services/availability.service';
import { listarComissoes } from '@/services/commissions.service';
import { listarVeterinariosAprovados } from '@/services/organizations.service';
import type {
  AvailabilitySlot,
  CommissionEntry,
  VeterinarianProfile,
} from '@/types/entities';

interface LegalDocument {
  id: string;
  title: string;
  version: string;
  updatedAt: string;
  summary: string;
  body: string;
}

const legalDocuments: LegalDocument[] = [
  {
    id: 'cfmv-1465',
    title: 'Termo de Conformidade Telemedicina — Resolução CFMV nº 1.465/2022',
    version: 'v2.4',
    updatedAt: '2026-10-01',
    summary:
      'Regras de teletriagem, teleorientação, teleconsulta e obrigatoriedade de CRMV ativo e consentimento do tutor.',
    body: 'Estabelece os requisitos técnicos para atendimento médico-veterinário à distância na plataforma DrVet: gravação opcional com consentimento explícito, assinatura digital padrão ICP-Brasil para prescrições quando habilitada e manutenção de prontuário SOAP completo vinculado ao paciente.',
  },
  {
    id: 'repasse-d1',
    title: 'Contrato de Adesão & Política de Repasses D+1 (Split Asaas / Mercado Pago)',
    version: 'v1.9',
    updatedAt: '2026-09-18',
    summary:
      'Define regras de split automático entre clínica/veterinário, pet shop indicador e taxa de intermediação tecnológica.',
    body: 'Os valores líquidos provenientes de consultas e cupons parceiros ficam disponíveis no livro-razão (commission_ledger) conforme liquidação bancária, permitindo conciliação em formato CSV e OFX e antecipação auditada via RPC transacional.',
  },
  {
    id: 'lgpd-dados',
    title: 'Política de Privacidade Clínica & Governança LGPD',
    version: 'v3.1',
    updatedAt: '2026-11-01',
    summary:
      'Isolamento por Row-Level Security (RLS), criptografia de anexos clínicos em Storage privado e controle RBAC.',
    body: 'Todos os documentos de pacientes, laudos de exames, vacinas e gravações são protegidos por políticas RLS no PostgreSQL e acessados apenas via URLs assinadas temporárias pelo tutor titular ou veterinário designado.',
  },
];

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}

function downloadBlob(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function buildCsv(entries: CommissionEntry[]) {
  const header = 'ID,Referencia,Tutor,Pet,Origem,BrutoBRL,LiquidoBRL,Status,DataISO';
  const rows = entries.map((e) =>
    [
      e.id,
      `"${e.reference.replace(/"/g, '""')}"`,
      `"${e.tutor_name.replace(/"/g, '""')}"`,
      `"${e.pet_name.replace(/"/g, '""')}"`,
      e.origin,
      (e.gross_amount_cents / 100).toFixed(2),
      (e.net_amount_cents / 100).toFixed(2),
      e.status,
      e.occurred_at,
    ].join(','),
  );
  return [header, ...rows].join('\n');
}

function buildOfx(entries: CommissionEntry[]) {
  const nowStamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const transactions = entries
    .map((e) => {
      const dt = e.occurred_at.replace(/[-:T.Z]/g, '').slice(0, 8);
      const val = (e.net_amount_cents / 100).toFixed(2);
      return [
        '<STMTTRN>',
        '<TRNTYPE>CREDIT',
        `<DTPOSTED>${dt}`,
        `<TRNAMT>${val}`,
        `<FITID>${e.id}`,
        `<MEMO>DrVet ${e.reference} - ${e.pet_name}</MEMO>`,
        '</STMTTRN>',
      ].join('\n');
    })
    .join('\n');

  return [
    'OFXHEADER:100',
    'DATA:OFXSGML',
    'VERSION:102',
    'ENCODING:UTF-8',
    '<OFX>',
    '<BANKMSGSRSV1>',
    '<STMTTRNRS>',
    '<TRNUID>1',
    '<STMTRS>',
    '<CURDEF>BRL',
    '<BANKTRANLIST>',
    `<DTSTART>${nowStamp.slice(0, 8)}`,
    `<DTEND>${nowStamp.slice(0, 8)}`,
    transactions,
    '</BANKTRANLIST>',
    '</STMTRS>',
    '</STMTTRNRS>',
    '</BANKMSGSRSV1>',
    '</OFX>',
  ].join('\n');
}

export function OperationsHub() {
  const configured = isSupabaseConfigured();
  const [specialtyFilter, setSpecialtyFilter] = useState('');
  const [professionals, setProfessionals] = useState<VeterinarianProfile[]>([]);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [commissions, setCommissions] = useState<CommissionEntry[]>([]);
  const [selectedDocId, setSelectedDocId] = useState(legalDocuments[0].id);
  const [acknowledgedDocs, setAcknowledgedDocs] = useState<string[]>([]);
  const [loading, setLoading] = useState(configured);
  const [notice, setNotice] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const loadHub = useCallback(async () => {
    if (!configured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMessage('');
    try {
      const [vetsRes, availRes, commRes] = await Promise.all([
        listarVeterinariosAprovados().catch(() => ({
          professionals: [],
        })),
        listarDisponibilidade().catch(() => ({ availability: [] })),
        listarComissoes().catch(() => ({ entries: [] })),
      ]);
      setProfessionals(vetsRes.professionals);
      setSlots(availRes.availability);
      setCommissions(commRes.entries);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Não foi possível carregar a central.',
      );
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => {
    void loadHub();
  }, [loadHub]);

  const filteredProfessionals = professionals.filter((vet) => {
    const q = specialtyFilter.trim().toLowerCase();
    if (!q) return true;
    return (
      (vet.display_name ?? '').toLowerCase().includes(q) ||
      (vet.specialty ?? '').toLowerCase().includes(q) ||
      vet.registration_number.toLowerCase().includes(q)
    );
  });

  const activeDoc =
    legalDocuments.find((doc) => doc.id === selectedDocId) ?? legalDocuments[0];

  function handleExportCsv() {
    downloadBlob('drvet-conciliacao.csv', buildCsv(commissions), 'text/csv;charset=utf-8');
    setNotice(`Arquivo CSV exportado com ${commissions.length} lançamento(s).`);
  }

  function handleExportOfx() {
    downloadBlob(
      'drvet-conciliacao.ofx',
      buildOfx(commissions),
      'application/x-ofx;charset=utf-8',
    );
    setNotice(`Arquivo OFX bancário exportado com ${commissions.length} lançamento(s).`);
  }

  function handleAcknowledgeDoc(docId: string) {
    setAcknowledgedDocs((current) =>
      current.includes(docId) ? current : [...current, docId],
    );
    setNotice('Leitura e ciência registradas para esta sessão.');
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              className="inline-flex min-h-10 items-center justify-center rounded-lg bg-brand-navy px-4 text-sm font-semibold text-white hover:bg-[#0d2a3a]"
              href="/painel/veterinario"
            >
              Painel Veterinário
            </Link>
            <Link
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-brand-ink hover:bg-brand-ice"
              href="/painel/parceiro"
            >
              Painel Parceiro
            </Link>
          </div>
        }
        description="Diretório de especialistas por especialidade, exportação bancária CSV/OFX e repositório de termos digitais DrVet."
        title="Central Operacional & Documentos"
      />

      {!configured && <DemoNotice />}
      {notice && (
        <div className="mb-4">
          <Toast message={notice} onDismiss={() => setNotice('')} variant="success" />
        </div>
      )}
      {errorMessage && (
        <div className="mb-4">
          <Toast message={errorMessage} onDismiss={() => setErrorMessage('')} variant="danger" />
        </div>
      )}

      <Tabs
        label="Módulos da Central Operacional"
        tabs={[
          {
            id: 'vets',
            label: 'Especialistas & Horários',
            content: (
              <Card
                description="Consulte médicos-veterinários credenciados nas organizações vinculadas e seus horários publicados."
                title="Encontrar Veterinários"
              >
                <div className="mb-4 grid gap-3 sm:grid-cols-3">
                  <Input
                    label="Buscar por nome, CRMV ou especialidade"
                    name="specialtyFilter"
                    onChange={(e) => setSpecialtyFilter(e.target.value)}
                    placeholder="Ex.: Dermatologia, CRMV-SP…"
                    value={specialtyFilter}
                  />
                  <div className="flex items-end">
                    <Link
                      className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-brand-green px-4 text-sm font-bold text-white hover:bg-[#0f8a72]"
                      href="/agendamento/edit"
                    >
                      Agendar horário ({slots.length} disponíveis)
                    </Link>
                  </div>
                </div>

                {loading ? (
                  <Skeleton className="h-36 w-full" />
                ) : filteredProfessionals.length === 0 ? (
                  <EmptyState
                    action={
                      <Link
                        className="inline-flex min-h-10 items-center justify-center rounded-lg bg-brand-navy px-4 text-sm font-semibold text-white"
                        href="/agenda"
                      >
                        Abrir gestão de agenda e equipe
                      </Link>
                    }
                    description="Nenhum profissional credenciado encontrado para este filtro ou organização."
                    title="Sem profissionais listados"
                  />
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {filteredProfessionals.map((vet) => {
                      const vetSlots = slots.filter(
                        (slot) => slot.veterinarian_id === vet.user_id,
                      ).length;
                      return (
                        <div
                          className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-[#F9FBFC] p-4"
                          key={`${vet.organization_id}-${vet.user_id}`}
                        >
                          <div>
                            <p className="font-bold text-brand-navy">
                              {vet.display_name ?? 'Médico Veterinário'}
                            </p>
                            <p className="text-xs text-slate-600">
                              CRMV-{vet.registration_region} {vet.registration_number} ·{' '}
                              {vet.specialty || 'Clínica Geral'}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Badge variant={vet.status === 'approved' ? 'success' : 'warning'}>
                                {vet.status === 'approved' ? 'Aprovado' : vet.status}
                              </Badge>
                              <Badge variant="info">{vetSlots} horário(s)</Badge>
                            </div>
                          </div>
                          <Link
                            className="shrink-0 rounded-lg bg-brand-navy px-3 py-2 text-xs font-bold text-white hover:bg-[#0d2a3a]"
                            href={`/agendamento/edit?vet=${encodeURIComponent(vet.user_id)}`}
                          >
                            Agendar
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            ),
          },
          {
            id: 'export',
            label: 'Exportação Bancária (CSV / OFX)',
            content: (
              <Card
                description="Gere arquivos de conciliação contábil e bancária diretamente a partir do livro-razão Supabase."
                title="Conciliação Financeira — CSV & OFX"
              >
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-[#F5F8FA] p-4">
                  <div>
                    <p className="text-sm font-bold text-brand-navy">
                      {commissions.length} lançamento(s) carregado(s)
                    </p>
                    <p className="text-xs text-slate-600">
                      Compatível com Conta Azul, Omie, Bling e sistemas bancários OFX 1.02.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={handleExportCsv} type="button" variant="secondary">
                      Exportar .CSV
                    </Button>
                    <Button onClick={handleExportOfx} type="button" variant="primary">
                      Exportar .OFX Bancário
                    </Button>
                  </div>
                </div>

                {loading ? (
                  <Skeleton className="h-36 w-full" />
                ) : commissions.length === 0 ? (
                  <EmptyState
                    description="Os arquivos gerados conterão os cabeçalhos oficiais assim que houver movimentações financeiras."
                    title="Sem lançamentos no período"
                  />
                ) : (
                  <Table>
                    <thead>
                      <tr>
                        <TableHead>Referência</TableHead>
                        <TableHead>Origem</TableHead>
                        <TableHead>Bruto</TableHead>
                        <TableHead>Líquido</TableHead>
                        <TableHead>Status</TableHead>
                      </tr>
                    </thead>
                    <tbody>
                      {commissions.slice(0, 10).map((entry) => (
                        <tr key={entry.id}>
                          <TableCell className="font-mono text-xs">{entry.reference}</TableCell>
                          <TableCell>{entry.origin}</TableCell>
                          <TableCell>{formatCurrency(entry.gross_amount_cents)}</TableCell>
                          <TableCell className="font-bold">
                            {formatCurrency(entry.net_amount_cents)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={entry.status === 'available' ? 'success' : 'neutral'}>
                              {entry.status}
                            </Badge>
                          </TableCell>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </Card>
            ),
          },
          {
            id: 'contracts',
            label: 'Contratos Digitais & Termos',
            content: (
              <Card
                description="Consulte contratos de adesão B2B, política de repasse e termos éticos CFMV."
                title="Repositório de Contratos Digitais"
              >
                <div className="mb-4 max-w-md">
                  <Select
                    label="Selecionar documento"
                    onChange={(e) => setSelectedDocId(e.target.value)}
                    value={activeDoc.id}
                  >
                    {legalDocuments.map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.title} ({doc.version})
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-[#F9FBFC] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-base font-extrabold text-brand-navy">{activeDoc.title}</h3>
                    <div className="flex items-center gap-2">
                      <Badge variant="info">{activeDoc.version}</Badge>
                      {acknowledgedDocs.includes(activeDoc.id) && (
                        <Badge variant="success">Ciência registrada</Badge>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Atualizado em {activeDoc.updatedAt}
                  </p>
                  <p className="mt-3 text-sm font-semibold text-slate-700">{activeDoc.summary}</p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{activeDoc.body}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      onClick={() => handleAcknowledgeDoc(activeDoc.id)}
                      type="button"
                      variant="secondary"
                    >
                      Registrar leitura e ciência
                    </Button>
                    <Button
                      onClick={() =>
                        downloadBlob(
                          `${activeDoc.id}-${activeDoc.version}.txt`,
                          `${activeDoc.title} (${activeDoc.version})\nAtualizado: ${activeDoc.updatedAt}\n\n${activeDoc.summary}\n\n${activeDoc.body}\n`,
                          'text/plain;charset=utf-8',
                        )
                      }
                      type="button"
                      variant="outline"
                    >
                      Baixar via de leitura (.txt)
                    </Button>
                  </div>
                </div>
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
}
