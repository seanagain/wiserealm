// Copies the shop catalog (names + prices) from js/items.js and the house furniture from
// js/furniture.js into supabase/schema.sql.
// Run from the repo folder:  node tools/gen-shop-sql.mjs
import fs from 'fs';
import { ITEMS } from '../js/items.js';
import { HOUSE_ITEMS } from '../js/furniture.js';
import { CONTAINS, EXACT } from '../js/namefilter.js';

const ALL = [...ITEMS, ...HOUSE_ITEMS];
const file = new URL('../supabase/schema.sql', import.meta.url);
const sql = fs.readFileSync(file, 'utf8');
const q = s => "'" + String(s).replace(/'/g, "''") + "'";
const rows = ALL.map(i => `  (${q(i.id)}, ${q(i.slot)}, ${q(i.name)}, ${i.price | 0}, ${i.milestone ? q(i.milestone) : 'null'})`).join(',\n');
const block = `-- BEGIN SHOP ITEMS
insert into public.shop_items (id, slot, name, price, milestone) values
${rows}
on conflict (id) do update set slot = excluded.slot, name = excluded.name, price = excluded.price, milestone = excluded.milestone;
delete from public.shop_items where id not in (${ALL.map(i => q(i.id)).join(', ')});
-- END SHOP ITEMS`;
const arr = list => `array[${list.map(q).join(', ')}]::text[]`;
const nf = `-- BEGIN NAME FILTER
-- (generated from js/namefilter.js by tools/gen-shop-sql.mjs)
create or replace function public.name_filter_contains() returns text[] language sql immutable as $$ select ${arr(CONTAINS)} $$;
create or replace function public.name_filter_exact() returns text[] language sql immutable as $$ select ${arr(EXACT)} $$;
-- END NAME FILTER`;
const out = sql.replace(/-- BEGIN SHOP ITEMS[\s\S]*?-- END SHOP ITEMS/, () => block).replace(/-- BEGIN NAME FILTER[\s\S]*?-- END NAME FILTER/, () => nf);
fs.writeFileSync(file, out);
console.log(`Wrote ${ALL.length} shop items and the name filter (${CONTAINS.length + EXACT.length} words) into supabase/schema.sql`);
