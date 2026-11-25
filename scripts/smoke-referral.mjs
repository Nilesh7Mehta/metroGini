/**
 * Smoke test: Uzair shares UZAIRUE9B → Babli applies via applyReferral;
 * mutual exclusivity with promo; applyCoupon rejects referral codes.
 *
 *   node scripts/smoke-referral.mjs
 */
import "dotenv/config";

const BASE = `http://127.0.0.1:${process.env.PORT || 4001}/api`;
const UZAIR = { mobile: "7900053243", name: "Uzair", pincode: "400612" };
const BABLI = { mobile: "9004186460", name: "Babli", pincode: "400612" };
const OTP = "1234";
const REF_CODE = "UZAIRUE9B";

const log = (step, data) => {
  console.log(`\n=== ${step} ===`);
  console.log(typeof data === "string" ? data : JSON.stringify(data, null, 2));
};

async function req(method, path, { token, body } = {}) {
  const url = `${BASE}${path}`;
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body != null ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new Error(`fetch failed ${method} ${url}: ${err.message} cause=${err.cause || ""}`);
  }
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

async function login(user) {
  const loginRes = await req("POST", "/user/login-or-register", {
    body: { mobile: user.mobile, name: user.name, pincode: user.pincode },
  });
  if (loginRes.status >= 400) {
    throw new Error(`login failed ${user.mobile}: ${JSON.stringify(loginRes.json)}`);
  }
  const verify = await req("POST", "/user/verify-otp", {
    body: { mobile: user.mobile, otp: OTP },
  });
  if (verify.status >= 400) {
    throw new Error(`verify failed ${user.mobile}: ${JSON.stringify(verify.json)}`);
  }
  const token =
    verify.json?.data?.access_token ||
    verify.json?.access_token ||
    verify.json?.data?.token;
  if (!token) {
    throw new Error(`no token for ${user.mobile}: ${JSON.stringify(verify.json)}`);
  }
  return { token, verify: verify.json?.data?.user?.id || verify.json?.data?.id };
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
}

const results = [];

try {
  log("1) Login Uzair (referrer)", UZAIR);
  const uzair = await login(UZAIR);
  log("Uzair token ok", { tokenPrefix: uzair.token.slice(0, 20) + "..." });

  const uzairProfile = await req("GET", "/user/profile", { token: uzair.token });
  log("Uzair profile referral", {
    status: uzairProfile.status,
    referral_code: uzairProfile.json?.data?.referral_code,
    rewards_earned: uzairProfile.json?.data?.rewards_earned,
  });
  assert(
    uzairProfile.json?.data?.referral_code === REF_CODE,
    `Uzair should have ${REF_CODE}`,
  );
  results.push("PASS Uzair has referral_code " + REF_CODE);

  log("2) Login Babli (friend / new customer)", BABLI);
  const babli = await login(BABLI);

  // Find or use draft order 4
  let orderId = 4;
  const review = await req("GET", `/user/order/${orderId}/review`, {
    token: babli.token,
  });
  log("Babli draft review (before)", {
    status: review.status,
    message: review.json?.message,
    coupon: review.json?.coupon || review.json?.data?.coupon,
    discount: review.json?.discount_price ?? review.json?.data?.discount_price,
  });
  if (review.status === 404) {
    // create draft
    const created = await req("POST", "/user/order", {
      token: babli.token,
      body: {},
    });
    log("Create draft", created);
    orderId = created.json?.order_id || created.json?.data?.order_id || created.json?.id;
    assert(orderId, "need order id");
  }

  log("3) Apply referral via applyReferral", { orderId, referral_code: REF_CODE });
  const applyRef = await req("POST", `/user/order/${orderId}/applyReferral`, {
    token: babli.token,
    body: { referral_code: REF_CODE },
  });
  log("applyReferral response", { status: applyRef.status, ...applyRef.json });
  assert(applyRef.status === 200, "applyReferral should succeed");
  assert(applyRef.json?.referred === true, "referred flag");
  results.push("PASS applyReferral " + REF_CODE);

  // Check DB state via profile/review
  const afterRef = await req("GET", `/user/order/${orderId}/review`, {
    token: babli.token,
  });
  log("Review after referral", {
    status: afterRef.status,
    bodyKeys: Object.keys(afterRef.json || {}),
    coupon_code:
      afterRef.json?.coupon?.coupon_code ||
      afterRef.json?.data?.coupon?.coupon_code ||
      afterRef.json?.coupon_code,
    discount_price:
      afterRef.json?.discount_price ?? afterRef.json?.data?.discount_price,
  });

  log("4) Mutual exclusivity: apply promo FIRSTORDER (should clear referral)");
  const applyPromo = await req("POST", `/user/order/${orderId}/applyCoupon`, {
    token: babli.token,
    body: { coupon_code: "FIRSTORDER" },
  });
  log("applyCoupon FIRSTORDER", { status: applyPromo.status, ...applyPromo.json });
  assert(applyPromo.status === 200, "applyCoupon FIRSTORDER should succeed");
  results.push("PASS applyCoupon cleared referral / set FIRSTORDER");

  {
    const { default: sqlMid } = await import("../src/config/db.js");
    const mid = await sqlMid.query(
      `SELECT referred_by_user_id, applied_referral_code_id, applied_coupon_id
       FROM orders WHERE id = $1`,
      [orderId],
    );
    log("DB after promo (referral must be cleared)", mid.rows[0]);
    assert(mid.rows[0].referred_by_user_id == null, "referral cleared after promo");
    assert(mid.rows[0].applied_referral_code_id == null, "applied_referral_code_id cleared");
    results.push("PASS promo clears referral fields");
    // keep pool for later sql import — end would break; don't end mid
  }

  log("5) Re-apply referral (should clear promo)");
  const applyRef2 = await req("POST", `/user/order/${orderId}/applyReferral`, {
    token: babli.token,
    body: { referral_code: REF_CODE },
  });
  log("applyReferral again", { status: applyRef2.status, ...applyRef2.json });
  assert(applyRef2.status === 200, "re-apply referral should succeed");
  results.push("PASS referral replaces promo");

  log("6) applyCoupon with referral code should FAIL (wrong API)");
  const wrongApi = await req("POST", `/user/order/${orderId}/applyCoupon`, {
    token: babli.token,
    body: { coupon_code: REF_CODE },
  });
  log("applyCoupon with UZAIRUE9B", { status: wrongApi.status, ...wrongApi.json });
  assert(wrongApi.status >= 400, "referral code must not work on applyCoupon");
  results.push("PASS applyCoupon rejects referral code");

  log("7) Uzair cannot use own referral code");
  const { default: sql } = await import("../src/config/db.js");

  // Ensure Uzair has a mutable draft (dummy DB)
  let uzairOrderId;
  const existingUzairDraft = await sql.query(
    `SELECT id FROM orders
     WHERE user_id = 2 AND status = 'draft'
       AND (payment_status IS NULL OR payment_status NOT IN ('paid'))
     ORDER BY id DESC LIMIT 1`,
  );
  if (existingUzairDraft.rows[0]) {
    uzairOrderId = existingUzairDraft.rows[0].id;
  } else {
    const addr = await sql.query(
      `SELECT id FROM user_address_details WHERE user_id = 2 ORDER BY id DESC LIMIT 1`,
    );
    const svc = await sql.query(`SELECT id FROM services ORDER BY id LIMIT 1`);
    const ins = await sql.query(
      `INSERT INTO orders (user_id, service_id, clothes_count, estimated_weight_min,
         estimated_weight_max, address_id, status, order_code)
       VALUES (2, $1, 5, 2, 4, $2, 'draft', $3)
       RETURNING id`,
      [
        svc.rows[0]?.id || 1,
        addr.rows[0]?.id || null,
        `MG${Math.floor(100000 + Math.random() * 900000)}`,
      ],
    );
    uzairOrderId = ins.rows[0].id;
  }
  log("Uzair draft for self-test", { orderId: uzairOrderId });

  const selfRef = await req("POST", `/user/order/${uzairOrderId}/applyReferral`, {
    token: uzair.token,
    body: { referral_code: REF_CODE },
  });
  log("Uzair self-referral", { status: selfRef.status, ...selfRef.json });
  assert(selfRef.status >= 400, "own referral must fail");
  results.push("PASS cannot use own referral code");

  // DB verification on Babli order
  const { rows } = await sql.query(
    `SELECT id, user_id, applied_coupon_id, applied_referral_code_id,
            referred_by_user_id, discount_price
     FROM orders WHERE id = $1`,
    [orderId],
  );
  log("DB order after final referral apply", rows[0]);
  assert(rows[0]?.referred_by_user_id == 2, "referred_by should be Uzair (2)");
  assert(rows[0]?.applied_referral_code_id != null, "applied_referral_code_id set");
  results.push("PASS DB: only referral attribution set (referred_by=2)");

  const tpl = await sql.query(
    `SELECT id FROM coupons WHERE is_referral_code_template = true LIMIT 1`,
  );
  assert(
    String(rows[0].applied_coupon_id) === String(tpl.rows[0].id),
    "applied_coupon_id should be template while referral active",
  );
  results.push("PASS single discount path (template + referral_codes row)");

  // After promo was applied earlier then referral again — confirm not "two codes"
  assert(
    rows[0].applied_referral_code_id != null && rows[0].referred_by_user_id != null,
    "referral active",
  );
  const promoStill = await sql.query(
    `SELECT coupon_code FROM coupons WHERE id = $1`,
    [rows[0].applied_coupon_id],
  );
  assert(
    promoStill.rows[0]?.coupon_code === "REFERRAL_CODE_TEMPLATE",
    "should not keep FIRSTORDER while referral applied",
  );
  results.push("PASS only one active path (referral, not FIRSTORDER)");

  await sql.end();

  console.log("\n========== SMOKE RESULTS ==========");
  for (const r of results) console.log(r);
  console.log("\n========== CREDENTIALS ==========");
  console.log(`Base URL: ${BASE}`);
  console.log(`Uzair (referrer): mobile=${UZAIR.mobile} OTP=${OTP} code=${REF_CODE}`);
  console.log(`Babli (friend):   mobile=${BABLI.mobile} OTP=${OTP} orderId=${orderId}`);
  console.log(`APIs: POST /user/order/:id/applyReferral { referral_code }`);
  console.log(`      POST /user/order/:id/applyCoupon  { coupon_code }`);
  console.log("ALL CHECKS PASSED");
} catch (e) {
  console.error("\nSMOKE FAILED:", e.message);
  process.exit(1);
}
