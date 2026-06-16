const PDFDocument = require('pdfkit');
const { getCustomerAnalytics } = require('./customerReport.service');

const formatCurrency = (amount) =>
  `LKR ${Number(amount).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const viewTitles = {
  daily: 'Daily Customer Report',
  monthly: 'Monthly Customer Report',
  yearly: 'Yearly Customer Report',
};

const writeCustomerReportPdf = (doc, data) => {
  const periodColumn =
    data.view === 'daily' ? 'Date' : data.view === 'monthly' ? 'Month' : 'Year';

  doc.fontSize(20).text('DineFesto Restaurant', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(16).text(viewTitles[data.view] || 'Customer Report', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(11).fillColor('#555555').text(`Period: ${data.periodLabel}`, { align: 'center' });
  doc.text(`Generated: ${new Date().toLocaleString('en-LK')}`, { align: 'center' });
  doc.moveDown(1);
  doc.fillColor('#000000');

  doc.fontSize(13).text('Summary', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(11);
  doc.text(`New Customers: ${data.summary.newCustomers}`);
  doc.text(`Active Customers: ${data.summary.activeCustomers}`);
  doc.text(`Repeat Customers: ${data.summary.repeatCustomers}`);
  doc.text(`Retention Rate: ${data.summary.retentionRate}%`);
  doc.text(`Total Orders: ${data.summary.totalOrders}`);
  doc.moveDown(1);

  doc.fontSize(13).text('Customer Activity Breakdown', { underline: true });
  doc.moveDown(0.5);

  const col1X = 50;
  const col2X = 130;
  const col3X = 220;
  const col4X = 330;
  const rowHeight = 18;

  doc.fontSize(9).font('Helvetica-Bold');
  let y = doc.y;
  doc.text(periodColumn, col1X, y);
  doc.text('New', col2X, y);
  doc.text('Active', col3X, y);
  doc.text('Orders', col4X, y);
  doc.font('Helvetica');
  y += rowHeight;

  data.breakdown.forEach((row) => {
    if (y > 720) {
      doc.addPage();
      y = 50;
    }
    doc.fontSize(9);
    doc.text(row.label, col1X, y, { width: 70 });
    doc.text(String(row.newCustomers), col2X, y);
    doc.text(String(row.activeCustomers), col3X, y);
    doc.text(String(row.orders), col4X, y);
    y += rowHeight;
  });

  doc.moveDown(1);
  if (doc.y > 600) doc.addPage();

  doc.fontSize(13).text('Top Customers', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(9).font('Helvetica-Bold');
  y = doc.y;
  doc.text('Name', col1X, y);
  doc.text('Email', col2X, y);
  doc.text('Orders', col3X, y);
  doc.text('Spent', col4X, y);
  doc.font('Helvetica');
  y += rowHeight;

  (data.topCustomers || []).slice(0, 10).forEach((customer) => {
    if (y > 720) {
      doc.addPage();
      y = 50;
    }
    doc.fontSize(9);
    doc.text(customer.name, col1X, y, { width: 70 });
    doc.text(customer.email || 'N/A', col2X, y, { width: 80 });
    doc.text(String(customer.orderCount), col3X, y);
    doc.text(formatCurrency(customer.totalSpent), col4X, y, { width: 90 });
    y += rowHeight;
  });
};

const createCustomerReportPdf = async (query) => {
  const data = await getCustomerAnalytics(query);
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  writeCustomerReportPdf(doc, data);
  return { doc, data };
};

module.exports = { createCustomerReportPdf };
