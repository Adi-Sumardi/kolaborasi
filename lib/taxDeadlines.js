// Tax Deadline Calculation Utilities

/**
 * Get PPh payment deadline (tanggal 15 bulan berikutnya)
 */
export function getPphPaymentDeadline(month, year) {
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return new Date(nextYear, nextMonth - 1, 15);
}

/**
 * Get PPh filing deadline (tanggal 20 bulan berikutnya)
 */
export function getPphFilingDeadline(month, year) {
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return new Date(nextYear, nextMonth - 1, 20);
}

/**
 * Get PPN payment/filing deadline (akhir bulan berikutnya)
 * Only applicable for PKP clients
 */
export function getPpnDeadline(month, year) {
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  // Get last day of the next month
  return new Date(nextYear, nextMonth, 0);
}

/**
 * Get bookkeeping employee deadline (tanggal 25 bulan berikutnya)
 */
export function getBookkeepingEmployeeDeadline(month, year) {
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return new Date(nextYear, nextMonth - 1, 25);
}

/**
 * Get bookkeeping owner review deadline (tanggal 30 bulan berikutnya, or last day if month has < 30 days)
 */
export function getBookkeepingOwnerDeadline(month, year) {
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  // Try day 30, but fall back to last day of month
  const lastDayOfMonth = new Date(nextYear, nextMonth, 0).getDate();
  const day = Math.min(30, lastDayOfMonth);
  return new Date(nextYear, nextMonth - 1, day);
}

/**
 * Get annual PPh Badan filing deadline (30 April)
 */
export function getPphBadanDeadline(taxYear) {
  return new Date(taxYear + 1, 3, 30); // April is month 3 (0-indexed)
}

/**
 * Get annual PPh OP filing deadline (31 Maret)
 */
export function getPphOpDeadline(taxYear) {
  return new Date(taxYear + 1, 2, 31); // March is month 2 (0-indexed)
}

/**
 * Get SP2DK response deadline (14 hari dari tanggal surat)
 */
export function getSp2dkDeadline(letterDate) {
  const deadline = new Date(letterDate);
  deadline.setDate(deadline.getDate() + 14);
  return deadline;
}

/**
 * Generate all deadlines for a tax period
 * @param {number} month - Tax period month (1-12)
 * @param {number} year - Tax period year
 * @param {boolean} isPkp - Whether client is PKP (for PPN deadlines)
 */
export function generateTaxPeriodDeadlines(month, year, isPkp = false) {
  const deadlines = {
    pph_payment_deadline: getPphPaymentDeadline(month, year),
    pph_filing_deadline: getPphFilingDeadline(month, year),
    bookkeeping_employee_deadline: getBookkeepingEmployeeDeadline(month, year),
    bookkeeping_owner_deadline: getBookkeepingOwnerDeadline(month, year)
  };

  // PPN deadlines only for PKP clients
  if (isPkp) {
    const ppnDeadline = getPpnDeadline(month, year);
    deadlines.ppn_payment_deadline = ppnDeadline;
    deadlines.ppn_filing_deadline = ppnDeadline;
  }

  return deadlines;
}

/**
 * Check if a deadline is overdue
 * @param {Date|string} deadline - The deadline date
 * @returns {boolean} - True if overdue
 */
export function isOverdue(deadline) {
  if (!deadline) return false;
  const deadlineDate = new Date(deadline);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return deadlineDate < today;
}

/**
 * Get deadline status
 * @param {Date|string} deadline - The deadline date
 * @param {string} currentStatus - Current completion status
 * @returns {string} - 'completed', 'overdue', 'due_soon' (within 3 days), or 'pending'
 */
export function getDeadlineStatus(deadline, currentStatus) {
  if (currentStatus === 'completed') return 'completed';
  if (!deadline) return 'pending';

  const deadlineDate = new Date(deadline);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (deadlineDate < today) return 'overdue';

  const daysDiff = Math.ceil((deadlineDate - today) / (1000 * 60 * 60 * 24));
  if (daysDiff <= 3) return 'due_soon';

  return 'pending';
}

/**
 * Format month name in Indonesian
 */
export function getMonthName(month) {
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  return months[month - 1] || '';
}

/**
 * Get period label (e.g., "Januari 2024")
 */
export function getPeriodLabel(month, year) {
  return `${getMonthName(month)} ${year}`;
}

// ============================================
// TASK TYPE DEADLINE SYSTEM
// ============================================

/**
 * Task type labels untuk display
 */
export const TASK_TYPE_LABELS = {
  pph_21: 'PPh 21',
  pph_unifikasi: 'PPh Unifikasi',
  pph_25: 'PPh 25 Angsuran',
  ppn: 'PPN',
  pph_badan: 'PPh Badan',
  pph_05: 'PPh 0,5%'
};

/**
 * Menghitung deadline berdasarkan jenis tugas dan periode
 *
 * Aturan:
 * - PPh 21, PPh Unifikasi, PPh 25, PPh Badan, PPh 0,5%: Tanggal 20 bulan berikutnya
 * - PPN: Tanggal 28 + 7 hari bulan berikutnya
 *
 * @param {string} taskType - ID jenis tugas (pph_21, ppn, etc)
 * @param {number} periodMonth - Bulan periode (1-12)
 * @param {number} periodYear - Tahun periode
 * @returns {Date} - Tanggal deadline
 */
export function calculateTaskDeadline(taskType, periodMonth, periodYear) {
  // Bulan berikutnya
  let nextMonth = periodMonth + 1;
  let nextYear = periodYear;

  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear++;
  }

  if (taskType === 'ppn') {
    // PPN: Tanggal 28 + 7 hari di bulan berikutnya
    const startDate = new Date(nextYear, nextMonth - 1, 28);
    startDate.setDate(startDate.getDate() + 7);
    return startDate;
  } else {
    // PPh 21, PPh Unifikasi, PPh 25, PPh Badan, PPh 0,5%: Tanggal 20 bulan berikutnya
    return new Date(nextYear, nextMonth - 1, 20);
  }
}

/**
 * Cek apakah submission terlambat
 * @param {Date|string} submittedAt - Waktu submission
 * @param {Date|string} deadline - Deadline
 * @returns {{ isLate: boolean, lateDays: number, deduction: number }}
 */
export function checkSubmissionLateness(submittedAt, deadline) {
  const subDate = new Date(submittedAt);
  const deadlineDate = new Date(deadline);

  // Set ke akhir hari untuk deadline (23:59:59)
  deadlineDate.setHours(23, 59, 59, 999);

  if (subDate <= deadlineDate) {
    return { isLate: false, lateDays: 0, deduction: 0 };
  }

  // Hitung selisih hari
  const diffTime = subDate.getTime() - deadlineDate.getTime();
  const lateDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return {
    isLate: true,
    lateDays,
    deduction: 5  // Potongan 5 poin per jenis tugas yang telat
  };
}

/**
 * Get deadline info untuk semua task types dalam satu jobdesk
 * @param {string[]} taskTypes - Array of task type IDs
 * @param {number} periodMonth - Bulan periode
 * @param {number} periodYear - Tahun periode
 * @returns {Array<{taskType: string, deadline: Date, label: string, deadlineFormatted: string}>}
 */
export function getJobdeskDeadlines(taskTypes, periodMonth, periodYear) {
  if (!taskTypes || !periodMonth || !periodYear) return [];

  return taskTypes.map(taskType => {
    const deadline = calculateTaskDeadline(taskType, periodMonth, periodYear);
    return {
      taskType,
      deadline,
      label: getTaskTypeLabel(taskType),
      deadlineFormatted: formatDeadlineDate(deadline)
    };
  });
}

/**
 * Get label for task type
 * @param {string} taskType
 * @returns {string}
 */
export function getTaskTypeLabel(taskType) {
  return TASK_TYPE_LABELS[taskType] || taskType;
}

/**
 * Format deadline untuk display
 * @param {Date} deadline
 * @returns {string}
 */
export function formatDeadlineDate(deadline) {
  if (!deadline) return '-';
  return new Date(deadline).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

/**
 * Check if deadline is approaching (within 3 days)
 * @param {Date|string} deadline
 * @returns {boolean}
 */
export function isDeadlineApproaching(deadline) {
  const now = new Date();
  const deadlineDate = new Date(deadline);
  const diffTime = deadlineDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays <= 3;
}

/**
 * Check if deadline has passed
 * @param {Date|string} deadline
 * @returns {boolean}
 */
export function isDeadlinePassed(deadline) {
  const now = new Date();
  const deadlineDate = new Date(deadline);
  deadlineDate.setHours(23, 59, 59, 999);
  return now > deadlineDate;
}

/**
 * Get task type deadline status with color and text
 * @param {Date|string} deadline
 * @param {boolean} hasSubmission - whether there's already a submission for this task type
 * @returns {{ status: string, color: string, text: string }}
 */
export function getTaskDeadlineStatus(deadline, hasSubmission = false) {
  if (hasSubmission) {
    return {
      status: 'completed',
      color: 'green',
      text: 'Selesai'
    };
  }

  if (isDeadlinePassed(deadline)) {
    return {
      status: 'overdue',
      color: 'red',
      text: 'Terlambat'
    };
  }

  if (isDeadlineApproaching(deadline)) {
    return {
      status: 'approaching',
      color: 'orange',
      text: 'Segera'
    };
  }

  return {
    status: 'pending',
    color: 'gray',
    text: 'Belum'
  };
}

/**
 * Get days remaining until deadline
 * @param {Date|string} deadline
 * @returns {number} - negative if overdue
 */
export function getDaysUntilDeadline(deadline) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const deadlineDate = new Date(deadline);
  deadlineDate.setHours(0, 0, 0, 0);
  const diffTime = deadlineDate.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}
