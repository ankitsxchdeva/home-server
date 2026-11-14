/*
 * Front-end settings. Prices, inventory, sale times and payment handles live in
 * the Google Sheet's Settings tab, so the page and the backend always agree.
 * Edit this file only to point the page at the backend.
 */
window.SHOP_CONFIG = {
  // Paste the Apps Script web app URL here (ends in /exec). Leave empty to run
  // the page in preview mode, where orders are kept only in your browser.
  apiUrl: "",

  // Shown until the sheet answers, and in preview mode.
  fallback: {
    shopName: "Friends & family sale",
    productName: "Frosted Keycap Case",
    description: "A frosted polycarbonate display case with a grid of individual slots for your artisan keycaps.",
    unitPrice: 145,
    currency: "USD",
    shippingNote: "Shipping is calculated after you order and added to your payment request.",
    total: 60,
    maxPerOrder: 4,
    homeCountry: "US",
    payDays: 3,
    paymentMethods: [
      { id: "paypal", label: "PayPal", handle: "[PayPal email or @handle]", usOnly: false },
      { id: "venmo", label: "Venmo", handle: "[@venmo-handle]", usOnly: true },
      { id: "wise", label: "Wise", handle: "[Wise email or @wisetag]", usOnly: false }
    ]
  },

  photos: [
    { src: "img/case-shelf.jpg", small: "img/case-shelf-800.jpg", w: 1600, h: 1066, alt: "Frosted keycap case resting on a wooden shelf between two potted plants" },
    { src: "img/case-keycap.jpg", small: "img/case-keycap-800.jpg", w: 1600, h: 1066, alt: "Close-up of the case's slot grid with one artisan keycap in the corner slot" },
    { src: "img/case-stool.jpg", small: "img/case-stool-800.jpg", w: 1066, h: 1600, alt: "The case on a wooden step stool with its foam insert and a black carry case" }
  ]
};
