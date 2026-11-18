# Third-party code stored on this site

These files are copied here (instead of loaded from a public CDN) so that no outside
company learns who visits WiseRealm.

| File | Library | Version | License |
| --- | --- | --- | --- |
| `supabase.js` | [@supabase/supabase-js](https://github.com/supabase/supabase-js) (UMD build, `dist/umd/supabase.js`) | 2.118.0 | MIT (`LICENSE-supabase-js.txt`) |
| `qrcode.js` | [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) | 1.4.4 | MIT (header in the file) |

To update: `npm pack @supabase/supabase-js@<version>`, unpack it and copy `package/dist/umd/supabase.js` here.
