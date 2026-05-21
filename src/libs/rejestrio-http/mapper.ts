import type { EnrichmentPayload } from './client';

export function buildCustomerId(organizationId: string, userId: string): string {
  return `${organizationId}:${userId}:rejestrio`;
}

export function payloadToColumnFields(
  payload: EnrichmentPayload,
): Record<string, string | number | boolean | null> {
  return {
    _enrichment_krs: payload.krs,
    _enrichment_nip: payload.nip,
    _enrichment_regon: payload.regon,
    _enrichment_nazwa_pelna: payload.nazwaPelna,
    _enrichment_nazwa_skrocona: payload.nazwaSkrocona,
    _enrichment_forma_prawna: payload.formaPrawna,
    _enrichment_pkd_glowny: payload.pkdGlowny,
    _enrichment_miejscowosc: payload.miejscowosc,
    _enrichment_kod_pocztowy: payload.kodPocztowy,
    _enrichment_wykreslona: payload.wykreslona,
    _enrichment_w_upadlosci: payload.wUpadlosci,
    _enrichment_w_likwidacji: payload.wLikwidacji,
    _enrichment_przychody_pln: payload.przychodyPln,
    _enrichment_zysk_pln: payload.zyskPln,
    _enrichment_aktywa_pln: payload.aktywaPln,
    _enrichment_sprawozdanie_rocznik: payload.sprawozdanieRocznik,
  };
}
