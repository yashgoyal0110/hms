import { Router } from 'express';
import { can } from '../middleware/auth.js';
import {
  InventoryItem, LedgerEntry, Medicine, PurchaseOrder, StockMovement, Supplier, nextCode,
} from '../models/index.js';
import { crudRouter } from '../utils/crud.js';
import { badRequest, clean, notFound } from '../utils/http.js';
import { paginate, searchFilter } from '../utils/query.js';

export const suppliersRouter = crudRouter(Supplier, {
  module: 'inventory', search: ['name', 'contactPerson', 'phone', 'gstin'], filters: ['category'], label: 'Supplier',
});

const items = Router();
items.get('/', can('inventory', 'r'), async (req, res) => {
  const filter = { ...searchFilter(req.query.q, ['name', 'code', 'location']) };
  if (req.query.active !== 'all') filter.active = true;
  if (req.query.category) filter.category = req.query.category;
  if (req.query.stock === 'low') filter.$expr = { $lte: ['$quantity', '$reorderLevel'] };
  res.json(await paginate(InventoryItem, filter, req, { sort: 'name', populate: { path: 'supplier', select: 'name' }, defLimit: 50 }));
});
items.post('/', can('inventory', 'rw'), async (req, res) => {
  const data = clean(req.body, ['code', 'quantity']);
  const item = await InventoryItem.create({ ...data, code: await nextCode('ITM', { yearly: false, pad: 5 }), quantity: 0 });
  const opening = Number(req.body.quantity) || 0;
  if (opening > 0) {
    item.quantity = opening;
    await item.save();
    await StockMovement.create({ itemType: 'InventoryItem', item: item._id, itemName: item.name, type: 'IN', quantity: opening, note: 'Opening stock', by: req.user._id });
  }
  res.status(201).json(item);
});
items.put('/:id', can('inventory', 'rw'), async (req, res) => {
  const item = await InventoryItem.findById(req.params.id);
  if (!item) throw notFound('Item');
  item.set(clean(req.body, ['code', 'quantity']));
  await item.save();
  res.json(item);
});
items.post('/:id/stock', can('inventory', 'rw'), async (req, res) => {
  const { type, quantity, note, department } = req.body;
  const qty = Number(quantity);
  if (!['IN', 'OUT', 'ADJUST', 'RETURN'].includes(type)) throw badRequest('Invalid movement type');
  if (!qty || (type !== 'ADJUST' && qty < 0)) throw badRequest('Enter a valid quantity');
  const delta = type === 'OUT' ? -qty : qty;
  const item = await InventoryItem.findOneAndUpdate(
    { _id: req.params.id, ...(delta < 0 ? { quantity: { $gte: -delta } } : {}) },
    { $inc: { quantity: delta } },
    { new: true },
  );
  if (!item) throw badRequest('Insufficient stock for this issue');
  await StockMovement.create({ itemType: 'InventoryItem', item: item._id, itemName: item.name, type, quantity: delta, note, department, by: req.user._id });
  res.json(item);
});
export const itemsRouter = items;

export const movementsRouter = Router();
movementsRouter.get('/', can('inventory', 'r'), async (req, res) => {
  const filter = {};
  if (req.query.itemType) filter.itemType = req.query.itemType;
  if (req.query.type) filter.type = req.query.type;
  if (req.query.item) filter.item = req.query.item;
  res.json(await paginate(StockMovement, filter, req, { populate: { path: 'by', select: 'name' } }));
});

const po = Router();
const poPopulate = [{ path: 'supplier', select: 'name phone email gstin address' }, { path: 'createdBy', select: 'name' }];
po.get('/', can('inventory', 'r'), async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.supplier) filter.supplier = req.query.supplier;
  res.json(await paginate(PurchaseOrder, filter, req, { populate: poPopulate }));
});
po.get('/:id', can('inventory', 'r'), async (req, res) => {
  const doc = await PurchaseOrder.findById(req.params.id).populate(poPopulate);
  if (!doc) throw notFound('Purchase order');
  res.json(doc);
});
async function resolveLines(lines = []) {
  if (!lines.length) throw badRequest('Add at least one item');
  const out = [];
  for (const l of lines) {
    const Model = l.itemType === 'Medicine' ? Medicine : InventoryItem;
    const it = await Model.findById(l.item);
    if (!it) throw badRequest('Invalid item in purchase order');
    out.push({ itemType: l.itemType, item: it._id, name: it.name, quantity: Number(l.quantity), unitCost: Number(l.unitCost) });
  }
  return out;
}
po.post('/', can('inventory', 'rw'), async (req, res) => {
  const doc = await PurchaseOrder.create({
    supplier: req.body.supplier, expectedDate: req.body.expectedDate, notes: req.body.notes,
    items: await resolveLines(req.body.items), poNo: await nextCode('PO'), status: req.body.status === 'Ordered' ? 'Ordered' : 'Draft', createdBy: req.user._id,
  });
  res.status(201).json(doc);
});
po.put('/:id', can('inventory', 'rw'), async (req, res) => {
  const doc = await PurchaseOrder.findById(req.params.id);
  if (!doc) throw notFound('Purchase order');
  if (doc.status !== 'Draft') throw badRequest('Only draft purchase orders can be edited');
  if (req.body.items) doc.items = await resolveLines(req.body.items);
  for (const k of ['supplier', 'expectedDate', 'notes']) if (req.body[k] !== undefined) doc[k] = req.body[k];
  await doc.save();
  res.json(doc);
});
po.post('/:id/status', can('inventory', 'rw'), async (req, res) => {
  const doc = await PurchaseOrder.findById(req.params.id);
  if (!doc) throw notFound('Purchase order');
  const { status } = req.body;
  const flow = { Ordered: ['Draft'], Cancelled: ['Draft', 'Ordered'] };
  if (!flow[status]?.includes(doc.status)) throw badRequest(`Cannot change status from ${doc.status} to ${status}`);
  doc.status = status;
  await doc.save();
  res.json(doc);
});
// Goods receipt: medicines require batch number and expiry for each line.
po.post('/:id/receive', can('inventory', 'rw'), async (req, res) => {
  const doc = await PurchaseOrder.findById(req.params.id).populate('supplier', 'name');
  if (!doc) throw notFound('Purchase order');
  if (doc.status !== 'Ordered') throw badRequest('Only ordered purchase orders can be received');
  const details = new Map((req.body.items || []).map((i) => [String(i._id), i]));
  for (const line of doc.items) {
    if (line.itemType === 'Medicine') {
      const d = details.get(String(line._id));
      if (!d?.batchNo || !d?.expiryDate) throw badRequest(`Batch number and expiry are required for ${line.name}`);
    }
  }
  for (const line of doc.items) {
    const d = details.get(String(line._id)) || {};
    if (line.itemType === 'Medicine') {
      const med = await Medicine.findById(line.item);
      const existing = med.batches.find((b) => b.batchNo === d.batchNo);
      if (existing) existing.quantity += line.quantity;
      else med.batches.push({ batchNo: d.batchNo, expiryDate: d.expiryDate, quantity: line.quantity, purchasePrice: line.unitCost, mrp: Number(d.mrp) || med.mrp, supplier: doc.supplier._id });
      await med.save();
    } else {
      await InventoryItem.updateOne({ _id: line.item }, { $inc: { quantity: line.quantity }, unitCost: line.unitCost });
    }
    await StockMovement.create({
      itemType: line.itemType, item: line.item, itemName: line.name, type: 'IN', quantity: line.quantity, batchNo: d.batchNo, reference: doc.poNo, note: `Received from ${doc.supplier.name}`, by: req.user._id,
    });
  }
  doc.status = 'Received';
  doc.receivedAt = new Date();
  await doc.save();
  res.json(doc);
});
export const purchaseOrdersRouter = po;
