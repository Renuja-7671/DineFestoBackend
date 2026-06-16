const PDFDocument = require('pdfkit');
const { getOrderTrendsAnalytics } = require('./orderTrendsReport.service');

const formatCurrency = (amount) =>
  `LKR ${Number(amount).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const viewTitles = {
  daily: 'Daily Order Trends Report',
  monthly: 'Monthly Order Trends Report',
  yearly: 'Yearly Order Trends Report',
};

const writeOrderTrendsReportPdf = (doc, data) => {
  const periodColumn =
    data.view === 'daily' ? 'Date' : data.view === 'monthly' ? 'Month' : 'Year';
  const summary = data.summary || {};

  doc.fontSize(20).text('DineFesto Restaurant', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(16).text(viewTitles[data.view] || 'Order Trends Report', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(11).fillColor('#555555').text(`Period: ${data.periodLabel}`, { align: 'center' });
  doc.text(`Generated: ${new Date().toLocaleString('en-LK')}`, { align: 'center' });
  doc.moveDown(1);
  doc.fillColor('#000000');

  doc.fontSize(13).text('Summary', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(11);
  doc.text(`Total Orders: ${summary.totalOrders ?? 0}`);
  doc.text(`Completed Orders: ${summary.completedOrders ?? 0}`);
  doc.text(`Cancelled Orders: ${summary.cancelledOrders ?? 0}`);
  doc.text(`Completion Rate: ${summary.completionRate ?? 0}%`);
  doc.text(`Total Revenue: ${formatCurrency(summary.totalRevenue)}`);
  doc.text(`Peak Hour: ${summary.peakHour ?? 0}:00 (${summary.peakHourOrders ?? 0} orders)`);
  doc.text(`Busiest Period: ${summary.busiestPeriod} (${summary.busiestPeriodOrders ?? 0} orders)`);
  doc.moveDown(1);

  if ((data.ordersByStatus || []).length > 0) {
    doc.fontSize(13).text('Orders by Status', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11);
    (data.ordersByStatus || []).forEach((row) => {
      doc.text(`${row.status}: ${row.count}`);
    });
    doc.moveDown(1);
  }

  if ((data.ordersByType || []).length > 0) {
    doc.fontSize(13).text('Orders by Type', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11);
    (data.ordersByType || []).forEach((row) => {
      doc.text(`${row.label}: ${row.count} orders, ${formatCurrency(row.revenue)}`);
    });
    doc.moveDown(1);
  }

  doc.fontSize(13).text('Trend Breakdown', { underline: true });
  doc.moveDown(0.5);

  const col1X = 50;
  const col2X = 130;
  const col3X = 200;
  const col4X = 280;
  const col5X = 360;
  const rowHeight = 18;

  doc.fontSize(9).font('Helvetica-Bold');
  let y = doc.y;
  doc.text(periodColumn, col1X, y);
  doc.text('Orders', col2X, y);
  doc.text('Done', col3X, y);
  doc.text('Cancel', col4X, y);
  doc.text('Revenue', col5X, y);
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
    doc.text(String(row.completed), col3X, y);
    doc.text(String(row.cancelled), col4X, y);
    doc.text(formatCurrency(row.revenue), col5X, y, { width: 90 });
    y += rowHeight;
  });

  doc.moveDown(1);
  if (doc.y > 600) doc.addPage();

  doc.fontSize(13).text('Peak Hours', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(11);
  const topHours = [...(data.peakHours || [])]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  topHours.forEach((row) => {
    doc.text(`${row.hour}:00 – ${row.hour + 1}:00: ${row.count} orders`);
  });
};

const createOrderTrendsReportPdf = async (query) => {
  const data = await getOrderTrendsAnalytics(query);
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  writeOrderTrendsReportPdf(doc, data);
  return { doc, data };
};

module.exports = { createOrderTrendsReportPdf };
