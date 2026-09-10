import { loadPreviewData, formatNaira } from '@/lib/preview-data';
import { AlertTriangle, TrendingDown, Wallet, AlertCircle, CheckCircle2, FileWarning, ArrowRight } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  low: 'bg-blue-100 text-blue-800 border-blue-200',
};

const TYPE_LABELS: Record<string, string> = {
  underbilling: 'Underbilling',
  missing_billing: 'Missing billing',
  underpayment: 'Underpayment',
  unallocated_payment: 'Unallocated payment',
  missed_escalation: 'Missed escalation',
  duplicate_anomalous_billing: 'Duplicate / anomalous billing',
};

export default function Home() {
  const { result, fixtures, asOf } = loadPreviewData();
  const exceptions = result.exceptions;
  const totalVariance = result.summary.total_variance;
  const totalExceptions = Object.values(result.summary.counts_by_type).reduce((a, b) => a + b, 0);

  // Sort exceptions by severity (critical first), then by variance (largest first)
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const sortedExceptions = [...exceptions].sort((a, b) => {
    if (severityOrder[a.severity] !== severityOrder[b.severity]) {
      return severityOrder[a.severity] - severityOrder[b.severity];
    }
    return b.financial_variance - a.financial_variance;
  });

  // Group by type
  const byType = exceptions.reduce<Record<string, typeof exceptions>>((acc, ex) => {
    (acc[ex.exception_type] ??= []).push(ex);
    return acc;
  }, {});

  // Severity counts
  const severityCounts = {
    critical: exceptions.filter((e) => e.severity === 'critical').length,
    high: exceptions.filter((e) => e.severity === 'high').length,
    medium: exceptions.filter((e) => e.severity === 'medium').length,
    low: exceptions.filter((e) => e.severity === 'low').length,
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white font-bold text-sm">
                F
              </div>
              <div>
                <h1 className="text-base font-semibold text-slate-900">Flatrun</h1>
                <p className="text-xs text-slate-500">Revenue Control — Engine Preview</p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm text-slate-600">
              <span className="hidden sm:inline">Reconciled as of {asOf}</span>
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                Preview · Fixtures
              </Badge>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Hero summary */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Potential discrepancies detected: ₦{formatNaira(totalVariance)}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {totalExceptions} exceptions across {fixtures.tenants} tenants · {fixtures.properties} properties · {fixtures.leases} leases · {fixtures.invoices} invoices · {fixtures.payments} payments reviewed
          </p>
        </div>

        {/* Top stats */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Expected revenue (monthly)"
            value={`₦${formatNaira(result.summary.expected_revenue)}`}
            icon={<Wallet className="h-4 w-4 text-slate-500" />}
            tone="neutral"
          />
          <StatCard
            label="Billed revenue"
            value={`₦${formatNaira(result.summary.billed_revenue)}`}
            icon={<FileWarning className="h-4 w-4 text-slate-500" />}
            tone="neutral"
          />
          <StatCard
            label="Collected revenue"
            value={`₦${formatNaira(result.summary.collected_revenue)}`}
            icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
            tone="neutral"
          />
          <StatCard
            label="Total variance"
            value={`₦${formatNaira(totalVariance)}`}
            icon={<TrendingDown className="h-4 w-4 text-red-600" />}
            tone="negative"
          />
        </div>

        {/* Severity breakdown */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SeverityCard label="Critical" count={severityCounts.critical} tone="critical" />
          <SeverityCard label="High" count={severityCounts.high} tone="high" />
          <SeverityCard label="Medium" count={severityCounts.medium} tone="medium" />
          <SeverityCard label="Low" count={severityCounts.low} tone="low" />
        </div>

        {/* Tabs: by type / all exceptions */}
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="all">All exceptions ({totalExceptions})</TabsTrigger>
            <TabsTrigger value="by-type">By type</TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            <Card>
              <CardHeader>
                <CardTitle>Detected exceptions</CardTitle>
                <CardDescription>
                  Sorted by severity (critical first), then by financial variance (largest first). Each exception is traceable to its source records.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[100px]">Severity</TableHead>
                        <TableHead className="w-[200px]">Type</TableHead>
                        <TableHead>Tenant</TableHead>
                        <TableHead className="text-right">Variance</TableHead>
                        <TableHead className="text-right">Confidence</TableHead>
                        <TableHead className="w-[40px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedExceptions.map((ex, idx) => (
                        <TableRow key={idx}>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={SEVERITY_STYLES[ex.severity]}
                            >
                              {ex.severity}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">
                            {TYPE_LABELS[ex.exception_type] ?? ex.exception_type}
                            {ex.sub_type && ex.sub_type !== 'duplicate' && (
                              <span className="ml-2 text-xs text-slate-500">
                                ({ex.sub_type.replace('_', ' ')})
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">
                            {ex.tenant_external_id ?? '—'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            ₦{formatNaira(ex.financial_variance)}
                          </TableCell>
                          <TableCell className="text-right text-sm text-slate-500">
                            {ex.confidence.toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <ArrowRight className="h-4 w-4 text-slate-400" />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="by-type">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {Object.entries(byType).map(([type, typeExceptions]) => {
                const variance = typeExceptions.reduce(
                  (acc, e) => acc + e.financial_variance,
                  0,
                );
                return (
                  <Card key={type}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base">
                            {TYPE_LABELS[type] ?? type}
                          </CardTitle>
                          <CardDescription>
                            {typeExceptions.length} case{typeExceptions.length !== 1 ? 's' : ''}
                          </CardDescription>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-slate-900">
                            ₦{formatNaira(variance)}
                          </div>
                          <div className="text-xs text-slate-500">variance</div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {typeExceptions.map((ex, i) => (
                          <li key={i} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className={SEVERITY_STYLES[ex.severity]}
                              >
                                {ex.severity}
                              </Badge>
                              <span className="text-slate-600">
                                {ex.tenant_external_id ?? '—'}
                              </span>
                            </div>
                            <span className="font-mono text-slate-900">
                              ₦{formatNaira(ex.financial_variance)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>

        {/* Exception details — full list with explanations */}
        <div className="mt-8">
          <h3 className="mb-4 text-lg font-semibold text-slate-900">Exception details</h3>
          <div className="space-y-4">
            {sortedExceptions.map((ex, idx) => (
              <Card key={idx}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <Badge
                        variant="outline"
                        className={SEVERITY_STYLES[ex.severity]}
                      >
                        {ex.severity}
                      </Badge>
                      <div>
                        <div className="font-semibold text-slate-900">
                          {TYPE_LABELS[ex.exception_type] ?? ex.exception_type}
                          {ex.sub_type && ex.sub_type !== 'duplicate' && (
                            <span className="ml-2 text-sm font-normal text-slate-500">
                              ({ex.sub_type.replace('_', ' ')})
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500">
                          {ex.tenant_external_id ?? 'No tenant'} · {ex.lease_external_id ?? 'No lease'}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-slate-900">
                        ₦{formatNaira(ex.financial_variance)}
                      </div>
                      <div className="text-xs text-slate-500">
                        confidence {ex.confidence.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="rounded-md bg-slate-50 p-3">
                    <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                      <AlertCircle className="h-3 w-3" />
                      Deterministic explanation
                    </div>
                    <p className="text-sm leading-relaxed text-slate-700">
                      {ex.explanation}
                    </p>
                  </div>
                  {/* Evidence summary */}
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                    {ex.source_records.lease && (
                      <span className="rounded bg-slate-100 px-2 py-1">
                        lease: {ex.source_records.lease.externalId}
                      </span>
                    )}
                    {ex.source_records.invoices && ex.source_records.invoices.length > 0 && (
                      <span className="rounded bg-slate-100 px-2 py-1">
                        {ex.source_records.invoices.length} invoice(s)
                      </span>
                    )}
                    {ex.source_records.payments && ex.source_records.payments.length > 0 && (
                      <span className="rounded bg-slate-100 px-2 py-1">
                        {ex.source_records.payments.length} payment(s)
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Footer note */}
        <div className="mt-12 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
            <div className="text-sm text-amber-900">
              <p className="font-medium">This is a static preview using planted test fixtures.</p>
              <p className="mt-1 text-amber-800">
                The data shown is from <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">packages/reconciliation-engine/test/fixtures/</code> —
                6 tenants with deliberately planted discrepancies (Tenant A clean, B underbilling, C missed escalation, D underpayment, E unallocated payment, F duplicate invoice).
                Slice 1 will add authentication and organisation onboarding; Slice 3 will let you upload your own CSVs;
                Slice 4 will run the engine against real imported data and replace this preview with the live dashboard.
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t bg-white py-6">
        <div className="mx-auto max-w-7xl px-4 text-center text-xs text-slate-500 sm:px-6 lg:px-8">
          Flatrun · Revenue Control · Engine preview (Slice 2) · Source of truth: <span className="font-mono">/docs/product-brief.md</span>
        </div>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: 'neutral' | 'negative';
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {label}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div
          className={`text-2xl font-bold ${
            tone === 'negative' ? 'text-red-700' : 'text-slate-900'
          }`}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function SeverityCard({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: 'critical' | 'high' | 'medium' | 'low';
}) {
  const toneStyles: Record<string, string> = {
    critical: 'border-red-200 bg-red-50',
    high: 'border-orange-200 bg-orange-50',
    medium: 'border-yellow-200 bg-yellow-50',
    low: 'border-blue-200 bg-blue-50',
  };
  const textStyles: Record<string, string> = {
    critical: 'text-red-700',
    high: 'text-orange-700',
    medium: 'text-yellow-700',
    low: 'text-blue-700',
  };
  return (
    <div className={`rounded-lg border p-4 ${toneStyles[tone]}`}>
      <div className={`text-xs font-medium uppercase tracking-wide ${textStyles[tone]}`}>
        {label}
      </div>
      <div className={`mt-1 text-3xl font-bold ${textStyles[tone]}`}>
        {count}
      </div>
    </div>
  );
}
