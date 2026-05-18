import { z } from 'zod';

export const LeadColumnTypeSchema = z.enum([
  'string',
  'number',
  'boolean',
  'date',
  'url',
]);
export type LeadColumnType = z.infer<typeof LeadColumnTypeSchema>;

export const LeadColumnSourceSchema = z.enum(['csv', 'enrichment']);
export type LeadColumnSource = z.infer<typeof LeadColumnSourceSchema>;

export const LeadColumnSchema = z.object({
  key: z.string().min(1).max(120),
  label: z.string().min(1).max(200),
  type: LeadColumnTypeSchema,
  source: LeadColumnSourceSchema,
});
export type LeadColumn = z.infer<typeof LeadColumnSchema>;

export const LeadColumnsSchema = z.array(LeadColumnSchema);

export const ENRICHMENT_COLUMNS: LeadColumn[] = [
  { key: '_enrichment_krs', label: 'KRS', type: 'string', source: 'enrichment' },
  { key: '_enrichment_nip', label: 'NIP', type: 'string', source: 'enrichment' },
  { key: '_enrichment_regon', label: 'REGON', type: 'string', source: 'enrichment' },
  { key: '_enrichment_nazwa_pelna', label: 'Nazwa pełna', type: 'string', source: 'enrichment' },
  { key: '_enrichment_forma_prawna', label: 'Forma prawna', type: 'string', source: 'enrichment' },
  { key: '_enrichment_pkd_glowny', label: 'PKD główny', type: 'string', source: 'enrichment' },
  { key: '_enrichment_miejscowosc', label: 'Miejscowość', type: 'string', source: 'enrichment' },
  { key: '_enrichment_kod_pocztowy', label: 'Kod pocztowy', type: 'string', source: 'enrichment' },
  { key: '_enrichment_wykreslona', label: 'Wykreślona', type: 'boolean', source: 'enrichment' },
  { key: '_enrichment_w_upadlosci', label: 'W upadłości', type: 'boolean', source: 'enrichment' },
  { key: '_enrichment_w_likwidacji', label: 'W likwidacji', type: 'boolean', source: 'enrichment' },
  { key: '_enrichment_przychody_pln', label: 'Przychody (PLN)', type: 'number', source: 'enrichment' },
  { key: '_enrichment_zysk_pln', label: 'Zysk (PLN)', type: 'number', source: 'enrichment' },
  { key: '_enrichment_aktywa_pln', label: 'Aktywa (PLN)', type: 'number', source: 'enrichment' },
  { key: '_enrichment_sprawozdanie_rocznik', label: 'Rocznik sprawozdania', type: 'number', source: 'enrichment' },
];
