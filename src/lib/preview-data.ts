/**
 * Server-side helper: loads the engine test fixtures, runs the reconciliation
 * engine, and returns the result for the preview dashboard.
 *
 * This is a PREVIEW only — it uses the planted-discrepancy fixtures, not real
 * customer data. Slice 4 will replace this with a real reconciliation run
 * against the database.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  runReconciliation,
  nairaToKobo,
  formatNaira,
  type NormalisedProperty,
  type NormalisedTenant,
  type NormalisedLease,
  type NormalisedInvoice,
  type NormalisedPayment,
  type LeaseFrequency,
  type EscalationType,
  type BillingType,
  type EngineResult,
} from '@/lib/engine';

const FIXTURES_DIR = join(
  process.cwd(),
  'packages',
  'reconciliation-engine',
  'test',
  'fixtures',
);

export interface PreviewData {
  result: EngineResult;
  fixtures: {
    properties: number;
    tenants: number;
    leases: number;
    invoices: number;
    payments: number;
  };
  asOf: string;
}

export function loadPreviewData(): PreviewData {
  const properties = loadProperties();
  const tenants = loadTenants();
  const leases = loadLeases();
  const invoices = loadInvoices();
  const payments = loadPayments();

  // Use the same asOf date as the CLI for consistency.
  const asOf = '2025-09-30';

  const result = runReconciliation({
    properties,
    tenants,
    leases,
    invoices,
    payments,
    config: { asOf },
  });

  return {
    result,
    fixtures: {
      properties: properties.length,
      tenants: tenants.length,
      leases: leases.length,
      invoices: invoices.length,
      payments: payments.length,
    },
    asOf,
  };
}

// ----------------------------------------------------------------------------
// CSV loading (same logic as the CLI, kept here so the preview doesn't depend
// on the CLI file structure)
// ----------------------------------------------------------------------------

function parseCsv(path: string): Record<string, string>[] {
  const content = readFileSync(path, 'utf-8');
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]!);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]!);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]!] = values[j] ?? '';
    }
    rows.push(row);
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  result.push(current);
  return result.map((s) => s.trim());
}

function loadProperties(): NormalisedProperty[] {
  const rows = parseCsv(join(FIXTURES_DIR, 'properties.csv'));
  return rows.map((r) => ({
    id: `prop-${r.property_id}`,
    externalId: r.property_id,
    name: r.property_name,
    raw: r as unknown as Record<string, unknown>,
  }));
}

function loadTenants(): NormalisedTenant[] {
  const rows = parseCsv(join(FIXTURES_DIR, 'tenants.csv'));
  return rows.map((r) => ({
    id: `tenant-${r.tenant_id}`,
    externalId: r.tenant_id,
    name: r.tenant_name,
    propertyId: r.property_id ? `prop-${r.property_id}` : null,
    raw: r as unknown as Record<string, unknown>,
  }));
}

function loadLeases(): NormalisedLease[] {
  const rows = parseCsv(join(FIXTURES_DIR, 'leases.csv'));
  return rows.map((r) => {
    const escalation = parseEscalation(r.escalation);
    return {
      id: `lease-${r.lease_id}`,
      externalId: r.lease_id,
      tenantId: `tenant-${r.tenant_id}`,
      tenantExternalId: r.tenant_id,
      propertyId: `prop-${r.property_id ?? ''}`,
      propertyExternalId: r.property_id ?? '',
      startDate: r.start_date,
      endDate: r.end_date || null,
      rentAmount: nairaToKobo(parseFloat(r.rent_amount)),
      currency: r.currency,
      frequency: r.frequency as LeaseFrequency,
      escalationType: escalation.type,
      escalationRate: escalation.rate,
      escalationFrequencyMonths: escalation.frequencyMonths,
      escalationStartDate: escalation.startDate,
      raw: r as unknown as Record<string, unknown>,
    };
  });
}

interface ParsedEscalation {
  type: EscalationType;
  rate: number | null;
  frequencyMonths: number | null;
  startDate: string | null;
}

function parseEscalation(raw: string): ParsedEscalation {
  if (!raw || raw === 'none') {
    return { type: 'none', rate: null, frequencyMonths: null, startDate: null };
  }
  const parts = raw.split(':');
  const type = parts[0] as EscalationType;
  if (type === 'percentage') {
    return {
      type,
      rate: parseFloat(parts[1] ?? '0'),
      frequencyMonths: parseInt(parts[2] ?? '12', 10),
      startDate: parts[3] ?? null,
    };
  }
  if (type === 'fixed_amount') {
    return {
      type,
      rate: nairaToKobo(parseFloat(parts[1] ?? '0')),
      frequencyMonths: parseInt(parts[2] ?? '12', 10),
      startDate: parts[3] ?? null,
    };
  }
  return { type: 'none', rate: null, frequencyMonths: null, startDate: null };
}

function loadInvoices(): NormalisedInvoice[] {
  const rows = parseCsv(join(FIXTURES_DIR, 'billing.csv'));
  return rows.map((r) => ({
    id: `inv-${r.invoice_id}`,
    externalId: r.invoice_id,
    tenantId: r.tenant_id ? `tenant-${r.tenant_id}` : null,
    tenantExternalId: r.tenant_id || null,
    leaseId: null,
    invoiceDate: r.invoice_date,
    amount: nairaToKobo(parseFloat(r.amount)),
    currency: 'NGN',
    billingType: (r.billing_type || 'rent') as BillingType,
    raw: r as unknown as Record<string, unknown>,
  }));
}

function loadPayments(): NormalisedPayment[] {
  const rows = parseCsv(join(FIXTURES_DIR, 'payments.csv'));
  return rows.map((r) => ({
    id: `pay-${r.payment_id}`,
    externalId: r.payment_id,
    tenantId: r.tenant_id ? `tenant-${r.tenant_id}` : null,
    tenantExternalId: r.tenant_id || null,
    invoiceId: null,
    paymentDate: r.payment_date,
    amount: nairaToKobo(parseFloat(r.amount)),
    currency: 'NGN',
    paymentReference: r.payment_reference || null,
    raw: r as unknown as Record<string, unknown>,
  }));
}

// Re-export formatNaira for the UI
export { formatNaira };
