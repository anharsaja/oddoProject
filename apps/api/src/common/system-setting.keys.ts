/**
 * Keys of the `system_setting` rows the application reads by name.
 *
 * Declared once, here, because a key is a contract between whoever writes the
 * row (the seed) and whoever reads it (the health check). Two copies of the
 * string compile perfectly and disagree silently.
 */
export const APP_VERSION_KEY = 'app.version'
export const APP_INITIALIZED_AT_KEY = 'app.initialized_at'
