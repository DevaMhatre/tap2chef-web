// The tenancy gate: every query on a model that carries accountId must name
// one, or it throws before reaching the database. One tenant can then never
// read or change another's records by a forgotten filter.

const QUERIES = [
  "countDocuments",
  "deleteMany",
  "deleteOne",
  "distinct",
  "find",
  "findOne",
  "findOneAndDelete",
  "findOneAndReplace",
  "findOneAndUpdate",
  "replaceOne",
  "updateMany",
  "updateOne",
];

const named = (filter) => typeof filter?.accountId === "string" && filter.accountId !== "";

export default function tenantScoped(schema) {
  schema.add({ accountId: { type: String, required: true } });

  schema.pre(QUERIES, function () {
    if (!named(this.getFilter())) throw new Error(`${this.model.modelName}.${this.op} without accountId`);
  });

  schema.pre("aggregate", function () {
    if (!named(this.pipeline()[0]?.$match)) throw new Error(`${this._model.modelName}.aggregate without accountId`);
  });

  schema.pre("bulkWrite", function (ops) {
    for (const op of ops) {
      const [kind, body] = Object.entries(op)[0];
      const filter = kind === "insertOne" ? body.document : body.filter;
      if (!named(filter)) throw new Error(`${this.modelName}.bulkWrite ${kind} without accountId`);
    }
  });
}
