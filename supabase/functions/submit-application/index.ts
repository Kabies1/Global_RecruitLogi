const recipients = ["admin1@glblogistics.org", "mkabeireho@glblogistics.org"];
const allowedOriginEnv = "SITE_ORIGIN";
const maxCvBytes = 8 * 1024 * 1024;
const allowedMime = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);

function json(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), { status, headers: {
    "Content-Type": "application/json", "Access-Control-Allow-Origin": origin, "Vary": "Origin"
  }});
}
function str(value: unknown, max = 3000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function normalizeRows(value: unknown, fields: string[], rowLimit: number, fieldLimit = 1000) {
  if (!Array.isArray(value) || value.length > rowLimit) return null;
  const rows = value.map(item => {
    if (!isObject(item)) return null;
    const out: Record<string, string> = {};
    for (const field of fields) out[field] = str(item[field], fieldLimit);
    return out;
  });
  return rows.some(row => row === null) ? null : rows;
}
function getServerKey() {
  const packed = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (packed) {
    try {
      const parsed = JSON.parse(packed);
      if (typeof parsed.default === "string") return parsed.default;
    } catch { /* use legacy fallback */ }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

Deno.serve(async request => {
  const origin = request.headers.get("origin") ?? "";
  const configuredOrigin = Deno.env.get(allowedOriginEnv) ?? "";
  let allowedOrigin = "";
  try { allowedOrigin = new URL(configuredOrigin).origin; }
  catch { return new Response("Application origin is not configured", { status: 500 }); }
  const allowedOrigins = new Set([allowedOrigin]);
  const siteUrl = new URL(allowedOrigin);
  if (siteUrl.hostname === "glblogistics.org") {
    allowedOrigins.add(`${siteUrl.protocol}//www.glblogistics.org`);
  } else if (siteUrl.hostname === "www.glblogistics.org") {
    allowedOrigins.add(`${siteUrl.protocol}//glblogistics.org`);
  }
  const responseOrigin = allowedOrigins.has(origin) ? origin : "";
  if (!responseOrigin) return new Response("Origin not allowed", { status: 403 });
  const cors = { "Access-Control-Allow-Origin": responseOrigin, "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Vary": "Origin" };
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > maxCvBytes + 512_000) return json({ error: "The application is too large. CV files must be 8 MB or smaller." }, 413, responseOrigin);
  let form: FormData;
  try { form = await request.formData(); }
  catch { return json({ error: "Please submit the application form again." }, 400, responseOrigin); }
  if (str(form.get("website"), 200)) return json({ saved: true, notified: true }, 200, responseOrigin);

  let input: Record<string, unknown>;
  try {
    const raw = form.get("application");
    if (typeof raw !== "string") throw new Error("missing application");
    const parsed = JSON.parse(raw);
    if (!isObject(parsed)) throw new Error("invalid application");
    input = parsed;
  } catch { return json({ error: "Application details were incomplete." }, 400, responseOrigin); }

  const first = str(input.legal_first_name, 100);
  const middle = str(input.legal_middle_name, 100);
  const last = str(input.legal_last_name, 100);
  const email = str(input.email, 254).toLowerCase();
  const phone = str(input.phone, 40);
  const profession = str(input.profession, 120);
  const workEligibility = str(input.work_eligibility, 10);
  const desiredRole = str(input.desired_role, 160);
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const education = normalizeRows(input.education, ["institution","degree","field","country","completion_year"], 8);
  const employment = normalizeRows(input.employment_history, ["facility","facility_type","title","start_date","end_date","specialties","responsibilities","reason_for_leaving"], 8);
  const credentials = normalizeRows(input.credentials, ["credential_type","number","issuer","expiration_date","cpr_status"], 10);
  const references = normalizeRows(input.references, ["name","title","facility","phone","email","relationship"], 4);
  const address = isObject(input.address) ? {
    street: str(input.address.street, 180), unit: str(input.address.unit, 80), city: str(input.address.city, 100),
    state: str(input.address.state, 100), postal_code: str(input.address.postal_code, 30), country: str(input.address.country, 100)
  } : null;
  const availability = isObject(input.availability) ? {
    employment_status: str(input.availability.employment_status, 30), shifts: Array.isArray(input.availability.shifts) ? input.availability.shifts.filter(v => typeof v === "string").slice(0, 6) : [],
    travel: input.availability.travel === true, on_call: input.availability.on_call === true,
    start_date: str(input.availability.start_date, 20)
  } : null;
  const discipline = input.disciplinary_action === true;
  const explanation = str(input.disciplinary_explanation, 3000);
  const cvText = str(form.get("cv_text"), 40000);
  const fileEntry = form.get("cv_file");
  const cvFile = fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null;
  const requiredConsent = input.background_check_consent === true && input.exclusion_screening_consent === true &&
    input.health_verification_acknowledged === true && input.reference_contact_consent === true &&
    input.privacy_consent === true && input.declaration_accepted === true;

  const cvInvalid = (!cvText && !cvFile) || (!!cvText && !!cvFile) || cvText.length > 40000 ||
    (!!cvFile && (cvFile.size > maxCvBytes || !allowedMime.has(cvFile.type)));

  if (!first || !last || !emailValid || !phone || !profession || !desiredRole || !address?.street ||
      !address.city || !address.country || !education || education.length < 1 || education.some(row => !row.institution || !row.degree) ||
      !employment || !credentials || !references || references.length < 2 || references.slice(0, 2).some(row => !row.name || !row.phone || !row.email) ||
      !availability || !availability.employment_status || availability.shifts.length < 1 ||
      !["yes","no","unsure"].includes(workEligibility) || typeof input.disciplinary_action !== "boolean" ||
      (discipline && !explanation) || !requiredConsent ||
      cvInvalid) {
    return json({ error: "Please review required fields, consents, and your CV (PDF, DOC, or DOCX up to 8 MB)." }, 400, responseOrigin);
  }
  if (str(input.electronic_signature, 250).toLowerCase() !== `${first} ${middle} ${last}`.replace(/\s+/g, " ").trim().toLowerCase()) {
    return json({ error: "Enter your full legal name as your electronic signature." }, 400, responseOrigin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const apiKey = getServerKey();
  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const emailFrom = Deno.env.get("EMAIL_FROM") ?? "";
  if (!supabaseUrl || !apiKey || !resendKey || !emailFrom) {
    console.error("Application configuration incomplete", { hasUrl: !!supabaseUrl, hasServerKey: !!apiKey, hasResendKey: !!resendKey, hasFrom: !!emailFrom });
    return json({ error: "The application service is not configured." }, 503, responseOrigin);
  }

  const id = crypto.randomUUID();
  let cvPath: string | null = null;
  let cvName: string | null = null;
  const base = supabaseUrl.replace(/\/$/, "");
  const headers = { apikey: apiKey };
  if (cvFile) {
    const extension = cvFile.name.toLowerCase().split(".").pop() ?? "";
    if (!["pdf","doc","docx"].includes(extension)) return json({ error: "CV file must be PDF, DOC, or DOCX." }, 400, responseOrigin);
    cvPath = `${id}/cv.${extension}`;
    cvName = cvFile.name.replace(/[\r\n"\\]/g, "_").slice(0, 180);
    let upload: Response;
    try {
      upload = await fetch(`${base}/storage/v1/object/candidate-cvs/${cvPath}`, {
        method: "POST", headers: { ...headers, "Content-Type": cvFile.type, "x-upsert": "false" }, body: cvFile
      });
    } catch (error) {
      console.error("Candidate CV upload threw", { kind: error instanceof Error ? error.name : "unknown" });
      return json({ error: "We could not securely upload your CV. Please try again." }, 502, responseOrigin);
    }
    if (!upload.ok) {
      console.error("Candidate CV upload rejected", { status: upload.status });
      return json({ error: "We could not securely upload your CV. Please try again." }, 502, responseOrigin);
    }
  }

  const record = {
    id, legal_first_name: first, legal_middle_name: middle, legal_last_name: last, email, phone,
    contact_preference: ["email","phone","text"].includes(str(input.contact_preference)) ? input.contact_preference : "email",
    address, profession, desired_role: desiredRole, work_eligibility: workEligibility,
    education, employment_history: employment, credentials, disciplinary_action: discipline,
    disciplinary_explanation: explanation, professional_references: references.slice(0, 4), availability,
    background_check_consent: true, exclusion_screening_consent: true,
    health_verification_acknowledged: true, reference_contact_consent: true, privacy_consent: true,
    future_opportunities_consent_at: input.future_opportunities_consent === true ? new Date().toISOString() : null,
    declaration_accepted: true, electronic_signature: str(input.electronic_signature, 250),
    signed_at: new Date().toISOString(), cv_text: cvText, cv_file_path: cvPath, cv_file_name: cvName
  };
  let saved: Response;
  try {
    saved = await fetch(`${base}/rest/v1/candidate_applications`, { method: "POST",
      headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(record) });
  } catch (error) {
    if (cvPath) await fetch(`${base}/storage/v1/object/candidate-cvs/${cvPath}`, { method: "DELETE", headers }).catch(() => {});
    console.error("Candidate application insert threw", { kind: error instanceof Error ? error.name : "unknown" });
    return json({ error: "We could not save the application. Please try again." }, 502, responseOrigin);
  }
  if (!saved.ok) {
    if (cvPath) await fetch(`${base}/storage/v1/object/candidate-cvs/${cvPath}`, { method: "DELETE", headers }).catch(() => {});
    console.error("Candidate application insert rejected", { status: saved.status });
    return json({ error: "We could not save the application. Please try again." }, 502, responseOrigin);
  }

  const fullName = [first, middle, last].filter(Boolean).join(" ");
  let notified = false;
  try {
    const notice = await fetch("https://api.resend.com/emails", { method: "POST", headers: {
      Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json"
    }, body: JSON.stringify({ from: emailFrom, to: recipients, subject: "New candidate application received",
      text: `A candidate application was submitted.\n\nApplicant: ${fullName}\nProfession: ${profession}\nDesired role: ${desiredRole}\nSubmitted: ${new Date().toISOString()}\nCV supplied: ${cvFile ? "Yes, stored securely" : "Pasted text"}\n\nSign in to the private admin page to review the application:\n${allowedOrigin}/admin.html\n\nApplication ID: ${id}` }) });
    notified = notice.ok;
    if (!notice.ok) console.error("Application notification rejected", { status: notice.status });
  } catch (error) {
    console.error("Application notification threw", { kind: error instanceof Error ? error.name : "unknown" });
  }
  return json({ saved: true, notified, applicationId: id }, 200, responseOrigin);
});
