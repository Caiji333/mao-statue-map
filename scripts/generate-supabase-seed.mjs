import { readFile, writeFile } from 'node:fs/promises';

const collection = JSON.parse(await readFile('public/statues.geojson', 'utf8'));
const quote = (value) => value == null ? 'null' : `'${String(value).replaceAll("'", "''")}'`;
const rows = collection.features.map(({ geometry, properties }) => {
  const [longitude, latitude] = geometry.coordinates;
  return `(${quote(properties.id)}, ${quote(properties.name)}, ${quote(properties.province)}, ${quote(properties.city)}, ${quote(properties.address)}, ${longitude}, ${latitude}, ${quote(properties.desc)}, ${quote(properties.background)}, ${quote(properties.year)}, ${quote(properties.image)}, ${quote(properties.source || '本地 GeoJSON 初始化')}, ${quote(properties.verificationStatus || 'verified')}, 'approved')`;
});
const sql = `-- Generated from public/statues.geojson. Re-run npm run seed:supabase after local data changes.\ninsert into public.statues (external_id, name, province, city, address, longitude, latitude, desc, background, year, image_url, source, verification_status, status) values\n${rows.join(',\n')}\non conflict (external_id) do update set name = excluded.name, province = excluded.province, city = excluded.city, address = excluded.address, longitude = excluded.longitude, latitude = excluded.latitude, desc = excluded.desc, background = excluded.background, year = excluded.year, image_url = excluded.image_url, source = excluded.source, verification_status = excluded.verification_status, updated_at = now();\n`;
await writeFile('supabase/seed.sql', sql, 'utf8');
console.log(`Generated supabase/seed.sql with ${rows.length} published points.`);
