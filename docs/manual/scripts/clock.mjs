// Use only with the isolated manual fixture. No production code is changed.
if (!process.env.SCHEDU_DB_PATH?.includes('schedu-manual')) throw Error('The manual clock requires an isolated manual database.');
const RealDate = Date;
const fixed = RealDate.parse('2026-10-04T18:35:00+08:00');
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [fixed])); }
  static now() { return fixed; }
};
