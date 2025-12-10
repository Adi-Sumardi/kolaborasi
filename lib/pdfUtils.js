import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const getRoleLabel = (role) => {
  switch (role) {
    case 'super_admin': return 'Super Admin';
    case 'pengurus': return 'Pengurus';
    case 'sdm': return 'SDM';
    case 'karyawan': return 'Karyawan';
    default: return role;
  }
};

export function generateKPIPDF({ user, kpiData, logs, dateRange, barData }) {
  const doc = new jsPDF();
  
  // Header
  doc.setFontSize(20);
  doc.setTextColor(37, 99, 235);
  doc.text('LAPORAN KPI KARYAWAN', 105, 20, { align: 'center' });
  
  // Divider line
  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(0.5);
  doc.line(20, 25, 190, 25);
  
  // Employee Info
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text('Informasi Karyawan:', 20, 35);
  
  doc.setFontSize(10);
  doc.text(`Nama: ${user.name}`, 20, 42);
  doc.text(`Email: ${user.email}`, 20, 48);
  doc.text(`Role: ${getRoleLabel(user.role)}`, 20, 54);
  
  // Period
  doc.text(`Periode: ${new Date(dateRange.startDate).toLocaleDateString('id-ID')} - ${new Date(dateRange.endDate).toLocaleDateString('id-ID')}`, 20, 60);
  doc.text(`Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')}`, 20, 66);
  
  // KPI Summary Box
  doc.setFillColor(239, 246, 255);
  doc.rect(20, 75, 170, 40, 'F');
  
  doc.setFontSize(14);
  doc.setTextColor(37, 99, 235);
  doc.text('RINGKASAN KPI', 105, 85, { align: 'center' });
  
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  const summaryY = 93;
  doc.text(`KPI Score: ${kpiData?.score?.toFixed(1) || 0} / 100`, 30, summaryY);
  doc.text(`Tingkat Penyelesaian: ${kpiData?.completionRate || 0}%`, 30, summaryY + 7);
  doc.text(`Jobdesk Selesai: ${kpiData?.completedJobdesks || 0} / ${kpiData?.totalJobdesks || 0}`, 110, summaryY);
  doc.text(`Total Jam Kerja: ${kpiData?.totalHours || 0} jam`, 110, summaryY + 7);
  doc.text(`Total Log Aktivitas: ${kpiData?.totalLogs || 0} entri`, 110, summaryY + 14);
  
  // Performance Bar
  const barY = 123;
  doc.setFontSize(10);
  doc.text('Performance:', 20, barY);
  
  // Bar background
  doc.setFillColor(229, 231, 235);
  doc.rect(20, barY + 2, 170, 8, 'F');
  
  // Bar fill
  const scorePercentage = (kpiData?.score || 0);
  const barWidth = (170 * scorePercentage) / 100;
  
  let barColor;
  if (scorePercentage >= 80) barColor = [34, 197, 94];
  else if (scorePercentage >= 60) barColor = [234, 179, 8];
  else barColor = [239, 68, 68];
  
  doc.setFillColor(...barColor);
  doc.rect(20, barY + 2, barWidth, 8, 'F');
  
  doc.text(`${scorePercentage.toFixed(1)}%`, 195, barY + 8, { align: 'right' });
  
  // Daily Logs Table
  if (logs && logs.length > 0) {
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text('Log Aktivitas Harian:', 20, 140);
    
    const tableData = logs.slice(0, 15).map(log => [
      new Date(log.date).toLocaleDateString('id-ID'),
      log.notes?.substring(0, 50) + (log.notes?.length > 50 ? '...' : ''),
      `${log.hoursSpent || 0} jam`
    ]);
    
    // Use autoTable as a function, not a method
    autoTable(doc, {
      startY: 145,
      head: [['Tanggal', 'Aktivitas', 'Jam Kerja']],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: [37, 99, 235],
        textColor: [255, 255, 255],
        fontStyle: 'bold'
      },
      styles: {
        fontSize: 9,
        cellPadding: 3
      },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 120 },
        2: { cellWidth: 30, halign: 'center' }
      }
    });
  }
  
  // Footer
  const pageCount = doc.internal.getNumberOfPages();
  doc.setFontSize(8);
  doc.setTextColor(128, 128, 128);
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.text(
      `Halaman ${i} dari ${pageCount} | Dashboard Ruang Kerja Kolaborasi`,
      105,
      287,
      { align: 'center' }
    );
  }
  
  // Save PDF
  const fileName = `KPI_Report_${user.name.replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`;
  doc.save(fileName);
}
