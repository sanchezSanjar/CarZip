/**
 * Copies the development database (MONGO_DEV) into the production database (MONGO_PROD), demo data included,
 * and rewrites every stored photo address from the local one (http://localhost:3007/uploads/...) to the
 * public one (UPLOADS_PUBLIC_URL/uploads/...). The development database itself is not changed.
 *
 *   node deploy/copy-db-to-prod.mjs           shows what it would do (nothing is written)
 *   node deploy/copy-db-to-prod.mjs --write   really copies (the production collections are replaced)
 *
 * Reads MONGO_DEV, MONGO_PROD and UPLOADS_PUBLIC_URL from .env. Run it once, before going live,
 * and copy the uploads/ folder to the server too (see deploy/DEPLOY.md).
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';

const write = process.argv.includes('--write');
const { MONGO_DEV, MONGO_PROD, UPLOADS_PUBLIC_URL } = process.env;
const FROM = process.env.LOCAL_UPLOADS_URL ?? `http://localhost:${process.env.PORT_API ?? 3007}`;

if (!MONGO_DEV || !MONGO_PROD || !UPLOADS_PUBLIC_URL) {
	console.error('Set MONGO_DEV, MONGO_PROD and UPLOADS_PUBLIC_URL in .env first.');
	process.exit(1);
}
if (MONGO_DEV === MONGO_PROD) {
	console.error('MONGO_PROD must be a different database (e.g. the same cluster with /carzip_prod at the end).');
	process.exit(1);
}

const from = `${FROM}/uploads/`;
const to = `${UPLOADS_PUBLIC_URL.replace(/\/$/, '')}/uploads/`;
let rewritten = 0;

/** every string in a document, however deep, with the local photo address replaced */
const rewrite = (value) => {
	if (typeof value === 'string' && value.startsWith(from)) {
		rewritten++;
		return to + value.slice(from.length);
	}
	if (Array.isArray(value)) return value.map(rewrite);
	if (value && typeof value === 'object' && value.constructor === Object) {
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewrite(v)]));
	}
	return value; // ObjectId, Date, numbers ...
};

const dev = new MongoClient(MONGO_DEV);
const prod = new MongoClient(MONGO_PROD);
await Promise.all([dev.connect(), prod.connect()]);
const devDb = dev.db();
const prodDb = prod.db();
console.log(`${write ? 'COPYING' : 'DRY RUN (add --write to copy)'}: ${devDb.databaseName} -> ${prodDb.databaseName}`);
console.log(`photo addresses: ${from}... -> ${to}...`);

for (const { name } of await devDb.listCollections({ type: 'collection' }).toArray()) {
	const docs = (await devDb.collection(name).find().toArray()).map(rewrite);
	console.log(`  ${name}: ${docs.length} documents`);
	if (!write) continue;
	const target = prodDb.collection(name);
	await target.deleteMany({});
	if (docs.length) await target.insertMany(docs);
	// same indexes as development (unique nicknames, TTLs, ...); the _id index exists already
	for (const index of await devDb.collection(name).indexes()) {
		if (index.name === '_id_') continue;
		const { key, v, ns, ...options } = index;
		await target.createIndex(key, options).catch((e) => console.warn(`    index ${index.name}: ${e.message}`));
	}
}
console.log(`photo addresses rewritten: ${rewritten}`);
await Promise.all([dev.close(), prod.close()]);
