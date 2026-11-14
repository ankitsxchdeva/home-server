# Shop

Friends and family sale page, "2026 Inkwell 10x10 in-stock sale": 60 Inkwell 10x10 cases at $145, up to 4 per person, shipping worked out after the order.

- **Page:** static HTML in `site/`, served by GitHub Pages. No build step.
- **Orders:** a Google Sheet. A small Apps Script in the sheet (`apps-script/`) takes orders, holds a lock while it checks stock so two people can't buy the last case, and gives you a small **Shop** menu. The script has no access to your email: `@OnlyCurrentDoc` limits it to this one sheet. You email buyers yourself.
- **Payments:** buyers pick PayPal, Venmo (US addresses only) or Wise and must tick the friends-and-family box. The page never takes card or bank details.

Nothing here runs on the Pi, and the root `docker-compose.yml` doesn't include it.

## How an order flows

1. Buyer fills in the page. Address fields, labels and postal-code checks change per country (Google's address data for 250 countries, bundled in `site/address-data.json`). A US ZIP has to match the state. US buyers can add a phone number; buyers elsewhere aren't asked for one.
2. The sheet re-checks everything, takes the lock, checks stock and the 4-per-email cap, and adds a row with status **New**. The buyer lands on the success page with their order number.
3. You type the **Shipping** amount on the row. **Total due** fills itself.
4. Email the buyer what they owe and where to send it (the email templates in Settings are a starting point), then set Status to **Payment requested** and note the date in **Payment email sent**.
5. When the money arrives, select rows, **Shop > Mark selected rows as paid**.
6. Enter **Carrier** and **Tracking number**, email the buyer, note the date in **Tracking email sent** and set Status to **Shipped**.

Set a row to **Cancelled** to free its cases.

The **Summary** tab counts cases left, orders waiting on each step and money received.

## One-time setup

### 1. Sheet and script (about 10 minutes)

1. Create a new Google Sheet, e.g. "Keycap case orders". Keep it private.
2. **Extensions > Apps Script.** Rename the project "Shop".
3. Replace the contents of `Code.gs` with `apps-script/Code.gs`. Add two more script files (**+ > Script**) named `Admin` and `AddressData` and paste `apps-script/Admin.gs` and `apps-script/AddressData.gs`.
4. **Project Settings** (gear) > tick **Show "appsscript.json" manifest file**, then paste `apps-script/appsscript.json` into it.
5. Back in the editor, pick `setup` in the function list and press **Run**. Google asks you to authorize your own script. It should ask only to see and edit this one spreadsheet and to show the Shop menu; if it asks for email or all your sheets, the files weren't pasted as they are here. It may say "unsafe" only because the script isn't published; it's yours.
6. Reload the sheet. You now have **Orders**, **Settings**, **Summary** tabs and a **Shop** menu.

### 2. Settings tab

Fill these in before going live:

| Setting | What to put |
| --- | --- |
| `paypal_handle`, `venmo_handle`, `wise_handle` | Where buyers send money. Set `*_enabled` to FALSE to hide one. |
| `sale_opens_at` | When orders open, e.g. `2026-11-22 10:00` (the sheet's time zone). Blank = open now. Before then the page shows a countdown. |
| `pay_days` | Days buyers get after the payment email (default 3). |
| `allowed_countries` | Blank ships anywhere, or a list like `US, CA, GB`. |
| `sale_paused` | TRUE stops new orders instantly. |

Price ($145), stock (60), 4 per order and product name are here too, plus wording for the payment and tracking emails that you can reuse when you write them.

### 3. Deploy the order endpoint

1. In Apps Script, **Deploy > New deployment > Web app**.
2. **Execute as:** Me. **Who has access:** Anyone. (Buyers don't sign in. The endpoint only returns stock counts and settings, never other buyers' details; the sheet stays private.)
3. Copy the URL ending in `/exec` and paste it into `site/config.js` as `apiUrl`.
4. After any later change to the script: **Deploy > Manage deployments > edit > Version: New version**, so the URL stays the same.

### 4. Publish the page

1. Repo **Settings > Pages > Source: GitHub Actions**.
2. **Actions > shop-pages > Run workflow.** It runs the tests, then publishes `site/`.

Pages for this repo lives at `ankitsachdeva.com/home-server/`, because the user site has that custom domain. For a cleaner link, move `shop/` into its own repo (the workflow just needs its paths changed from `shop/site` to `site`).

### 5. End-to-end test (before announcing)

`tests/e2e.html` places real test orders against the sheet and checks the answers: bad ZIP, Venmo outside the US and a missing friends-and-family tick are refused; a 3-case order goes through with the right subtotal; a double submit makes one order; the same email can't pass 4; a UK order with Wise and no phone goes through; a burst of simultaneous orders for the last few cases sells exactly what's left and no more; the next order says sold out.

1. In Settings set `inventory_total` to `8` and leave Orders empty.
2. Run the shop-pages workflow with **include_e2e** ticked, open `…/e2e.html` and press **Run test**. Test orders use `@example.com` addresses and the name "E2E Test".
3. Open the sale page: it should say sold out. Fill in a Shipping amount on one test row: Total due fills itself.
4. Clean up: delete the test rows, set `inventory_total` back to `60`, and run the workflow again with **include_e2e** unticked.

## Preview without the sheet

With `apiUrl` empty the page runs in preview mode: a banner says so and orders stay in your browser. Add `?demo=soldout`, `?demo=low`, `?demo=closed` or `?demo=reset` to see the other states.

```
cd shop && npm run serve   # http://localhost:8080
```

## Reusing for another product

Copy the sheet (the script comes with it), change the product settings and email templates, swap the photos in `site/img/` and the list in `site/config.js`, then deploy a new web app URL.

## Tests

```
cd shop && npm test
```

Covers address rules for several countries, and the backend against an in-memory sheet: no overselling past 60, the per-email cap, double-submit protection, sold-out and not-open answers, formula injection, Mark paid, and that the script has no email access.

`apps-script/AddressData.gs` and `site/address-data.json` are generated:

```
pip download --no-deps google-i18n-address   # BSD-3, Google's address metadata
unzip google_i18n_address-*.whl -d i18n
python3 -I scripts/build-address-data.py i18n/i18naddress/data/all.json
```
