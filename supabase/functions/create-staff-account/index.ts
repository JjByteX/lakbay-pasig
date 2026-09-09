// Phase 3.2 (step-4-phases.md): server side staff account creation.
//
// Why this has to be an Edge Function and not a client insert: RLS on
// profiles (0001, tightened by 0009) only lets an account write its own
// row (profiles_update_own) or lets an existing Admin write any row
// (profiles_update_admin, via is_admin()). Neither path lets a brand new
// auth.users row get created at all — that always needs
// supabase.auth.admin.createUser, which requires the service role key.
// The service role key is never shipped to the client (see
// architecture-notes.md's "what must never be touched without approval"
// and .env.example, which only exposes the anon key), so this has to run
// server side. Deno's Supabase Edge Functions runtime injects
// SUPABASE_SERVICE_ROLE_KEY automatically, no secret to manage by hand.
//
// Flow: verify the caller is an active Admin (using their own JWT against
// a request-scoped client, not the service client, so this check itself
// still goes through normal RLS) -> create the auth.users row with the
// service client -> update the profiles row the 0001 trigger already
// inserted for that new user with the staff fields. Two-step, not one
// transaction (Supabase Auth admin APIs don't expose a transaction across
// auth.users and public.profiles), so on a failure after user creation we
// best-effort delete the auth user rather than leave an orphaned account
// with no staff fields set.

import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const SYSTEM_PERMISSIONS = [
  "manage_places",
  "review_businesses",
  "publish_events",
  "build_trails",
] as const;
type SystemPermission = (typeof SYSTEM_PERMISSIONS)[number];

interface CreateStaffPayload {
  full_name: string;
  email: string;
  contact_number: string;
  password: string;
  position: string;
  system_permission: SystemPermission[];
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "Missing Authorization header" }, 401);
  }

  // Caller-scoped client: runs as the requesting user, subject to normal
  // RLS, used only to confirm they're really an active Admin before we do
  // anything with the service client below.
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user: caller },
  } = await callerClient.auth.getUser();
  if (!caller) {
    return json({ error: "Not signed in" }, 401);
  }

  const { data: callerProfile, error: callerProfileError } = await callerClient
    .from("profiles")
    .select("staff_role, active_status")
    .eq("id", caller.id)
    .single();

  if (
    callerProfileError ||
    !callerProfile ||
    callerProfile.staff_role !== "admin" ||
    callerProfile.active_status !== "active"
  ) {
    return json({ error: "Admin access required" }, 403);
  }

  let payload: CreateStaffPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const fullName = payload.full_name?.trim();
  const email = payload.email?.trim();
  const contactNumber = payload.contact_number?.trim();
  const password = payload.password;
  const position = payload.position?.trim();
  const systemPermission = Array.isArray(payload.system_permission)
    ? payload.system_permission.filter((p): p is SystemPermission =>
        SYSTEM_PERMISSIONS.includes(p as SystemPermission)
      )
    : [];

  if (!fullName || !email || !contactNumber || !password || !position) {
    return json({ error: "All fields are required." }, 400);
  }
  if (password.length < 8) {
    return json({ error: "Password must be at least 8 characters." }, 400);
  }

  // Service role client: bypasses RLS entirely, only used for the two
  // writes below (auth.users create, profiles update), never for the
  // caller-identity check above.
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // in-app creation, per step-4-plan.md's "no invite flow"
  });

  if (createError || !created.user) {
    // Supabase Auth returns a generic 422/"already registered" style error
    // here; surface its message directly rather than re-wrapping it, so
    // 3.3's "error surfaced specifically (e.g. email already in use)"
    // requirement is met without guessing at the wording ourselves.
    return json({ error: createError?.message ?? "Could not create the account." }, 400);
  }

  // migration 0001's on_auth_user_created trigger already inserted a
  // profiles row (role='resident', staff_role=null) for this new user by
  // the time createUser resolves. This step turns it into a staff row.
  const { error: profileError } = await adminClient
    .from("profiles")
    .update({
      role: "staff",
      staff_role: "staff",
      active_status: "active",
      display_name: fullName,
      contact_number: contactNumber,
      position,
      system_permission: systemPermission,
    })
    .eq("id", created.user.id);

  if (profileError) {
    // Best-effort cleanup: don't leave a resident-shaped orphan account
    // behind if the staff fields couldn't be set.
    await adminClient.auth.admin.deleteUser(created.user.id);
    return json({ error: profileError.message }, 500);
  }

  return json({ id: created.user.id });
});
