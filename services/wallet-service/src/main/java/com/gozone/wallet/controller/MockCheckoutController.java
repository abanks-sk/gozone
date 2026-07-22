package com.gozone.wallet.controller;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Sandbox checkout page shown when Paystack runs in "mock" mode (no secret key).
 * Public (opened in the device browser without a JWT); the actual crediting still
 * happens server-side in POST /wallet/topup/verify after the user returns to the app.
 */
@RestController
public class MockCheckoutController {

    @GetMapping(value = "/mock-checkout", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> checkout(
            @RequestParam("reference") String reference,
            @RequestParam("amount") String amount) {

        // Guard against HTML injection via the query params.
        String ref = escape(reference);
        String amt = escape(amount);

        String html = """
            <!DOCTYPE html>
            <html lang="en"><head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>GoZone Pay — Sandbox</title>
            <style>
              :root { --bg:#0b0f19; --surface:#151d30; --primary:#2A56C6; --text:#F3F4F6; --muted:#9CA3AF; --border:#1e293b; }
              * { box-sizing:border-box; }
              body { font-family:-apple-system,Segoe UI,Roboto,sans-serif; background:var(--bg); color:var(--text);
                     margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:16px; }
              .card { background:var(--surface); border:1px solid var(--border); border-radius:20px; width:100%;
                      max-width:420px; padding:28px; text-align:center; }
              .logo { font-size:22px; font-weight:800; color:var(--primary); letter-spacing:0.5px; }
              .badge { display:inline-block; margin-top:8px; padding:4px 12px; border-radius:999px; font-size:12px;
                       font-weight:600; color:var(--primary); background:rgba(42,86,198,0.12); border:1px dashed var(--primary); }
              .amount { font-size:38px; font-weight:800; margin:22px 0; }
              .rows { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); border-radius:12px;
                      padding:14px; margin-bottom:22px; text-align:left; }
              .row { display:flex; justify-content:space-between; font-size:14px; margin-bottom:8px; }
              .row:last-child { margin-bottom:0; }
              .muted { color:var(--muted); }
              .val { font-weight:600; word-break:break-all; }
              .btn { display:block; width:100%; padding:14px; border-radius:12px; font-size:16px; font-weight:700;
                     border:none; cursor:pointer; margin-bottom:10px; }
              .primary { background:var(--primary); color:#fff; }
              .secondary { background:rgba(255,255,255,0.06); color:var(--text); border:1px solid var(--border); }
              #done { display:none; }
              .tick { width:60px; height:60px; border-radius:50%; background:rgba(42,86,198,0.12); color:var(--primary);
                      font-size:30px; display:inline-flex; align-items:center; justify-content:center; margin-bottom:14px; }
            </style></head>
            <body>
              <div class="card" id="pay">
                <div class="logo">GoZone Pay</div>
                <div class="badge">SANDBOX SIMULATOR</div>
                <div class="amount">GH&#8373; %AMOUNT%</div>
                <div class="rows">
                  <div class="row"><span class="muted">Merchant</span><span class="val">GoZone Wallet</span></div>
                  <div class="row"><span class="muted">Reference</span><span class="val">%REF%</span></div>
                  <div class="row"><span class="muted">Gateway</span><span class="val">Paystack (mock)</span></div>
                </div>
                <button class="btn primary" onclick="ok()">Authorize payment</button>
                <button class="btn secondary" onclick="window.close();history.back();">Cancel</button>
              </div>
              <div class="card" id="done">
                <div class="tick">&#10003;</div>
                <h2 style="margin:0 0 8px">Payment authorized</h2>
                <p class="muted" style="line-height:1.5">Return to the GoZone app and tap <b>Verify top-up</b> to add
                   GH&#8373; %AMOUNT% to your wallet.</p>
              </div>
              <script>
                function ok(){ document.getElementById('pay').style.display='none';
                              document.getElementById('done').style.display='block'; }
              </script>
            </body></html>
            """
            .replace("%REF%", ref)
            .replace("%AMOUNT%", amt);

        return ResponseEntity.ok(html);
    }

    private static String escape(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                .replace("\"", "&quot;").replace("'", "&#39;");
    }
}
