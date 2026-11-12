// Who may talk to the bridge: pages and requests that belong to this machine (shared by the
// HTTP routes and the WebSocket link).

export const isLocalOrigin = (origin) =>
  !origin || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);
/**
 * The request was addressed to this machine by name or address. Same-origin requests carry no
 * Origin, so without this a site whose name was re-pointed at 127.0.0.1 (DNS rebinding) could read
 * the saves and the transcript.
 */
export const isLocalHost = (host) => !!host && /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
