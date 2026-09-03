import mongoose from 'mongoose';

const { Schema, model } = mongoose;
const ref = (m) => ({ type: Schema.Types.ObjectId, ref: m });

const batchSchema = new Schema({
  batchNo: { type: String, required: true },
  expiryDate: { type: Date, required: true },
  quantity: { type: Number, required: true, min: 0 },
  purchasePrice: { type: Number, default: 0 },
  mrp: { type: Number, required: true, min: 0 },
  supplier: ref('Supplier'),
  receivedAt: { type: Date, default: Date.now },
});

const medicineSchema = new Schema({
  code: { type: String, unique: true },
  name: { type: String, required: true, trim: true },
  genericName: { type: String, trim: true },
  form: {
    type: String,
    enum: ['Tablet', 'Capsule', 'Syrup', 'Suspension', 'Injection', 'Infusion', 'Ointment', 'Cream', 'Drops', 'Inhaler', 'Powder', 'Other'],
    default: 'Tablet',
  },
  strength: String,
  manufacturer: String,
  category: String,
  schedule: { type: String, enum: ['OTC', 'H', 'H1', 'X', 'G'], default: 'H' },
  unit: { type: String, default: 'Unit' },
  gstRate: { type: Number, default: 12 },
  mrp: { type: Number, default: 0 },
  reorderLevel: { type: Number, default: 50 },
  rack: String,
  batches: [batchSchema],
  stock: { type: Number, default: 0, index: true },
  active: { type: Boolean, default: true },
}, { timestamps: true });

medicineSchema.pre('save', function computeStock() {
  this.stock = this.batches.reduce((s, b) => s + (b.quantity || 0), 0);
});
medicineSchema.index({ name: 1 });
export const Medicine = model('Medicine', medicineSchema);

const supplierSchema = new Schema({
  name: { type: String, required: true, trim: true },
  contactPerson: String,
  phone: String,
  email: String,
  gstin: String,
  address: String,
  category: { type: String, enum: ['Pharmaceutical', 'Surgical', 'Equipment', 'General', 'Laboratory'], default: 'General' },
  paymentTerms: String,
  active: { type: Boolean, default: true },
}, { timestamps: true });
export const Supplier = model('Supplier', supplierSchema);

const itemSchema = new Schema({
  code: { type: String, unique: true },
  name: { type: String, required: true, trim: true },
  category: {
    type: String,
    enum: ['Consumable', 'Surgical', 'Linen', 'Equipment', 'Laboratory', 'Housekeeping', 'Stationery', 'Other'],
    default: 'Consumable',
  },
  unit: { type: String, default: 'Nos' },
  quantity: { type: Number, default: 0, min: 0 },
  reorderLevel: { type: Number, default: 10 },
  unitCost: { type: Number, default: 0 },
  location: String,
  supplier: ref('Supplier'),
  active: { type: Boolean, default: true },
}, { timestamps: true });
export const InventoryItem = model('InventoryItem', itemSchema);

const movementSchema = new Schema({
  itemType: { type: String, enum: ['Medicine', 'InventoryItem'], required: true },
  item: { type: Schema.Types.ObjectId, refPath: 'itemType', required: true, index: true },
  itemName: String,
  type: { type: String, enum: ['IN', 'OUT', 'ADJUST', 'DISPENSE', 'RETURN', 'EXPIRED'], required: true },
  quantity: { type: Number, required: true },
  batchNo: String,
  reference: String,
  note: String,
  department: String,
  by: ref('User'),
}, { timestamps: true });
movementSchema.index({ createdAt: -1 });
export const StockMovement = model('StockMovement', movementSchema);

const poSchema = new Schema({
  poNo: { type: String, unique: true },
  supplier: { ...ref('Supplier'), required: true },
  items: [{
    itemType: { type: String, enum: ['Medicine', 'InventoryItem'], required: true },
    item: { type: Schema.Types.ObjectId, refPath: 'items.itemType', required: true },
    name: String,
    quantity: { type: Number, required: true, min: 1 },
    unitCost: { type: Number, required: true, min: 0 },
  }],
  status: { type: String, enum: ['Draft', 'Ordered', 'Received', 'Cancelled'], default: 'Draft' },
  expectedDate: Date,
  receivedAt: Date,
  total: { type: Number, default: 0 },
  notes: String,
  createdBy: ref('User'),
}, { timestamps: true });
poSchema.pre('save', function total() {
  this.total = this.items.reduce((s, i) => s + i.quantity * i.unitCost, 0);
});
export const PurchaseOrder = model('PurchaseOrder', poSchema);
