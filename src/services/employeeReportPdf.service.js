const PDFDocument = require('pdfkit');
const { getEmployeeAnalytics } = require('./employeeReport.service');

const formatCurrency = (amount) =>
  `LKR ${Number(amount).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const viewTitles = {
  daily: 'Daily Employee Performance Report',
  monthly: 'Monthly Employee Performance Report',
  yearly: 'Yearly Employee Performance Report',
};

const writeEmployeeReportPdf = (doc, data) => {
  const periodColumn =
    data.view === 'daily' ? 'Date' : data.view === 'monthly' ? 'Month' : 'Year';
  const summary = data.summary || {};

  doc.fontSize(20).text('DineFesto Restaurant', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(16).text(viewTitles[data.view] || 'Employee Report', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(11).fillColor('#555555').text(`Period: ${data.periodLabel}`, { align: 'center' });
  doc.text(`Generated: ${new Date().toLocaleString('en-LK')}`, { align: 'center' });
  doc.moveDown(1);
  doc.fillColor('#000000');

  doc.fontSize(13).text('Workforce Snapshot', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(11);
  doc.text(`Total Active Employees: ${summary.totalEmployees ?? 0}`);
  doc.text(`Active in Period: ${summary.activeEmployeesInPeriod ?? 0}`);
  doc.text(`Total Orders Handled: ${summary.totalOrders ?? 0}`);
  doc.text(`Total Revenue Generated: ${formatCurrency(summary.totalRevenue)}`);
  doc.moveDown(1);

  doc.fontSize(13).text('Performance Breakdown', { underline: true });
  doc.moveDown(0.5);

  const col1X = 50;
  const col2X = 130;
  const col3X = 210;
  const col4X = 310;
  const rowHeight = 18;

  doc.fontSize(9).font('Helvetica-Bold');
  let y = doc.y;
  doc.text(periodColumn, col1X, y);
  doc.text('Orders', col2X, y);
  doc.text('Active Staff', col3X, y);
  doc.text('Revenue', col4X, y);
  doc.font('Helvetica');
  y += rowHeight;

  data.breakdown.forEach((row) => {
    if (y > 720) {
      doc.addPage();
      y = 50;
    }
    doc.fontSize(9);
    doc.text(row.label, col1X, y, { width: 70 });
    doc.text(String(row.orders), col2X, y);
    doc.text(String(row.activeEmployees), col3X, y);
    doc.text(formatCurrency(row.revenue), col4X, y, { width: 90 });
    y += rowHeight;
  });

  doc.moveDown(1);
  if (doc.y > 580) doc.addPage();

  doc.fontSize(13).text('Top Performers', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(9).font('Helvetica-Bold');
  y = doc.y;
  doc.text('Name', col1X, y);
  doc.text('Role', col2X, y);
  doc.text('Orders', col3X, y);
  doc.text('Revenue', col4X, y);
  doc.font('Helvetica');
  y += rowHeight;

  (data.topPerformers || []).forEach((employee) => {
    if (y > 720) {
      doc.addPage();
      y = 50;
    }
    doc.fontSize(9);
    doc.text(employee.name, col1X, y, { width: 70 });
    doc.text(employee.role, col2X, y, { width: 70 });
    doc.text(String(employee.ordersProcessed), col3X, y);
    doc.text(formatCurrency(employee.totalRevenue), col4X, y, { width: 90 });
    y += rowHeight;
  });

  if ((data.performanceByRole || []).length > 0) {
    doc.moveDown(1);
    if (doc.y > 620) doc.addPage();
    doc.fontSize(13).text('Performance by Role', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11);
    (data.performanceByRole || []).forEach((row) => {
      doc.text(
        `${row.role}: ${row.orders} orders, ${row.employees} staff, ${formatCurrency(row.revenue)}`
      );
    });
  }
};

const createEmployeeReportPdf = async (query) => {
  const data = await getEmployeeAnalytics(query);
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  writeEmployeeReportPdf(doc, data);
  return { doc, data };
};

module.exports = { createEmployeeReportPdf };
