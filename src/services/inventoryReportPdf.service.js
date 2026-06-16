const PDFDocument = require('pdfkit');
const { getInventoryAnalytics } = require('./inventoryReport.service');

const formatCurrency = (amount) =>
  `LKR ${Number(amount).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const viewTitles = {
  daily: 'Daily Inventory Report',
  monthly: 'Monthly Inventory Report',
  yearly: 'Yearly Inventory Report',
};

const writeInventoryReportPdf = (doc, data) => {
  const periodColumn =
    data.view === 'daily' ? 'Date' : data.view === 'monthly' ? 'Month' : 'Year';
  const summary = data.summary || {};

  doc.fontSize(20).text('DineFesto Restaurant', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(16).text(viewTitles[data.view] || 'Inventory Report', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(11).fillColor('#555555').text(`Period: ${data.periodLabel}`, { align: 'center' });
  doc.text(`Generated: ${new Date().toLocaleString('en-LK')}`, { align: 'center' });
  doc.moveDown(1);
  doc.fillColor('#000000');

  doc.fontSize(13).text('Current Stock Snapshot', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(11);
  doc.text(`Total Items: ${summary.totalItems ?? 0}`);
  doc.text(`Low Stock Items: ${summary.lowStockCount ?? 0}`);
  doc.text(`Total Inventory Value: ${formatCurrency(summary.totalInventoryValue)}`);
  doc.moveDown(0.5);

  doc.fontSize(13).text('Period Activity', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(11);
  doc.text(`Total Movements: ${summary.totalMovements ?? 0}`);
  doc.text(`Total Consumed: ${summary.totalConsumed ?? 0}`);
  doc.text(`Total Restocked: ${summary.totalRestocked ?? 0}`);
  doc.text(`Net Change: ${summary.netChange ?? 0}`);
  doc.moveDown(1);

  doc.fontSize(13).text('Movement Breakdown', { underline: true });
  doc.moveDown(0.5);

  const col1X = 50;
  const col2X = 120;
  const col3X = 200;
  const col4X = 280;
  const col5X = 360;
  const rowHeight = 18;

  doc.fontSize(9).font('Helvetica-Bold');
  let y = doc.y;
  doc.text(periodColumn, col1X, y);
  doc.text('Consumed', col2X, y);
  doc.text('Restocked', col3X, y);
  doc.text('Net', col4X, y);
  doc.text('Moves', col5X, y);
  doc.font('Helvetica');
  y += rowHeight;

  data.breakdown.forEach((row) => {
    if (y > 720) {
      doc.addPage();
      y = 50;
    }
    doc.fontSize(9);
    doc.text(row.label, col1X, y, { width: 60 });
    doc.text(String(row.consumed), col2X, y);
    doc.text(String(row.restocked), col3X, y);
    doc.text(String(row.netChange), col4X, y);
    doc.text(String(row.movements), col5X, y);
    y += rowHeight;
  });

  doc.moveDown(1);
  if (doc.y > 580) doc.addPage();

  doc.fontSize(13).text('Top Consumed Items', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(9).font('Helvetica-Bold');
  y = doc.y;
  doc.text('Item', col1X, y);
  doc.text('Unit', col2X, y);
  doc.text('Consumed', col3X, y);
  doc.font('Helvetica');
  y += rowHeight;

  (data.topConsumedItems || []).forEach((item) => {
    if (y > 720) {
      doc.addPage();
      y = 50;
    }
    doc.fontSize(9);
    doc.text(item.itemName, col1X, y, { width: 100 });
    doc.text(item.unit, col2X, y);
    doc.text(String(item.consumed), col3X, y);
    y += rowHeight;
  });

  if ((data.summary?.lowStockItems || []).length > 0) {
    doc.moveDown(1);
    if (doc.y > 620) doc.addPage();
    doc.fontSize(13).text('Low Stock Items (Current)', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(9);
    (data.summary.lowStockItems || []).forEach((item) => {
      doc.text(
        `${item.itemName}: ${item.quantity} ${item.unit} (reorder at ${item.reorderLevel})`
      );
    });
  }
};

const createInventoryReportPdf = async (query) => {
  const data = await getInventoryAnalytics(query);
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  writeInventoryReportPdf(doc, data);
  return { doc, data };
};

module.exports = { createInventoryReportPdf };
