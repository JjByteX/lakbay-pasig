import type { HelpTopic } from "@/lib/help-content";
import { DEFAULT_UNLOCK_RADIUS } from "@/lib/trail-unlock";

/**
 * Copy for the admin Help & FAQ page (docs/help-faq-plan.md). Plain text,
 * English. Section, button, and permission names are typed here, taken from
 * the admin screens, so change them in this file when a label changes.
 */
export const ADMIN_HELP_TOPICS: HelpTopic[] = [
  {
    title: "Getting around",
    items: [
      {
        question: "Why do I only see some sections?",
        answer:
          "The sidebar shows only what your account can use. Admins see everything. Staff see the Dashboard and the sections an Admin gave them. If you need another section, ask an Admin.",
      },
      {
        question: "What is the difference between Staff and Admin?",
        answer:
          "Staff do day to day content work in their sections. Admins can also open Staff and Activity, create staff accounts, set permissions, and set accounts Active or Inactive.",
      },
      {
        question: "Which permission opens which section?",
        answer:
          "Places opens Places. Businesses opens Businesses. Announcements opens Announcements and Fiestas. Trails opens Trails. Reports opens Reports. Landing Page opens Landing Page. Categories opens with any of Places, Businesses, Announcements, or Trails.",
      },
      {
        question: "How do I find something fast?",
        answer: "Use Search at the top of the sidebar, or press Ctrl+K (Cmd+K on a Mac).",
      },
      {
        question: "How do I see the app as a resident?",
        answer:
          "Open the account menu at the bottom of the sidebar and choose Resident View. You stay signed in. Choose Admin View or Staff View in the resident menu to come back.",
      },
    ],
  },
  {
    title: "Reviewing",
    items: [
      {
        question: "Where do I see what is waiting for review?",
        answer:
          "The Dashboard shows pending counts for each queue you can use. The Places and Businesses rows in the sidebar also carry a count.",
      },
      {
        question: "How do I review a business?",
        answer:
          "Open it from Businesses. A pending business shows Verify and Reject. Verify marks it as reviewed. Reject takes a review note that explains why, and the vendor sees it.",
      },
      {
        question: "How do I review a place?",
        answer:
          "Open it from Places. A pending place shows Verify and Reject, the same as a business. The Review History tab lists every review of it.",
      },
      {
        question: "What does Feature do?",
        answer:
          "Feature marks a business as Featured, on CATO's own judgment. Open the business and tap Feature. Tap Unfeature to remove it. Vendors cannot request it in the app.",
      },
      {
        question: "What is a discovery entry that needs review?",
        answer:
          "A discovery entry on a place that CATO has not checked yet. It shows in the Places queue. A trail cannot be published while an entry on its stops is waiting.",
      },
    ],
  },
  {
    title: "Content",
    items: [
      {
        question: "How do I post an announcement?",
        answer:
          "Open Announcements and tap New Event. Set its status to upcoming, ongoing, or past, then publish it so it shows on Home. A draft stays hidden from the public.",
      },
      {
        question: "What are Fiestas for?",
        answer:
          "Fiestas keep each barangay's fiesta as lasting reference data, not news. Open Fiestas and tap New Fiesta. A draft fiesta is not counted as published in the Fiesta coverage report.",
      },
      {
        question: "How do I build a trail?",
        answer:
          "Open Trails and tap New Trail. Add stops, set the theme, duration, and budget, and use Add Trail Note for a stop that needs a story. Tap Publish when it is ready, or Unpublish to take it down.",
      },
      {
        question: "Why can't I publish a trail?",
        answer:
          "Publish needs saved stops, at least one stop, and no discovery entries waiting for review. The reason shows under Stops, next to the entries to fix.",
      },
      {
        question: "How do I make a QR code for a stop?",
        answer: `Open the place or business and go to the Discovery content tab. Add or edit an entry and tick Unlock by QR scan, then use Download QR or Print QR on that entry. Unlock Radius (meters) sets how close a visitor must be. A stop opens at the largest radius among its entries, or ${DEFAULT_UNLOCK_RADIUS} m with none. If you do not see the tab, ask an Admin.`,
      },
      {
        question: "How do I change the landing page slides?",
        answer:
          "Open Landing Page. Add a slide with an image and a caption, reorder the slides, and switch each one on or off.",
      },
      {
        question: "What is Categories for?",
        answer:
          "Categories holds the category lists, in tabs. Which tabs you can use depends on your permissions.",
      },
      {
        question: "What do the reports show?",
        answer:
          "Barangay heatmap counts places and businesses in each barangay, verified and pending. Fiesta coverage shows which barangays have a published fiesta, only drafts, or none yet.",
      },
    ],
  },
  {
    title: "Admins only",
    items: [
      {
        question: "How do I add a staff member?",
        answer:
          "Open Staff and tap New Staff Account. Enter their name, email, password, and position, pick Staff or Admin, and tick the sections they may use.",
      },
      {
        question: "How do I remove someone's access?",
        answer:
          "In Staff, tap Deactivate on their row. Tap Activate to turn it back on. You cannot deactivate yourself if you are the only active Admin.",
      },
      {
        question: "What does the Activity log show?",
        answer:
          "A read only table of staff and admin actions, newest first, with Time, User, Action, Target, and Details. Filter by user, action, or target. Sign ins, creates, edits, deletes, verifies, rejects, features, and publishes are logged. Reorders and avatar, theme, and font size changes are not.",
      },
    ],
  },
  {
    title: "Your account",
    items: [
      {
        question: "How do I change my password or text size?",
        answer: "Open the account menu at the bottom of the sidebar, then Settings.",
      },
    ],
  },
];
