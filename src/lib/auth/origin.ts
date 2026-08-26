/**
 * Better Auth compares browser Origin headers against this explicit allow-list.
 * Keep the list limited to the configured application origin; additional hosts
 * require an intentional, separately reviewed configuration change.
 */
export function getAuthOriginConfiguration(baseURL: string) {
  const origin = new URL(baseURL).origin;

  return {
    baseURL: origin,
    trustedOrigins: [origin],
    advanced: {
      // Better Auth relaxes these checks for its test runtime unless explicitly
      // configured. Keep the test and production security behavior aligned.
      disableCSRFCheck: false,
      disableOriginCheck: false,
    },
  };
}
