/**
 * Same-origin paths for `/auth/login?redirect=` so auth-guard bounces and the
 * PWA logo escape hatch can return without becoming an open redirect.
 */

function parseBabyLoginPublicId(redirect: string | undefined): string | null {
  if (redirect === undefined) {
    return null;
  }
  if (!redirect.startsWith("/baby/")) {
    return null;
  }
  if (
    redirect.includes("//") ||
    redirect.includes("\\") ||
    redirect.includes("?") ||
    redirect.includes("#") ||
    redirect.includes("%")
  ) {
    return null;
  }
  const publicId = redirect.slice("/baby/".length);
  if (publicId.length === 0 || publicId.includes("/")) {
    return null;
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(publicId)) {
    return null;
  }
  return publicId;
}

function parseSameOriginPath(redirect: string | undefined): string | null {
  if (redirect === undefined || redirect === "") {
    return null;
  }
  if (!redirect.startsWith("/") || redirect.startsWith("//") || redirect.includes("\\")) {
    return null;
  }
  return redirect;
}

export function babyLoginHomeLink(redirect: string | undefined) {
  const publicId = parseBabyLoginPublicId(redirect);
  if (publicId === null) {
    return { to: "/" as const };
  }
  return { params: { publicId }, to: "/baby/$publicId" as const };
}

export function loginSuccessTarget(redirect: string | undefined) {
  return { href: parseSameOriginPath(redirect) ?? "/dashboard" };
}

/**
 * Baby-page overlay login: return to the overlay the user was on, or `null`
 * so the dialog can close back to the public baby page.
 */
export function overlayLoginSuccessTarget(redirect: string | undefined) {
  const path = parseSameOriginPath(redirect);
  if (path === null) {
    return null;
  }
  return { href: path };
}
