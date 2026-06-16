const PDFDocument = require('pdfkit');
const { getRevenueAnalytics } = require('./revenueReport.service');

const formatCurrency = (amount) =>
  `LKR ${Number(amount).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const viewTitles = {
  daily: 'Daily Revenue Report',
  monthly: 'Monthly Revenue Report',
  yearly: 'Yearly Revenue Report',
};

const writeRevenueReportPdf = (doc, data) => {
  const periodColumn =
    data.view === 'daily' ? 'Date' : data.view === 'monthly' ? 'Month' : 'Year';

  doc.fontSize(20).text('DineFesto Restaurant', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(16).text(viewTitles[data.view] || 'Revenue Report', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(11).fillColor('#555555').text(`Period: ${data.periodLabel}`, { align: 'center' });
  doc.text(`Generated: ${new Date().toLocaleString('en-LK')}`, { align: 'center' });
  doc.moveDown(1);
  doc.fillColor('#000000');

  doc.fontSize(13).text('Summary', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(11);
  doc.text(`Total Revenue: ${formatCurrency(data.summary.totalRevenue)}`);
  doc.text(`Total Orders: ${data.summary.totalOrders}`);
  doc.text(`Average Order Value: ${formatCurrency(data.summary.averageOrderValue)}`);
  doc.moveDown(1);

  if (data.revenueByType) {
    doc.fontSize(13).text('Revenue by Order Type', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11);
    Object.entries(data.revenueByType).forEach(([type, amount]) => {
      doc.text(`${type.replace('_', ' ')}: ${formatCurrency(amount)}`);
    });
    doc.moveDown(1);
  }

  doc.fontSize(13).text('Breakdown', { underline: true });
  doc.moveDown(0.5);

  const col1X = 50;
  const col2X = 200;
  const col3X = 340;
  const rowHeight = 20;

  doc.fontSize(10).font('Helvetica-Bold');
  const tableTop = doc.y;
  doc.text(periodColumn, col1X, tableTop);
  doc.text('Revenue', col2X, tableTop);
  doc.text('Orders', col3X, tableTop);
  doc.font('Helvetica');

  let y = tableTop + rowHeight;
  data.breakdown.forEach((row) => {
    if (y > 720) {
      doc.addPage();
      y = 50;
    }
    doc.fontSize(10);
    doc.text(row.label, col1X, y);
    doc.text(formatCurrency(row.revenue), col2X, y);
    doc.text(String(row.orders), col3X, y);
    y += rowHeight;
  });
};

const createRevenueReportPdf = async (query) => {
  const data = await getRevenueAnalytics(query);
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  writeRevenueReportPdf(doc, data);
  return { doc, data };
};

module.exports = { createRevenueReportPdf };
