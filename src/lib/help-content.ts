import { PERSONAL_STOP_LIMIT, PERSONAL_TRAIL_LIMIT } from "@/lib/personal-trails";
import { DEFAULT_UNLOCK_RADIUS } from "@/lib/trail-unlock";

/**
 * Copy for the Help & FAQ page (docs/help-faq-plan.md). Plain text, English.
 * Numbers come from the code's own constants, so they stay true. Button and
 * label names (Start trail, Restart trail, Directions) are typed here, so
 * change them in this file when the screen's wording changes.
 */
export interface HelpItem {
  question: string;
  answer: string;
}

export interface HelpTopic {
  title: string;
  items: HelpItem[];
}

export const HELP_TOPICS: HelpTopic[] = [
  {
    title: "Getting started",
    items: [
      {
        question: "What is Lakbay Pasig?",
        answer:
          "A guide to Pasig City's heritage places, local businesses, events, and trails. CATO, the city's tourism office, runs it.",
      },
      {
        question: "Do I need an account?",
        answer:
          "No. You can browse places, businesses, events, and trails as a guest. Saving, starting a trail, and listing a business need an account.",
      },
      {
        question: "What do the status labels mean?",
        answer:
          "Verified by Pasig Tourism Office means CATO has reviewed the place or business. Pending CATO review means it is shown, but CATO has not checked it yet.",
      },
    ],
  },
  {
    title: "Discover",
    items: [
      {
        question: "Why does the app ask for my location?",
        answer:
          "To show distances, nearby places, and your spot on the map. It stays on your device and is not saved to your account. You can say no and still browse.",
      },
      {
        question: "How do I get directions?",
        answer:
          "Open a place or business and tap Directions. Location must be on. If it is off, the app asks you to turn it on.",
      },
      {
        question: "How does voice search work?",
        answer:
          "Tap the microphone in the search bar and speak. Your recording is sent to a speech to text service and turned into text. We do not store it.",
      },
    ],
  },
  {
    title: "Trails",
    items: [
      {
        question: "How does a trail work?",
        answer:
          "A trail is a route of stops in order. Sign in, then tap Start trail to open the first stop. Each next stop opens when you reach it.",
      },
      {
        question: "Why is a stop locked?",
        answer: `A stop opens when you are within ${DEFAULT_UNLOCK_RADIUS} m of it, or the distance that stop sets. Turn on location and keep the trail open on your phone.`,
      },
      {
        question: "How do I scan a QR code?",
        answer:
          "Use your phone camera on the code at the stop. The link opens in the app. You need to be signed in, have the stop unlocked, and be at the stop with location on. Some stop content stays hidden until you scan.",
      },
      {
        question: "What is a credential?",
        answer:
          "A badge for finishing a trail that has one. It reads Earn on the trail page, then Earned once you finish. Finished trails also appear under Completed in Saved.",
      },
      {
        question: "Can I do a trail again?",
        answer: "Yes. After you finish, tap Restart trail.",
      },
      {
        question: "What are Your trails?",
        answer: `Trails you build yourself with Make a trail. Only you can see them. You can have up to ${PERSONAL_TRAIL_LIMIT} trails with up to ${PERSONAL_STOP_LIMIT} stops each. They never earn a credential.`,
      },
    ],
  },
  {
    title: "Saved",
    items: [
      {
        question: "What can I save?",
        answer: "Places, businesses, and trails. Tap the heart, then find them in Saved. Finished trails are under Completed.",
      },
      {
        question: "How do I hide a suggestion?",
        answer:
          "Tap Not interested on a suggestion. It leaves the For you and Similar rows, but still shows in Search and Discover. Undo it in Settings, under Hidden items.",
      },
    ],
  },
  {
    title: "Account",
    items: [
      {
        question: "How do I change my details?",
        answer:
          "Open Profile for your photo, display name, and preferred categories. Open Settings for your username, first and last name, contact number, and password.",
      },
      {
        question: "How do I use dark mode or bigger text?",
        answer: "Open Settings, then Appearance. Turn on Dark mode, or pick a Font size.",
      },
      {
        question: "How do I delete my account?",
        answer:
          "Open Settings, then Account, then Delete account, and type DELETE to confirm. This permanently removes your account, saved items, private trails, trail progress, and hidden items. Staff accounts and accounts with a business listing cannot be deleted there. Contact CATO instead.",
      },
    ],
  },
  {
    title: "Businesses",
    items: [
      {
        question: "How do I list my business?",
        answer:
          "Open Profile, tap List your business, and follow the steps. CATO reviews every listing, and its status shows next to your business name.",
      },
      {
        question: "How does a business become Featured?",
        answer:
          "CATO picks Featured businesses on its own. There is no request form in the app. To be considered, contact CATO directly.",
      },
    ],
  },
  {
    title: "Report a problem",
    items: [
      {
        question: "Something is wrong or out of date. Who do I tell?",
        answer:
          "Contact CATO using the details at the bottom of this page. Include the name of the place or business.",
      },
    ],
  },
];
