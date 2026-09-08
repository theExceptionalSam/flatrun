#!/usr/bin/env bun
/**
 * CLI runner for the reconciliation engine.
 *
 * Usage:
 *   bun run cli/reconcile.ts <fixtures-dir>
 *
 * Loads the five CSVs (properties, tenants, leases, billing, payments) from
 * the given directory, runs the engine, and prints a reconciliation report.
 *
 * This is the "first real milestone" gate from /docs/build-slices.md Slice 2:
 *   "If this doesn't work, no UI gets built."
 *
 * The fixtures in test/fixtures/ contain planted discrepancies:
 *   - Tenant A: clean (0 exceptions)
 *   - Tenant B: 1 underbilling (March 2025, ₦50,000)
 *   - Tenant C: 1 missed escalation (June 2025, ₦25,000)
 *   - Tenant D: 1 underpayment (March 2025, ₦50,000)
 *   - Tenant E: 1 unallocated payment (₦500,000)
 *   - Tenant F: 1 duplicate invoice (March 2025, ₦500,000)
 *
 * Expected total: 5 exceptions.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runReconciliation, nairaToKobo, formatNaira, koboToNaira } from '../src/index.ts';
import type {
  NormalisedProperty,
  NormalisedTenant,
  NormalisedLease,
  NormalisedInvoice,
  NormalisedPayment,
  EscalationType,
  LeaseFrequency,
  BillingType,
} from '../src/types.ts';

function main() {
  const fixturesDir = process.argv[2];
  if (!fixturesDir) {
    console.error('Usage: bun run cli/reconcile.ts <fixtures-dir>');
    process.exit(1);
  }

  const absDir = resolve(fixturesDir);
  try {
    statSync(absDir);
  } catch {
    console.error(`Directory not found: ${absDir}`);
    process.exit(1);
  }

  console.log(`Loading fixtures from: ${absDir}\n`);

  const properties = loadProperties(join(absDir, 'properties.csv'));
  const tenants = loadTenants(join(absDir, 'tenants.csv'));
  const leases = loadLeases(join(absDir, 'leases.csv'));
  const invoices = loadInvoices(join(absDir, 'billing.csv'));
  const payments = loadPayments(join(absDir, 'payments.csv'));

  console.log(`Loaded:`);
  console.log(`  Properties: ${properties.length}`);
  console.log(`  Tenants:     ${tenants.length}`);
  console.log(`  Leases:      ${leases.length}`);
  console.log(`  Invoices:    ${invoices.length}`);
  console.log(`  Payments:    ${payments.length}`);
  console.log();

  const asOf = '2025-09-30'; // Simulate running at end of September 2025

  console.log(`Running reconciliation (as of ${asOf})...\n`);

  const result = runReconciliation({
    properties,
    tenants,
    leases,
    invoices,
    payments,
    config: { asOf },
  });

  printReport(result);
}

function printReport(result: ReturnType<typeof runReconciliation>) {
  console.log('='.repeat(72));
  console.log('  REVENUE CONTROL — RECONCILIATION REPORT');
  console.log('='.repeat(72));
  console.log();

  console.log('RECORDS PROCESSED');
  console.log('-'.repeat(72));
  console.log(`  Properties:   ${result.summary.expected_revenue > 0 ? '✓' : '-'} (loaded)`);
  console.log(`  Expected revenue (monthly):   ₦${formatNaira(result.summary.expected_revenue)}`);
  console.log(`  Billed revenue (total):        ₦${formatNaira(result.summary.billed_revenue)}`);
  console.log(`  Collected revenue (total):    ₦${formatNaira(result.summary.collected_revenue)}`);
  console.log();

  const totalExceptions = Object.values(result.summary.counts_by_type).reduce((a, b) => a + b, 0);
  console.log('EXCEPTIONS');
  console.log('-'.repeat(72));
  console.log(`  Total: ${totalExceptions}`);
  console.log(`  Total variance: ₦${formatNaira(result.summary.total_variance)}`);
  console.log();

  console.log('  By type:');
  const typeLabels: Record<string, string> = {
    underbilling: 'Underbilling',
    missing_billing: 'Missing billing',
    underpayment: 'Underpayment',
    unallocated_payment: 'Unallocated payments',
    missed_escalation: 'Missed escalations',
    duplicate_anomalous_billing: 'Duplicate/anomalous billing',
  };

  // Compute variance by type
  const varianceByType: Record<string, number> = {};
  for (const ex of result.exceptions) {
    varianceByType[ex.exception_type] = (varianceByType[ex.exception_type] ?? 0) + ex.financial_variance;
  }

  for (const [type, label] of Object.entries(typeLabels)) {
    const count = result.summary.counts_by_type[type as keyof typeof result.summary.counts_by_type] ?? 0;
    const variance = varianceByType[type] ?? 0;
    if (count > 0) {
      console.log(`    ${label.padEnd(28)}: ${String(count).padStart(3)} case(s)   ₦${formatNaira(variance)}`);
    } else {
      console.log(`    ${label.padEnd(28)}: ${String(count).padStart(3)} case(s)`);
    }
  }
  console.log();

  console.log('EXCEPTION DETAILS');
  console.log('-'.repeat(72));
  for (const ex of result.exceptions) {
    console.log();
    console.log(`  [${ex.severity.toUpperCase()}] ${ex.exception_type}${ex.sub_type ? ` (${ex.sub_type})` : ''}`);
    console.log(`    Tenant:   ${ex.tenant_external_id ?? 'N/A'}`);
    console.log(`    Lease:    ${ex.lease_external_id ?? 'N/A'}`);
    console.log(`    Variance: ₦${formatNaira(ex.financial_variance)} ${ex.currency}`);
    console.log(`    Confidence: ${ex.confidence.toFixed(2)}`);
    console.log(`    Explanation: ${ex.explanation}`);
  }

  console.log();
  console.log('='.repeat(72));
  console.log(`  TOTAL: ${totalExceptions} exceptions, ₦${formatNaira(result.summary.total_variance)} variance`);
  console.log('='.repeat(72));
}

// ============================================================================
// CSV loading and normalisation
// ============================================================================

function parseCsv(path: string): Record<string, string>[] {
  const content = readFileSync(path, 'utf-8');
  const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
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
        i++; // skip escaped quote
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
  return result.map(s => s.trim());
}

function loadProperties(path: string): NormalisedProperty[] {
  const rows = parseCsv(path);
  return rows.map(r => ({
    id: `prop-${r.property_id}`,
    externalId: r.property_id,
    name: r.property_name,
    raw: r as unknown as Record<string, unknown>,
  }));
}

function loadTenants(path: string): NormalisedTenant[] {
  const rows = parseCsv(path);
  return rows.map(r => ({
    id: `tenant-${r.tenant_id}`,
    externalId: r.tenant_id,
    name: r.tenant_name,
    propertyId: r.property_id ? `prop-${r.property_id}` : null,
    raw: r as unknown as Record<string, unknown>,
  }));
}

function loadLeases(path: string): NormalisedLease[] {
  const rows = parseCsv(path);
  return rows.map(r => {
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

function loadInvoices(path: string): NormalisedInvoice[] {
  const rows = parseCsv(path);
  return rows.map(r => ({
    id: `inv-${r.invoice_id}`,
    externalId: r.invoice_id,
    tenantId: r.tenant_id ? `tenant-${r.tenant_id}` : null,
    tenantExternalId: r.tenant_id || null,
    leaseId: null, // will be inferred
    invoiceDate: r.invoice_date,
    amount: nairaToKobo(parseFloat(r.amount)),
    currency: 'NGN', // not in the brief's billing schema, default to NGN
    billingType: (r.billing_type || 'rent') as BillingType,
    raw: r as unknown as Record<string, unknown>,
  }));
}

function loadPayments(path: string): NormalisedPayment[] {
  const rows = parseCsv(path);
  return rows.map(r => ({
    id: `pay-${r.payment_id}`,
    externalId: r.payment_id,
    tenantId: r.tenant_id ? `tenant-${r.tenant_id}` : null,
    tenantExternalId: r.tenant_id || null,
    invoiceId: null, // will be inferred via matching
    paymentDate: r.payment_date,
    amount: nairaToKobo(parseFloat(r.amount)),
    currency: 'NGN',
    paymentReference: r.payment_reference || null,
    raw: r as unknown as Record<string, unknown>,
  }));
}

main();
