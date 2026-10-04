/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type TestTier = 'unit' | 'integration' | 'system';

export type TestStatus = 'idle' | 'running' | 'passed' | 'failed' | 'skipped';

export interface Assertion {
  description: string;
  passed: boolean;
  expected?: any;
  actual?: any;
  message?: string;
}

export interface TestResult {
  id: string;
  tier: TestTier;
  functionName: string;
  name: string;
  description: string;
  status: TestStatus;
  durationMs: number;
  assertions: Assertion[];
  error?: string;
  inputSnapshot?: string;
  outputSnapshot?: string;
  details?: string[];
}

export interface TestSuiteSummary {
  timestamp: string;
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  passRate: number; // percentage
  unitTests: { total: number; passed: number; failed: number };
  integrationTests: { total: number; passed: number; failed: number };
  systemTests: { total: number; passed: number; failed: number };
  testedCsvName?: string;
  testedTicksCount?: number;
  testedCandlesCount?: number;
}

export interface TestContext {
  customTicks?: import('./trading').Tick[];
  customCsvText?: string;
  datasetName?: string;
}

export interface TestCase {
  id: string;
  tier: TestTier;
  functionName: string;
  name: string;
  description: string;
  run: (context: TestContext) => Promise<TestResult> | TestResult;
}

export type TargetFunctionName =
  | 'parseCsvTicks'
  | 'ticksToCandles'
  | 'toHeikinAshi'
  | 'computeExtremums'
  | 'computeChandelierExit'
  | 'simulateTrades'
  | 'computeNoiseReductionAnalytics'
  | 'all_pipeline';

export interface InvariantCheck {
  name: string;
  passed: boolean;
  details: string;
  expected?: string;
  actual?: string;
}

export interface FunctionOutputResult {
  functionName: TargetFunctionName;
  functionDisplayName: string;
  executionTimeMs: number;
  timestamp: string;
  datasetName: string;
  inputSummary: {
    description: string;
    itemCount: number;
    sampleText?: string;
  };
  outputSummary: {
    description: string;
    itemCount: number;
    metricsSummary?: Record<string, string | number>;
  };
  invariants: InvariantCheck[];
  allInvariantsPassed: boolean;
  data: any;
  tableColumns: string[];
  tableRows: (string | number)[][];
  jsonSnapshot: string;
  csvExportText?: string;
}

export interface RegressionBaseline {
  timestamp: string;
  functionName: TargetFunctionName;
  datasetName: string;
  itemCount: number;
  firstItemHash: string;
  summaryMetrics: Record<string, string | number>;
  jsonSnapshot: string;
}
