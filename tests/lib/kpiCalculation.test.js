/**
 * Unit tests for lib/kpiCalculation.js
 * Tests KPI scoring, grading, and SP level determination
 */
import {
  calculateKpiHasilKinerja,
  calculatePajakBulananScore,
  calculatePembukuanScore,
  calculateTahunanScore,
  calculateKpiEfektivitasWaktu,
  calculateDeadlineCompliance,
  determineSPLevel,
  getKPIGrade,
  calculateOverallKPI,
} from '@/lib/kpiCalculation';

// ============================================================
// calculateKpiHasilKinerja
// ============================================================
describe('calculateKpiHasilKinerja', () => {
  it('should calculate base score with default weights (40/40/20)', () => {
    const result = calculateKpiHasilKinerja({
      pajakBulananScore: 100,
      pembukuanScore: 100,
      tahunanScore: 100,
    });
    // (100*0.4) + (100*0.4) + (100*0.2) = 100
    expect(result).toBe(100);
  });

  it('should apply warning letter deduction (5 per letter)', () => {
    const result = calculateKpiHasilKinerja({
      pajakBulananScore: 100,
      pembukuanScore: 100,
      tahunanScore: 100,
      warningLetterCount: 2,
    });
    // 100 - (2*5) = 90
    expect(result).toBe(90);
  });

  it('should apply SP2DK deduction using count when penaltyTotal is null', () => {
    const result = calculateKpiHasilKinerja({
      pajakBulananScore: 100,
      pembukuanScore: 100,
      tahunanScore: 100,
      sp2dkCount: 3,
      sp2dkPenaltyTotal: null,
    });
    // 100 - (3*5) = 85
    expect(result).toBe(85);
  });

  it('should use sp2dkPenaltyTotal when provided', () => {
    const result = calculateKpiHasilKinerja({
      pajakBulananScore: 100,
      pembukuanScore: 100,
      tahunanScore: 100,
      sp2dkCount: 3,
      sp2dkPenaltyTotal: 7,
    });
    // 100 - 7 = 93
    expect(result).toBe(93);
  });

  it('should never return below 0', () => {
    const result = calculateKpiHasilKinerja({
      pajakBulananScore: 10,
      pembukuanScore: 10,
      tahunanScore: 10,
      warningLetterCount: 10,
      sp2dkCount: 10,
    });
    // (10*0.4)+(10*0.4)+(10*0.2) - (50+50) = 10 - 100 = clamped to 0
    expect(result).toBe(0);
  });

  it('should handle all zeros', () => {
    const result = calculateKpiHasilKinerja({});
    expect(result).toBe(0);
  });

  it('should handle mixed scores with deductions', () => {
    const result = calculateKpiHasilKinerja({
      pajakBulananScore: 80,
      pembukuanScore: 60,
      tahunanScore: 90,
      warningLetterCount: 1,
      sp2dkCount: 1,
    });
    // (80*0.4)+(60*0.4)+(90*0.2) - (5+5) = 32+24+18 - 10 = 64
    expect(result).toBe(64);
  });

  it('should round to 2 decimal places', () => {
    const result = calculateKpiHasilKinerja({
      pajakBulananScore: 33,
      pembukuanScore: 33,
      tahunanScore: 33,
    });
    // (33*0.4)+(33*0.4)+(33*0.2) = 13.2+13.2+6.6 = 33
    expect(result).toBe(33);
  });
});

// ============================================================
// calculatePajakBulananScore
// ============================================================
describe('calculatePajakBulananScore', () => {
  it('should return 100 for empty array', () => {
    expect(calculatePajakBulananScore([])).toBe(100);
  });

  it('should return 100 for null input', () => {
    expect(calculatePajakBulananScore(null)).toBe(100);
  });

  it('should return 100 for undefined input', () => {
    expect(calculatePajakBulananScore(undefined)).toBe(100);
  });

  it('should calculate score based on completed PPh fields', () => {
    const periods = [
      { pph_payment_status: 'completed', pph_filing_status: 'completed' },
    ];
    // 2/2 = 100%
    expect(calculatePajakBulananScore(periods)).toBe(100);
  });

  it('should count excepted status as completed', () => {
    const periods = [
      { pph_payment_status: 'excepted', pph_filing_status: 'excepted' },
    ];
    expect(calculatePajakBulananScore(periods)).toBe(100);
  });

  it('should count incomplete fields', () => {
    const periods = [
      { pph_payment_status: 'completed', pph_filing_status: 'pending' },
    ];
    // 1/2 = 50%
    expect(calculatePajakBulananScore(periods)).toBe(50);
  });

  it('should include PPN fields when ppn_payment_deadline exists', () => {
    const periods = [
      {
        pph_payment_status: 'completed',
        pph_filing_status: 'completed',
        ppn_payment_deadline: '2024-03-31',
        ppn_payment_status: 'completed',
        ppn_filing_status: 'pending',
      },
    ];
    // 3/4 = 75%
    expect(calculatePajakBulananScore(periods)).toBe(75);
  });

  it('should handle multiple periods', () => {
    const periods = [
      { pph_payment_status: 'completed', pph_filing_status: 'completed' },
      { pph_payment_status: 'pending', pph_filing_status: 'pending' },
    ];
    // 2/4 = 50%
    expect(calculatePajakBulananScore(periods)).toBe(50);
  });

  it('should handle all pending', () => {
    const periods = [
      { pph_payment_status: 'pending', pph_filing_status: 'pending' },
    ];
    expect(calculatePajakBulananScore(periods)).toBe(0);
  });
});

// ============================================================
// calculatePembukuanScore
// ============================================================
describe('calculatePembukuanScore', () => {
  it('should return 100 for empty/null input', () => {
    expect(calculatePembukuanScore([])).toBe(100);
    expect(calculatePembukuanScore(null)).toBe(100);
    expect(calculatePembukuanScore(undefined)).toBe(100);
  });

  it('should calculate based on completed bookkeeping', () => {
    const periods = [
      { bookkeeping_status: 'completed' },
      { bookkeeping_status: 'pending' },
    ];
    expect(calculatePembukuanScore(periods)).toBe(50);
  });

  it('should count excepted as completed', () => {
    const periods = [{ bookkeeping_status: 'excepted' }];
    expect(calculatePembukuanScore(periods)).toBe(100);
  });
});

// ============================================================
// calculateTahunanScore
// ============================================================
describe('calculateTahunanScore', () => {
  it('should return 100 for empty/null input', () => {
    expect(calculateTahunanScore([])).toBe(100);
    expect(calculateTahunanScore(null)).toBe(100);
  });

  it('should calculate based on filed count', () => {
    const filings = [
      { status: 'filed' },
      { status: 'pending' },
      { status: 'filed' },
    ];
    // 2/3 = 67%
    expect(calculateTahunanScore(filings)).toBe(67);
  });

  it('should return 0 when nothing is filed', () => {
    const filings = [{ status: 'pending' }];
    expect(calculateTahunanScore(filings)).toBe(0);
  });
});

// ============================================================
// calculateKpiEfektivitasWaktu
// ============================================================
describe('calculateKpiEfektivitasWaktu', () => {
  it('should return 100 when all defaults (zero targets)', () => {
    const result = calculateKpiEfektivitasWaktu({});
    // hoursEfficiency=100 (targetHours=0), deadlineCompliance=100 (totalTasks=0)
    expect(result).toBe(100);
  });

  it('should cap hours efficiency at 100%', () => {
    const result = calculateKpiEfektivitasWaktu({
      targetHours: 100,
      actualHours: 200,
      tasksOnTime: 10,
      totalTasks: 10,
    });
    // hoursEff = min(100, 200%) = 100, deadline = 100
    expect(result).toBe(100);
  });

  it('should calculate partial efficiency', () => {
    const result = calculateKpiEfektivitasWaktu({
      targetHours: 100,
      actualHours: 50,
      tasksOnTime: 8,
      totalTasks: 10,
    });
    // hoursEff = 50, deadline = 80
    // (50*0.5)+(80*0.5) = 25+40 = 65
    expect(result).toBe(65);
  });

  it('should handle zero target hours gracefully', () => {
    const result = calculateKpiEfektivitasWaktu({
      targetHours: 0,
      actualHours: 50,
      tasksOnTime: 5,
      totalTasks: 10,
    });
    // hoursEff = 100 (default), deadline = 50
    expect(result).toBe(75);
  });
});

// ============================================================
// calculateDeadlineCompliance
// ============================================================
describe('calculateDeadlineCompliance', () => {
  it('should return default for empty input', () => {
    const result = calculateDeadlineCompliance([]);
    expect(result).toEqual({ onTime: 0, total: 0, rate: 100 });
  });

  it('should count excepted as on time', () => {
    const result = calculateDeadlineCompliance([
      {
        pph_payment_status: 'excepted',
        pph_filing_status: 'excepted',
        bookkeeping_status: 'excepted',
        bookkeeping_employee_deadline: '2099-12-31',
      },
    ]);
    expect(result.onTime).toBe(3);
    expect(result.total).toBe(3);
    expect(result.rate).toBe(100);
  });
});

// ============================================================
// determineSPLevel
// ============================================================
describe('determineSPLevel', () => {
  it('should return Normal for KPI >= 60', () => {
    expect(determineSPLevel(60)).toEqual({ level: 0, description: 'Normal' });
    expect(determineSPLevel(100)).toEqual({ level: 0, description: 'Normal' });
  });

  it('should return SP1 for KPI < 60 with less than 2 years low', () => {
    expect(determineSPLevel(50, 0)).toEqual({ level: 1, description: 'SP1 - Peringatan Pertama' });
    expect(determineSPLevel(59, 1)).toEqual({ level: 1, description: 'SP1 - Peringatan Pertama' });
  });

  it('should return SP2 for KPI < 60 with exactly 2 years', () => {
    expect(determineSPLevel(50, 2)).toEqual({ level: 2, description: 'SP2 - Peringatan Kedua' });
  });

  it('should return SP3 for KPI < 60 with 3+ years', () => {
    expect(determineSPLevel(50, 3)).toEqual({ level: 3, description: 'SP3 - Peringatan Terakhir (PHK Warning)' });
    expect(determineSPLevel(50, 5)).toEqual({ level: 3, description: 'SP3 - Peringatan Terakhir (PHK Warning)' });
  });
});

// ============================================================
// getKPIGrade
// ============================================================
describe('getKPIGrade', () => {
  it('should return grade A for score >= 90', () => {
    expect(getKPIGrade(90)).toEqual({ grade: 'A', color: 'green', description: 'Sangat Baik' });
    expect(getKPIGrade(100)).toEqual({ grade: 'A', color: 'green', description: 'Sangat Baik' });
  });

  it('should return grade B for 80-89', () => {
    expect(getKPIGrade(80)).toEqual({ grade: 'B', color: 'blue', description: 'Baik' });
    expect(getKPIGrade(89)).toEqual({ grade: 'B', color: 'blue', description: 'Baik' });
  });

  it('should return grade C for 70-79', () => {
    expect(getKPIGrade(70)).toEqual({ grade: 'C', color: 'yellow', description: 'Cukup' });
  });

  it('should return grade D for 60-69', () => {
    expect(getKPIGrade(60)).toEqual({ grade: 'D', color: 'orange', description: 'Kurang' });
  });

  it('should return grade E for < 60', () => {
    expect(getKPIGrade(59)).toEqual({ grade: 'E', color: 'red', description: 'Sangat Kurang' });
    expect(getKPIGrade(0)).toEqual({ grade: 'E', color: 'red', description: 'Sangat Kurang' });
  });
});

// ============================================================
// calculateOverallKPI
// ============================================================
describe('calculateOverallKPI', () => {
  it('should average two metrics equally', () => {
    expect(calculateOverallKPI(80, 60)).toBe(70);
  });

  it('should handle 100/100', () => {
    expect(calculateOverallKPI(100, 100)).toBe(100);
  });

  it('should handle 0/0', () => {
    expect(calculateOverallKPI(0, 0)).toBe(0);
  });

  it('should round to 2 decimal places', () => {
    // (33 + 67) / 2 = 50
    expect(calculateOverallKPI(33, 67)).toBe(50);
  });
});
