// Copies the shop catalog (names + prices) from js/items.js into supabase/schema.sql.
// Run from the repo folder:  node tools/gen-shop-sql.mjs
import fs from 'fs';
import { ITEMS } from '../js/items.js';

const file = new URL('../supabase/schema.sql', import.meta.url);
const sql = fs.readFileSync(file, 'utf8');
const q = s => "'" + String(s).replace(/'/g, "''") + "'";
const rows = ITEMS.map(i => `  (${q(i.id)}, ${q(i.slot)}, ${q(i.name)}, ${i.price | 0})`).join(',\n');
const block = `-- BEGIN SHOP ITEMS
insert into public.shop_items (id, slot, name, price) values
${rows}
on conflict (id) do update set slot = excluded.slot, name = excluded.name, price = excluded.price;
delete from public.shop_items where id not in (${ITEMS.map(i => q(i.id)).join(', ')});
-- END SHOP ITEMS`;
const out = sql.replace(/-- BEGIN SHOP ITEMS[\s\S]*?-- END SHOP ITEMS/, block);
fs.writeFileSync(file, out);
console.log(`Wrote ${ITEMS.length} shop items into supabase/schema.sql`);
