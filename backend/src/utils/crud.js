import { Router } from 'express';
import { can } from '../middleware/auth.js';
import { nextCode } from '../models/index.js';
import { clean, notFound } from './http.js';
import { paginate, searchFilter } from './query.js';

/** Build standard list/get/create/update/delete routes for simple master-data collections. */
export function crudRouter(Model, {
  module, search = [], filters = [], populate, sort = 'name', codePrefix, label = 'Record', softDelete = true,
}) {
  const r = Router();

  r.get('/', can(module, 'r'), async (req, res) => {
    const filter = { ...searchFilter(req.query.q, search) };
    for (const f of filters) if (req.query[f]) filter[f] = req.query[f];
    if (req.query.active === 'true' || req.query.active === 'false') filter.active = req.query.active === 'true';
    res.json(await paginate(Model, filter, req, { sort, populate, defLimit: 50 }));
  });

  r.get('/:id', can(module, 'r'), async (req, res) => {
    const doc = await Model.findById(req.params.id).populate(populate || '');
    if (!doc) throw notFound(label);
    res.json(doc);
  });

  r.post('/', can(module, 'rw'), async (req, res) => {
    const data = clean(req.body);
    if (codePrefix && !data.code) data.code = await nextCode(codePrefix, { yearly: false, pad: 5 });
    const doc = await Model.create(data);
    res.status(201).json(doc);
  });

  r.put('/:id', can(module, 'rw'), async (req, res) => {
    const doc = await Model.findById(req.params.id);
    if (!doc) throw notFound(label);
    doc.set(clean(req.body));
    await doc.save();
    res.json(doc);
  });

  r.delete('/:id', can(module, 'rw'), async (req, res) => {
    const doc = await Model.findById(req.params.id);
    if (!doc) throw notFound(label);
    if (softDelete && Model.schema.path('active')) {
      doc.active = false;
      await doc.save();
    } else {
      await doc.deleteOne();
    }
    res.json({ ok: true });
  });

  return r;
}
