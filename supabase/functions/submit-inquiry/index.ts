const recipients = ["admin1@glblogistics.org", "mkabeireho@glblogistics.org"];
const allowedTypes = new Set(["career", "employer", "general"]);

function json(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      "Vary": "Origin"
    }
  });
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin") ?? "";
  const allowedOrigin = Deno.env.get("SITE_ORIGIN") ?? "";
  if (!allowedOrigin || origin !== allowedOrigin) {
    return new Response("Origin not allowed", { status: 403 });
  }

  const corsHeaders = {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Vary": "Origin"
  };
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return json({ error: "Invalid request" }, 400, allowedOrigin);
  }

  // Basic honeypot: quietly ignore automated submissions that fill the hidden field.
  if (typeof input.website === "string" && input.website.trim()) {
    return json({ ok: true }, 200, allowedOrigin);
  }

  const name = typeof input.name === "string" ? input.name.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim() : "";
  const inquiryType = typeof input.inquiry_type === "string" ? input.inquiry_type : "";
  const organization = typeof input.organization === "string" ? input.organization.trim() : "";
  const message = typeof input.message === "string" ? input.message.trim() : "";
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (
    name.length < 1 || name.length > 150 ||
    !emailLooksValid || email.length > 254 ||
    !allowedTypes.has(inquiryType) ||
    organization.length > 200 ||
    message.length < 1 || message.length > 4000 ||
    input.consent !== true
  ) {
    return json({ error: "Please check the form fields and consent box." }, 400, allowedOrigin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const secretKeysValue = Deno.env.get("SUPABASE_SECRET_KEYS");
  let supabaseSecretKey = "";
  try {
    if (secretKeysValue) supabaseSecretKey = JSON.parse(secretKeysValue).default ?? "";
  } catch {
    return json({ error: "Database configuration is unavailable." }, 500, allowedOrigin);
  }
  // Fallback for existing projects that still expose the legacy server-only key.
  supabaseSecretKey ||= Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const emailFrom = Deno.env.get("EMAIL_FROM");
  if (!supabaseUrl || !supabaseSecretKey || !resendApiKey || !emailFrom) {
    console.error("Inquiry configuration is incomplete", {
      supabaseUrl: Boolean(supabaseUrl),
      supabaseSecretKey: Boolean(supabaseSecretKey),
      resendApiKey: Boolean(resendApiKey),
      emailFrom: Boolean(emailFrom)
    });
    return json({ error: "The inquiry service is not configured." }, 503, allowedOrigin);
  }

  const inquiryId = crypto.randomUUID();
  const inquiry = {
    id: inquiryId,
    name,
    email,
    inquiry_type: inquiryType,
    organization: organization || null,
    message,
    consent_at: new Date().toISOString()
  };

  let dbResponse: Response;
  try {
    dbResponse = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/contact_inquiries`, {
      method: "POST",
      headers: {
        apikey: supabaseSecretKey,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify(inquiry)
    });
  } catch (error) {
    console.error("Inquiry database request threw", {
      errorType: error instanceof Error ? error.name : "unknown"
    });
    return json({ error: "We could not save your inquiry. Please try again later." }, 502, allowedOrigin);
  }
  if (!dbResponse.ok) {
    console.error("Inquiry database insert rejected", { status: dbResponse.status });
    return json({ error: "We could not save your inquiry. Please try again later." }, 502, allowedOrigin);
  }

  const emailText = [
    "A new website inquiry is ready for review.",
    "",
    "Sign in to the private admin page to read and respond to the inquiry:",
    `${Deno.env.get("SITE_ORIGIN")?.replace(/\/$/, "")}/admin.html`,
    "",
    `Inquiry ID: ${inquiryId}`
  ].join("\n");
  let emailResponse: Response;
  try {
    emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: emailFrom,
        to: recipients,
        subject: "New website inquiry received",
        text: emailText
      })
    });
  } catch (error) {
    console.error("Resend request threw", {
      errorType: error instanceof Error ? error.name : "unknown"
    });
    return json({ saved: true, notified: false }, 502, allowedOrigin);
  }
  if (!emailResponse.ok) {
    console.error("Resend rejected the email", { status: emailResponse.status });
    return json({ saved: true, notified: false }, 502, allowedOrigin);
  }

  return json({ saved: true, notified: true }, 200, allowedOrigin);
});
