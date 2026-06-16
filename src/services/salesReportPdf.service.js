const PDFDocument = require('pdfkit');
const { getSalesAnalytics } = require('./salesReport.service');

const formatCurrency = (amount) =>
  `LKR ${Number(amount).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const viewTitles = {
  daily: 'Daily Sales Report',
  monthly: 'Monthly Sales Report',
  yearly: 'Yearly Sales Report',
};

const writeSalesReportPdf = (doc, data) => {
  const periodColumn =
    data.view === 'daily' ? 'Date' : data.view === 'monthly' ? 'Month' : 'Year';

  doc.fontSize(20).text('DineFesto Restaurant', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(16).text(viewTitles[data.view] || 'Sales Report', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(11).fillColor('#555555').text(`Period: ${data.periodLabel}`, { align: 'center' });
  doc.text(`Generated: ${new Date().toLocaleString('en-LK')}`, { align: 'center' });
  doc.moveDown(1);
  doc.fillColor('#000000');

  doc.fontSize(13).text('Summary', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(11);
  doc.text(`Total Sales Revenue: ${formatCurrency(data.summary.totalRevenue)}`);
  doc.text(`Total Items Sold: ${data.summary.totalQuantity}`);
  doc.text(`Total Orders: ${data.summary.totalOrders}`);
  doc.text(`Average Order Value: ${formatCurrency(data.summary.averageOrderValue)}`);
  doc.moveDown(1);

  doc.fontSize(13).text('Sales Breakdown', { underline: true });
  doc.moveDown(0.5);

  const col1X = 50;
  const col2X = 130;
  const col3X = 230;
  const col4X = 320;
  const col5X = 400;
  const rowHeight = 18;

  doc.fontSize(9).font('Helvetica-Bold');
  let y = doc.y;
  doc.text(periodColumn, col1X, y);
  doc.text('Revenue', col2X, y);
  doc.text('Qty Sold', col3X, y);
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
    doc.text(formatCurrency(row.revenue), col2X, y, { width: 90 });
    doc.text(String(row.quantity), col3X, y);
    doc.text(String(row.orders), col4X, y);
    y += rowHeight;
  });

  doc.moveDown(1);
  if (doc.y > 600) doc.addPage();

  doc.fontSize(13).text('Top Selling Items', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(9).font('Helvetica-Bold');
  y = doc.y;
  doc.text('Item', col1X, y);
  doc.text('Category', col2X, y);
  doc.text('Qty', col3X, y);
  doc.text('Revenue', col4X, y);
  doc.font('Helvetica');
  y += rowHeight;

  (data.topSellingItems || []).slice(0, 10).forEach((item) => {
    if (y > 720) {
      doc.addPage();
      y = 50;
    }
    doc.fontSize(9);
    doc.text(item.name, col1X, y, { width: 70 });
    doc.text(item.category, col2X, y, { width: 90 });
    doc.text(String(item.totalQuantitySold), col3X, y);
    doc.text(formatCurrency(item.revenue), col4X, y, { width: 90 });
    y += rowHeight;
  });

  doc.moveDown(1);
  if (doc.y > 620) doc.addPage();

  doc.fontSize(13).text('Sales by Category', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(9).font('Helvetica-Bold');
  y = doc.y;
  doc.text('Category', col1X, y);
  doc.text('Revenue', col2X, y);
  doc.text('Qty', col3X, y);
  doc.text('Orders', col4X, y);
  doc.font('Helvetica');
  y += rowHeight;

  (data.salesByCategory || []).forEach((cat) => {
    if (y > 720) {
      doc.addPage();
      y = 50;
    }
    doc.fontSize(9);
    doc.text(cat.category, col1X, y, { width: 90 });
    doc.text(formatCurrency(cat.revenue), col2X, y, { width: 90 });
    doc.text(String(cat.totalQuantity), col3X, y);
    doc.text(String(cat.orderCount), col4X, y);
    y += rowHeight;
  });
};

const createSalesReportPdf = async (query) => {
  const data = await getSalesAnalytics(query);
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  writeSalesReportPdf(doc, data);
  return { doc, data };
};

module.exports = { createSalesReportPdf };
