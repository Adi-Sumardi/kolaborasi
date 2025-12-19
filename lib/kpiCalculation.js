// KPI Calculation utilities for Tax Consulting

/**
 * Calculate KPI Hasil Kinerja (Work Results)
 * Base Score = (Pajak_Bulanan × 40%) + (Pembukuan × 40%) + (Tahunan × 20%)
 * Deductions = (Surat_Teguran × 5%) + (SP2DK × 5%)
 * Final = Base Score - Deductions
 */
export function calculateKpiHasilKinerja({
  pajakBulananScore = 0,
  pembukuanScore = 0,
  tahunanScore = 0,
  warningLetterCount = 0,
  sp2dkCount = 0
}) {
  const baseScore = (pajakBulananScore * 0.4) + (pembukuanScore * 0.4) + (tahunanScore * 0.2);
  const deductions = (warningLetterCount * 5) + (sp2dkCount * 5);
  const finalScore = Math.max(0, baseScore - deductions);
  return Math.round(finalScore * 100) / 100;
}

/**
 * Calculate monthly tax compliance score
 * Score based on completion status of PPh and PPN obligations
 */
export function calculatePajakBulananScore(taxPeriods) {
  if (!taxPeriods || taxPeriods.length === 0) return 100;

  let totalFields = 0;
  let completedFields = 0;

  taxPeriods.forEach(period => {
    // PPh Payment
    totalFields++;
    if (period.pph_payment_status === 'completed' || period.pph_payment_status === 'excepted') {
      completedFields++;
    }

    // PPh Filing
    totalFields++;
    if (period.pph_filing_status === 'completed' || period.pph_filing_status === 'excepted') {
      completedFields++;
    }

    // PPN (only if applicable - PKP clients)
    if (period.ppn_payment_deadline) {
      totalFields++;
      if (period.ppn_payment_status === 'completed' || period.ppn_payment_status === 'excepted') {
        completedFields++;
      }

      totalFields++;
      if (period.ppn_filing_status === 'completed' || period.ppn_filing_status === 'excepted') {
        completedFields++;
      }
    }
  });

  if (totalFields === 0) return 100;
  return Math.round((completedFields / totalFields) * 100);
}

/**
 * Calculate monthly bookkeeping score
 */
export function calculatePembukuanScore(taxPeriods) {
  if (!taxPeriods || taxPeriods.length === 0) return 100;

  const completedCount = taxPeriods.filter(p =>
    p.bookkeeping_status === 'completed' || p.bookkeeping_status === 'excepted'
  ).length;

  return Math.round((completedCount / taxPeriods.length) * 100);
}

/**
 * Calculate annual tax filing score
 */
export function calculateTahunanScore(annualFilings) {
  if (!annualFilings || annualFilings.length === 0) return 100;

  const filedCount = annualFilings.filter(f => f.status === 'filed').length;
  return Math.round((filedCount / annualFilings.length) * 100);
}

/**
 * Calculate KPI Efektivitas Waktu (Time Efficiency)
 * Hours_Efficiency = min(100, actual_hours / target_hours × 100)
 * Deadline_Compliance = tasks_on_time / total_tasks × 100
 * Final = (Hours_Efficiency × 50%) + (Deadline_Compliance × 50%)
 */
export function calculateKpiEfektivitasWaktu({
  targetHours = 0,
  actualHours = 0,
  tasksOnTime = 0,
  totalTasks = 0
}) {
  // Hours efficiency (capped at 100%)
  const hoursEfficiency = targetHours > 0
    ? Math.min(100, (actualHours / targetHours) * 100)
    : 100;

  // Deadline compliance
  const deadlineCompliance = totalTasks > 0
    ? (tasksOnTime / totalTasks) * 100
    : 100;

  const finalScore = (hoursEfficiency * 0.5) + (deadlineCompliance * 0.5);
  return Math.round(finalScore * 100) / 100;
}

/**
 * Calculate deadline compliance from tax periods
 */
export function calculateDeadlineCompliance(taxPeriods) {
  if (!taxPeriods || taxPeriods.length === 0) return { onTime: 0, total: 0, rate: 100 };

  let totalTasks = 0;
  let onTimeTasks = 0;
  const now = new Date();

  taxPeriods.forEach(period => {
    // Check PPh Payment
    totalTasks++;
    if (period.pph_payment_status === 'completed' && period.pph_payment_completed_at) {
      if (new Date(period.pph_payment_completed_at) <= new Date(period.pph_payment_deadline)) {
        onTimeTasks++;
      }
    } else if (period.pph_payment_status === 'excepted') {
      onTimeTasks++; // Excepted counts as on time
    } else if (new Date(period.pph_payment_deadline) > now) {
      onTimeTasks++; // Not yet due, counts as on time
    }

    // Check PPh Filing
    totalTasks++;
    if (period.pph_filing_status === 'completed' && period.pph_filing_completed_at) {
      if (new Date(period.pph_filing_completed_at) <= new Date(period.pph_filing_deadline)) {
        onTimeTasks++;
      }
    } else if (period.pph_filing_status === 'excepted') {
      onTimeTasks++;
    } else if (new Date(period.pph_filing_deadline) > now) {
      onTimeTasks++;
    }

    // Check PPN if applicable
    if (period.ppn_payment_deadline) {
      totalTasks += 2; // Payment and Filing

      if (period.ppn_payment_status === 'completed' || period.ppn_payment_status === 'excepted') {
        onTimeTasks++;
      } else if (new Date(period.ppn_payment_deadline) > now) {
        onTimeTasks++;
      }

      if (period.ppn_filing_status === 'completed' || period.ppn_filing_status === 'excepted') {
        onTimeTasks++;
      } else if (new Date(period.ppn_filing_deadline) > now) {
        onTimeTasks++;
      }
    }

    // Check Bookkeeping
    totalTasks++;
    if (period.bookkeeping_status === 'completed' || period.bookkeeping_status === 'excepted') {
      onTimeTasks++;
    } else if (new Date(period.bookkeeping_employee_deadline) > now) {
      onTimeTasks++;
    }
  });

  return {
    onTime: onTimeTasks,
    total: totalTasks,
    rate: totalTasks > 0 ? Math.round((onTimeTasks / totalTasks) * 100) : 100
  };
}

/**
 * Determine SP (Surat Peringatan) level based on KPI
 * KPI < 60% triggers SP
 * Year 1-2: SP1
 * Year 3+: Termination warning
 */
export function determineSPLevel(kpiScore, yearsLowKpi = 0) {
  if (kpiScore >= 60) {
    return { level: 0, description: 'Normal' };
  }

  if (yearsLowKpi < 2) {
    return { level: 1, description: 'SP1 - Peringatan Pertama' };
  } else if (yearsLowKpi === 2) {
    return { level: 2, description: 'SP2 - Peringatan Kedua' };
  } else {
    return { level: 3, description: 'SP3 - Peringatan Terakhir (PHK Warning)' };
  }
}

/**
 * Get KPI grade and color based on score
 */
export function getKPIGrade(score) {
  if (score >= 90) return { grade: 'A', color: 'green', description: 'Sangat Baik' };
  if (score >= 80) return { grade: 'B', color: 'blue', description: 'Baik' };
  if (score >= 70) return { grade: 'C', color: 'yellow', description: 'Cukup' };
  if (score >= 60) return { grade: 'D', color: 'orange', description: 'Kurang' };
  return { grade: 'E', color: 'red', description: 'Sangat Kurang' };
}

/**
 * Calculate overall KPI from both metrics
 */
export function calculateOverallKPI(hasilKinerja, efektivitasWaktu) {
  // Both metrics have equal weight
  return Math.round(((hasilKinerja + efektivitasWaktu) / 2) * 100) / 100;
}

export default {
  calculateKpiHasilKinerja,
  calculatePajakBulananScore,
  calculatePembukuanScore,
  calculateTahunanScore,
  calculateKpiEfektivitasWaktu,
  calculateDeadlineCompliance,
  determineSPLevel,
  getKPIGrade,
  calculateOverallKPI
};
