"use client";

import { supabase } from "./supabaseClient";

export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers = new Headers(init.headers || {});
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  } else {
    console.warn(
      "authFetch: no Supabase session token found; request may be unauthorized",
      input
    );
  }
  return fetch(input, { ...init, headers });
}
