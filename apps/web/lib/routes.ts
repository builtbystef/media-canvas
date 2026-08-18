/**
 * The pages of the app, by name.
 *
 * Their own module because both sides need them: the server decides where to
 * send a request, and the browser navigates once a cookie has changed. Nothing
 * server-only may be reachable from here.
 */
export const HOME = "/";
export const SIGN_IN = "/sign-in";
export const NEW_WORKSPACE = "/workspaces/new";
