/* ==========================================================================
   Club Onyx — public site config
   Everything here is visible to visitors. Never put passwords or tokens in
   this file: admin login lives in environment variables on the server.
   ========================================================================== */

window.ONYX_CONFIG = {
  clubName: "Club Onyx",

  // Where reservations, applications and messages go.
  // Leave empty to fall back to a pre-filled email; paste a form endpoint
  // (Formspree, Basin, Getform...) to collect submissions.
  formEndpoint: "",

  // Inbox used for the mailto fallback and general enquiries.
  contactEmail: "bookings@clubonyxx.example",

  // Social / community links. Replace the "#" placeholders with real URLs.
  links: {
    discord: "https://discord.gg/SFBC8bg79z",
    instagram: "#",
    tiktok: "#",
    x: "#",
    spotify: "#",
    youtube: "#"
  }
};
