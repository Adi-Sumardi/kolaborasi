/**
 * Unit tests for lib/taxDeadlines.js
 * Tests deadline calculations for PPh, PPN, bookkeeping, and task types
 */
import {
  getPphPaymentDeadline,
  getPphFilingDeadline,
  getPpnDeadline,
  getBookkeepingEmployeeDeadline,
  getBookkeepingOwnerDeadline,
  getPphBadanDeadline,
  getPphOpDeadline,
  getSp2dkDeadline,
  generateTaxPeriodDeadlines,
  isOverdue,
  getDeadlineStatus,
  getMonthName,
  getPeriodLabel,
  calculateTaskDeadline,
  checkSubmissionLateness,
  getJobdeskDeadlines,
  getTaskTypeLabel,
  formatDeadlineDate,
  isDeadlineApproaching,
  isDeadlinePassed,
  getTaskDeadlineStatus,
  getDaysUntilDeadline,
  TASK_TYPE_LABELS,
} from '@/lib/taxDeadlines';

// ============================================================
// PPh Payment Deadline — tanggal 15 bulan berikutnya
// ============================================================
describe('getPphPaymentDeadline', () => {
  it('should return 15th of the next month for January 2024', () => {
    const d = getPphPaymentDeadline(1, 2024);
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(1); // Feb (0-indexed)
    expect(d.getDate()).toBe(15);
  });

  it('should roll over to next year for December', () => {
    const d = getPphPaymentDeadline(12, 2024);
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(0); // Jan
    expect(d.getDate()).toBe(15);
  });

  it('should handle June correctly', () => {
    const d = getPphPaymentDeadline(6, 2025);
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(6); // July
    expect(d.getDate()).toBe(15);
  });
});

// ============================================================
// PPh Filing Deadline — tanggal 20 bulan berikutnya
// ============================================================
describe('getPphFilingDeadline', () => {
  it('should return 20th of the next month', () => {
    const d = getPphFilingDeadline(3, 2024);
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(3); // April
    expect(d.getDate()).toBe(20);
  });

  it('should roll over to next year for December', () => {
    const d = getPphFilingDeadline(12, 2024);
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(20);
  });
});

// ============================================================
// PPN Deadline — akhir bulan berikutnya
// ============================================================
describe('getPpnDeadline', () => {
  it('should return last day of the next month for January 2024', () => {
    const d = getPpnDeadline(1, 2024);
    // Last day of Feb 2024 (leap year)
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(1); // Feb
    expect(d.getDate()).toBe(29); // Leap year
  });

  it('should return last day for non-leap February', () => {
    const d = getPpnDeadline(1, 2023);
    expect(d.getDate()).toBe(28);
  });

  it('should handle December to January next year', () => {
    const d = getPpnDeadline(12, 2024);
    // Last day of Jan 2025
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(0); // Jan
    expect(d.getDate()).toBe(31);
  });

  it('should return 30 for months with 30 days', () => {
    const d = getPpnDeadline(3, 2024); // Next month: April
    expect(d.getDate()).toBe(30);
  });

  it('should return 31 for months with 31 days', () => {
    const d = getPpnDeadline(6, 2024); // Next month: July
    expect(d.getDate()).toBe(31);
  });
});

// ============================================================
// Bookkeeping Deadlines
// ============================================================
describe('getBookkeepingEmployeeDeadline', () => {
  it('should return 25th of next month', () => {
    const d = getBookkeepingEmployeeDeadline(5, 2024);
    expect(d.getMonth()).toBe(5); // June
    expect(d.getDate()).toBe(25);
  });

  it('should roll over December to January next year', () => {
    const d = getBookkeepingEmployeeDeadline(12, 2024);
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(25);
  });
});

describe('getBookkeepingOwnerDeadline', () => {
  it('should return 30th for months with >= 30 days', () => {
    const d = getBookkeepingOwnerDeadline(6, 2024); // July has 31 days
    expect(d.getDate()).toBe(30);
  });

  it('should return last day of month for February (< 30 days)', () => {
    const d = getBookkeepingOwnerDeadline(1, 2024); // Feb 2024 has 29 days
    expect(d.getDate()).toBe(29);
  });

  it('should return 28 for Feb in non-leap year', () => {
    const d = getBookkeepingOwnerDeadline(1, 2023);
    expect(d.getDate()).toBe(28);
  });
});

// ============================================================
// Annual Tax Deadlines
// ============================================================
describe('getPphBadanDeadline', () => {
  it('should return April 30 of the next year', () => {
    const d = getPphBadanDeadline(2024);
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(3); // April
    expect(d.getDate()).toBe(30);
  });
});

describe('getPphOpDeadline', () => {
  it('should return March 31 of the next year', () => {
    const d = getPphOpDeadline(2024);
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(2); // March
    expect(d.getDate()).toBe(31);
  });
});

// ============================================================
// SP2DK Deadline — 14 days from letter date
// ============================================================
describe('getSp2dkDeadline', () => {
  it('should add 14 days to letter date', () => {
    const d = getSp2dkDeadline('2024-03-01');
    expect(d.getDate()).toBe(15);
    expect(d.getMonth()).toBe(2); // March
  });

  it('should roll over month boundary', () => {
    const d = getSp2dkDeadline('2024-01-25');
    // Jan 25 + 14 = Feb 8
    expect(d.getMonth()).toBe(1); // Feb
    expect(d.getDate()).toBe(8);
  });
});

// ============================================================
// generateTaxPeriodDeadlines
// ============================================================
describe('generateTaxPeriodDeadlines', () => {
  it('should generate basic deadlines without PPN', () => {
    const deadlines = generateTaxPeriodDeadlines(6, 2024, false);
    expect(deadlines.pph_payment_deadline).toBeDefined();
    expect(deadlines.pph_filing_deadline).toBeDefined();
    expect(deadlines.bookkeeping_employee_deadline).toBeDefined();
    expect(deadlines.bookkeeping_owner_deadline).toBeDefined();
    expect(deadlines.ppn_payment_deadline).toBeUndefined();
    expect(deadlines.ppn_filing_deadline).toBeUndefined();
  });

  it('should include PPN deadlines for PKP clients', () => {
    const deadlines = generateTaxPeriodDeadlines(6, 2024, true);
    expect(deadlines.ppn_payment_deadline).toBeDefined();
    expect(deadlines.ppn_filing_deadline).toBeDefined();
  });
});

// ============================================================
// isOverdue
// ============================================================
describe('isOverdue', () => {
  it('should return true for past deadlines', () => {
    expect(isOverdue('2020-01-01')).toBe(true);
  });

  it('should return false for future deadlines', () => {
    expect(isOverdue('2099-12-31')).toBe(false);
  });

  it('should return false for null/undefined', () => {
    expect(isOverdue(null)).toBe(false);
    expect(isOverdue(undefined)).toBe(false);
  });
});

// ============================================================
// getDeadlineStatus
// ============================================================
describe('getDeadlineStatus', () => {
  it('should return completed when status is completed', () => {
    expect(getDeadlineStatus('2020-01-01', 'completed')).toBe('completed');
  });

  it('should return pending when no deadline', () => {
    expect(getDeadlineStatus(null, 'pending')).toBe('pending');
  });

  it('should return overdue for past deadlines', () => {
    expect(getDeadlineStatus('2020-01-01', 'pending')).toBe('overdue');
  });

  it('should return pending for far-future deadlines', () => {
    expect(getDeadlineStatus('2099-12-31', 'pending')).toBe('pending');
  });
});

// ============================================================
// getMonthName & getPeriodLabel
// ============================================================
describe('getMonthName', () => {
  it('should return Indonesian month names', () => {
    expect(getMonthName(1)).toBe('Januari');
    expect(getMonthName(6)).toBe('Juni');
    expect(getMonthName(12)).toBe('Desember');
  });

  it('should return empty string for invalid month', () => {
    expect(getMonthName(0)).toBe('');
    expect(getMonthName(13)).toBe('');
  });
});

describe('getPeriodLabel', () => {
  it('should combine month name and year', () => {
    expect(getPeriodLabel(3, 2024)).toBe('Maret 2024');
  });
});

// ============================================================
// calculateTaskDeadline
// ============================================================
describe('calculateTaskDeadline', () => {
  it('should return 20th of next month for PPh types', () => {
    const types = ['pph_21', 'pph_unifikasi', 'pph_25', 'pph_badan', 'pph_05'];
    types.forEach(type => {
      const d = calculateTaskDeadline(type, 3, 2024);
      expect(d.getMonth()).toBe(3); // April
      expect(d.getDate()).toBe(20);
    });
  });

  it('should return 28+7 days for PPN', () => {
    const d = calculateTaskDeadline('ppn', 3, 2024);
    // April 28 + 7 = May 5
    expect(d.getMonth()).toBe(4); // May
    expect(d.getDate()).toBe(5);
  });

  it('should handle December rollover for PPh', () => {
    const d = calculateTaskDeadline('pph_21', 12, 2024);
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(0); // Jan
    expect(d.getDate()).toBe(20);
  });

  it('should handle December rollover for PPN', () => {
    const d = calculateTaskDeadline('ppn', 12, 2024);
    // Jan 28 + 7 = Feb 4
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(1); // Feb
    expect(d.getDate()).toBe(4);
  });
});

// ============================================================
// checkSubmissionLateness
// ============================================================
describe('checkSubmissionLateness', () => {
  it('should return not late when submitted before deadline', () => {
    const result = checkSubmissionLateness('2024-03-10', '2024-03-15');
    expect(result.isLate).toBe(false);
    expect(result.lateDays).toBe(0);
    expect(result.deduction).toBe(0);
  });

  it('should return not late when submitted on deadline day', () => {
    const result = checkSubmissionLateness('2024-03-15T12:00:00', '2024-03-15');
    expect(result.isLate).toBe(false);
  });

  it('should return late with deduction when submitted after deadline', () => {
    const result = checkSubmissionLateness('2024-03-17T10:00:00', '2024-03-15');
    expect(result.isLate).toBe(true);
    expect(result.lateDays).toBeGreaterThan(0);
    expect(result.deduction).toBe(5);
  });
});

// ============================================================
// getJobdeskDeadlines
// ============================================================
describe('getJobdeskDeadlines', () => {
  it('should return deadlines for each task type', () => {
    const result = getJobdeskDeadlines(['pph_21', 'ppn'], 6, 2024);
    expect(result).toHaveLength(2);
    expect(result[0].taskType).toBe('pph_21');
    expect(result[0].label).toBe('PPh 21');
    expect(result[0].deadline).toBeDefined();
    expect(result[0].deadlineFormatted).toBeDefined();
    expect(result[1].taskType).toBe('ppn');
    expect(result[1].label).toBe('PPN');
  });

  it('should return empty array for missing params', () => {
    expect(getJobdeskDeadlines(null, 6, 2024)).toEqual([]);
    expect(getJobdeskDeadlines(['pph_21'], null, 2024)).toEqual([]);
    expect(getJobdeskDeadlines(['pph_21'], 6, null)).toEqual([]);
  });
});

// ============================================================
// getTaskTypeLabel
// ============================================================
describe('getTaskTypeLabel', () => {
  it('should return known labels', () => {
    expect(getTaskTypeLabel('pph_21')).toBe('PPh 21');
    expect(getTaskTypeLabel('ppn')).toBe('PPN');
  });

  it('should return raw task type for unknown types', () => {
    expect(getTaskTypeLabel('unknown_type')).toBe('unknown_type');
  });
});

// ============================================================
// formatDeadlineDate
// ============================================================
describe('formatDeadlineDate', () => {
  it('should format date in Indonesian locale', () => {
    const result = formatDeadlineDate(new Date(2024, 2, 15)); // March 15, 2024
    expect(result).toBeTruthy();
    expect(result).not.toBe('-');
  });

  it('should return dash for null/undefined', () => {
    expect(formatDeadlineDate(null)).toBe('-');
    expect(formatDeadlineDate(undefined)).toBe('-');
  });
});

// ============================================================
// isDeadlinePassed
// ============================================================
describe('isDeadlinePassed', () => {
  it('should return true for past deadlines', () => {
    expect(isDeadlinePassed('2020-01-01')).toBe(true);
  });

  it('should return false for future deadlines', () => {
    expect(isDeadlinePassed('2099-12-31')).toBe(false);
  });
});

// ============================================================
// getTaskDeadlineStatus
// ============================================================
describe('getTaskDeadlineStatus', () => {
  it('should return completed when hasSubmission is true', () => {
    const result = getTaskDeadlineStatus('2020-01-01', true);
    expect(result.status).toBe('completed');
    expect(result.color).toBe('green');
    expect(result.text).toBe('Selesai');
  });

  it('should return overdue for past deadlines without submission', () => {
    const result = getTaskDeadlineStatus('2020-01-01', false);
    expect(result.status).toBe('overdue');
    expect(result.color).toBe('red');
    expect(result.text).toBe('Terlambat');
  });

  it('should return pending for far-future deadlines', () => {
    const result = getTaskDeadlineStatus('2099-12-31', false);
    expect(result.status).toBe('pending');
    expect(result.color).toBe('gray');
    expect(result.text).toBe('Belum');
  });
});

// ============================================================
// getDaysUntilDeadline
// ============================================================
describe('getDaysUntilDeadline', () => {
  it('should return negative for past deadlines', () => {
    expect(getDaysUntilDeadline('2020-01-01')).toBeLessThan(0);
  });

  it('should return positive for future deadlines', () => {
    expect(getDaysUntilDeadline('2099-12-31')).toBeGreaterThan(0);
  });
});

// ============================================================
// TASK_TYPE_LABELS constant
// ============================================================
describe('TASK_TYPE_LABELS', () => {
  it('should contain all expected task types', () => {
    expect(TASK_TYPE_LABELS.pph_21).toBe('PPh 21');
    expect(TASK_TYPE_LABELS.pph_unifikasi).toBe('PPh Unifikasi');
    expect(TASK_TYPE_LABELS.pph_25).toBe('PPh 25 Angsuran');
    expect(TASK_TYPE_LABELS.ppn).toBe('PPN');
    expect(TASK_TYPE_LABELS.pph_badan).toBe('PPh Badan');
    expect(TASK_TYPE_LABELS.pph_05).toBe('PPh 0,5%');
  });
});
