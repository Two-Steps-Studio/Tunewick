import type { LegalContent } from "../types";

// English translation of the Polish drafts in ./pl.ts. The Polish version prevails.
export const en: LegalContent = {
  draftNotice:
    "Draft {version}. This document describes how Tunewick really works but has not been reviewed by a lawyer yet. It applies to the closed beta and may change before the public launch. This is a translation; the Polish version prevails.",
  contents: "Contents",
  missing: "to be completed",
  fields: { operator: "operator name", address: "address", email: "contact email" },
  documents: {
    terms: {
      title: "Terms of Service",
      lead: "The rules for using Tunewick — a service for listening to and discovering music by independent artists from all of Poland.",
      sections: [
        {
          id: "general",
          title: "1. Who runs Tunewick",
          blocks: [
            'Tunewick (the "service") is run by {operator}, {address} (the "operator"). Contact for all matters: {email}.',
            "These are terms for services provided electronically. They are available free of charge before you create an account, in a form you can save and print.",
            "The service is in closed beta: accounts can only be created with an invite code, and features may change or be temporarily unavailable.",
          ],
        },
        {
          id: "definitions",
          title: "2. Definitions",
          blocks: [
            {
              list: [
                "Account — your account in the service, protected by an email address and password.",
                "Listener — anyone with an account or visiting the service.",
                "Artist — an artist profile (person, band, project) run by one or more accounts; separate Artist Terms apply.",
                "Content — recordings, artwork, descriptions, playlists, profiles, gig and venue information.",
                "Premium — access to music in lossless and Hi-Res quality.",
              ],
            },
          ],
        },
        {
          id: "requirements",
          title: "3. Technical requirements",
          blocks: [
            "You need an up-to-date browser (Chrome, Edge, Firefox or Safari) with JavaScript enabled, internet access and an email address. Lossless playback needs a faster connection.",
            "You must not submit unlawful content or try to bypass the service's security.",
          ],
        },
        {
          id: "account",
          title: "4. Account",
          blocks: [
            "You can create an account if you are at least 16 — you confirm this when signing up.",
            "By creating an account you enter into a free, open-ended agreement with the operator for the services described here.",
            "Your account is personal: do not share it and protect your password. If you think someone knows your password, change it and write to us.",
            "You can delete your account at any time in Settings (“Your data”). Deletion is immediate and cannot be undone; if you are the only owner of an artist profile, first add another owner or write to {email} to delete the profile.",
          ],
        },
        {
          id: "service",
          title: "5. What the service offers",
          blocks: [
            {
              list: [
                "listening to music in the browser (streaming — files cannot be downloaded);",
                "discovering artists, releases, gigs and venues, including near you;",
                "a library: likes, following artists and people, playlists, listening history;",
                "marking gigs you attended (“Byłem przy tym” — I was there);",
                "for artists: a profile, releases, gigs and listener statistics.",
              ],
            },
            "The basic account is free. We accept no payments during the beta. Premium is available through promo codes or from the operator.",
            "Recommendations always show their reason (e.g. “same engineer”). There is no paid promotion in them.",
          ],
        },
        {
          id: "codes",
          title: "6. Promo codes",
          blocks: [
            "A promo code gives Premium for the period stated with the code. Codes are single-use, cannot be exchanged for money, and the number of attempts is limited.",
            "Premium “with no time limit” means access for as long as the service operates in its current form. If the service closes, we will tell you at least 30 days in advance.",
          ],
        },
        {
          id: "rules",
          title: "7. Rules of use",
          blocks: [
            "When using the service you must not:",
            {
              list: [
                "publish content that is unlawful, incites hatred, harasses or infringes others' rights (including copyright);",
                "impersonate other people, artists or bands;",
                "spam or artificially inflate plays, followers or statistics;",
                "scrape data, record streams or bypass security and limits;",
                "add fictitious gigs or venues.",
              ],
            },
            "If these rules are broken we may hide content, restrict account features or — for serious or repeated violations — block the account. Every such decision comes with reasons and can be appealed (see Content and Reporting Policy).",
          ],
        },
        {
          id: "your-content",
          title: "8. Your content",
          blocks: [
            "Content you add (profile, bio, playlist names) remains yours. You grant the operator a free, non-exclusive licence to store and display it in the service — only as far as you make it available (a private playlist is visible only to you). The licence ends when you delete the content or your account.",
            "You decide in Settings who sees your activity (marked gigs, public playlists): everyone, followers or only you. Default: followers.",
          ],
        },
        {
          id: "liability",
          title: "9. Availability and liability",
          blocks: [
            "We try to keep the service running, but during the beta there may be outages, maintenance breaks and feature changes. We are not liable for the effects of interruptions that are not our fault.",
            "Music and other content is published by artists and listeners. We do not check everything in advance, but we act on reports and review releases before publication.",
            "Nothing here limits the rights you have as a consumer by law.",
          ],
        },
        {
          id: "complaints",
          title: "10. Complaints",
          blocks: [
            "If something does not work as these terms describe, write to {email}: describe the problem and give your account email. We will reply within 14 days.",
          ],
        },
        {
          id: "termination",
          title: "11. Ending the agreement",
          blocks: [
            "You can end the agreement at any time by deleting your account.",
            "The operator may end it for important reasons (serious or repeated violations, the service closing) with 14 days' notice, and immediately for flagrant violations. We will always give the reason.",
          ],
        },
        {
          id: "changes",
          title: "12. Changes",
          blocks: [
            "We may change these terms for important reasons (changes in law, new features, security). We will tell you in the service or by email at least 14 days in advance. If you disagree, you can delete your account before the changes take effect.",
          ],
        },
        {
          id: "final",
          title: "13. Final provisions",
          blocks: [
            "Polish law applies. As a consumer you keep the protection given by the law of the country where you live.",
            "Consumer disputes can also be settled out of court, e.g. with the help of a local consumer ombudsman.",
            "How we process data is described in the Privacy Policy; rules for artists in the Artist Terms; reporting in the Content and Reporting Policy.",
          ],
        },
      ],
    },

    artistTerms: {
      title: "Artist Terms",
      lead: "The terms on which you publish music on Tunewick. They supplement the Terms of Service.",
      sections: [
        {
          id: "who",
          title: "1. Who can run an artist profile",
          blocks: [
            "Anyone with an account can create an artist profile. A profile can have several team members as owner, manager or member. Owners and managers can publish, manage the team and appeal moderation decisions.",
            "By accepting these terms on behalf of a band or project you confirm that you may act for everyone whose rights the published music involves.",
            "Verification (the “verified” badge) is voluntary and decided by a moderator.",
          ],
        },
        {
          id: "rights",
          title: "2. Your rights stay with you",
          blocks: [
            "Publishing a release does not transfer copyright or related rights to the operator. You grant the operator a free, non-exclusive, non-sublicensable, worldwide licence for as long as the release is published in the service, covering:",
            {
              list: [
                "storing the files (including the unaltered original master);",
                "copies technically needed for delivery, including transcoding into streaming formats (e.g. FLAC, AAC) — with no change to the sound beyond format conversion;",
                "making the works available to the public so that anyone can access them at a place and time of their choosing — streaming only, no downloads;",
                "making an excerpt of up to 30 seconds (“Soundcheck”) available for music discovery in the service;",
                "displaying artwork, photos, names, descriptions and metadata (authors, engineers, label) in the service.",
              ],
            },
            "The licence does not cover selling files, offering downloads or passing the music to other services.",
          ],
        },
        {
          id: "declarations",
          title: "3. Declarations when publishing",
          blocks: [
            "Before sending a release to review you make a declaration we store permanently (with the date and the version of these terms). Among other things you declare that:",
            {
              list: [
                "you own the recordings (masters) or have their owners' permission;",
                "you own the works (music and lyrics) or have the authors' permission — and you state whether any author belongs to a collective management organisation (e.g. ZAiKS);",
                "samples and interpolations are cleared (with a description) or there are none;",
                "you truthfully label AI involvement: human, AI-assisted or AI-generated;",
                "you may use the artwork and photos.",
              ],
            },
            "You are responsible for false declarations towards the people whose rights you infringe and towards the operator, within the limits of the law.",
          ],
        },
        {
          id: "review",
          title: "4. Review and publication",
          blocks: [
            "A moderator checks every release before publication and either approves it or returns it with an explanation of what to fix. You can withdraw a submission until it has been reviewed.",
            "We accept lossless formats only (WAV, AIFF, FLAC, ALAC). Listeners see the quality that was really uploaded — we never label as Hi-Res what is not.",
            "Gigs added by artists are also reviewed. Add real events only.",
          ],
        },
        {
          id: "withdrawal",
          title: "5. Withdrawing music",
          blocks: [
            "You can ask at any time for a published release to be withdrawn by writing to {email} from an owner or manager account. We will withdraw it within 7 days, and the licence ends then. The tracks disappear from listeners' playlists.",
            "In the same way you can ask for the whole artist profile to be deleted — all its releases are withdrawn.",
          ],
        },
        {
          id: "disputes",
          title: "6. Reports and rights disputes",
          blocks: [
            "If someone reports an infringement in your release, a moderator may take it down. You get the reasons and can appeal within 6 months — a different moderator decides. Details: Content and Reporting Policy.",
            "After repeated, confirmed copyright infringements we may suspend the artist profile.",
          ],
        },
        {
          id: "money",
          title: "7. Remuneration",
          blocks: [
            "During the beta the service is free and has no revenue, so we pay no remuneration to artists. The licence is free of charge.",
            "We already record how many listeners and plays (from 30 seconds, never Soundchecks) each artist has per month — you see this on your profile's management page. When paid plans arrive we intend a user-centric model (a listener's payment goes to the artists they listen to). We will publish payout terms in a separate document before charging anyone — and ask for your consent.",
          ],
        },
        {
          id: "promotion",
          title: "8. Promotion",
          blocks: [
            "We may show your music, artwork and Soundcheck in the service (e.g. “New from all of Poland”). Outside the service (e.g. Tunewick's social media) we will use them only with your consent.",
          ],
        },
        {
          id: "changes",
          title: "9. Changes",
          blocks: [
            "We will announce changes to these terms at least 14 days in advance. If you disagree, you can withdraw your music. The version you accepted when publishing is stored with your declaration.",
          ],
        },
      ],
    },

    privacy: {
      title: "Privacy Policy",
      lead: "What data Tunewick collects, why, how long we keep it and what rights you have. No ads, no selling data, no tracking outside the service.",
      sections: [
        {
          id: "controller",
          title: "1. Data controller",
          blocks: [
            "The controller of your personal data is {operator}, {address}. For data matters write to {email}.",
          ],
        },
        {
          id: "data",
          title: "2. What data we process",
          blocks: [
            {
              list: [
                "Account: email address, password (stored only as a secure hash), sign-up and last sign-in dates, confirmation of age 16+.",
                "Profile: handle, display name, bio, language, activity visibility setting.",
                "Listening: what, when and how long you play and in which quality. The history is private — only you see it and you can clear it at any time.",
                "Monthly listening summary: how many plays of each artist you had in a month (the basis for future settlements with artists).",
                "Library and community: likes, followed artists and people, playlists, blocks, gigs marked “I was there”.",
                "Reports and moderation: reports you send (for copyright notices also the claimant's name and email), decisions about your content and appeals.",
                "Premium: granted plans, redeemed promo codes, code attempts.",
                "Artists: artist profile data (name, city, region, members, photos), uploaded audio and images, rights declarations.",
                "Security: for staff — two-factor sign-in data and an activity log (who changed what and when).",
                "Discovery: your preferences (country, optional city, languages, genres, Discover mode, time zone, share of surprises), songs saved from Discover, discovery points, achievements and feed events (a song shown, skipped, a preview heard, a share) — linked to your account, without IP address or device details.",
              ],
            },
            "Player diagnostics (time to first audio, errors) are stored without an account identifier: only the day, quality, playback method and browser family.",
            "We remove metadata (e.g. GPS location) from photos and images — we store a converted copy.",
          ],
        },
        {
          id: "purposes",
          title: "3. Purposes and legal bases",
          blocks: [
            {
              list: [
                "Providing the service — account, playback, library, recommendations based on your listening, community features, Premium (Art. 6(1)(b) GDPR — contract).",
                "Security, abuse prevention (limits, attempt blocking), service diagnostics and the staff activity log (Art. 6(1)(f) GDPR — legitimate interest).",
                "Handling content reports, statements of reasons and appeals under the Digital Services Act (Art. 6(1)(c) GDPR — legal obligation).",
                "Listening summaries for artists and future settlements (Art. 6(1)(b) and (f) GDPR).",
                "Discover recommendations, points, goals, streaks, records, achievements and discovery rankings — from your listening and reactions in the service (GDPR art. 6(1)(b) — contract); feed events also to improve recommendations (art. 6(1)(f)).",
              ],
            },
            "We do not use your data for advertising, do not sell it and do not profile you for marketing. Recommendations make no decisions with legal effects on you.",
          ],
        },
        {
          id: "recipients",
          title: "4. Who sees your data",
          blocks: [
            {
              list: [
                "Everyone: your public profile (name, bio, join date, follower count) and public playlists.",
                "Selected people: marked gigs and public playlists on your profile — according to your visibility setting (followers by default). Blocked people do not see your activity.",
                "Artists: only total listeners and plays per month — never who listened.",
                "Staff (moderators, administrators): only as needed for moderation, support and security, with mandatory two-factor sign-in; their actions are logged.",
                "Discovery rankings: profile name, display name, points and discoveries in a period — only if you have a profile name and keep rankings on in your discovery preferences.",
                'Discovery comparison ("You vs friend"): your totals (songs, artists, countries, listening time, points) — only to people who can see your activity under your visibility setting.',
              ],
            },
            "Infrastructure providers process data on our behalf under data processing agreements: Supabase (database and sign-in, servers in Frankfurt), Vercel (application hosting), Cloudflare (storage of music and images, EU jurisdiction), Fly.io (audio processing, EU region) and an email delivery provider. Some are US companies; where data leaves the European Economic Area, the basis is the European Commission's standard contractual clauses or the EU-US Data Privacy Framework.",
          ],
        },
        {
          id: "cookies",
          title: "5. Cookies and browser storage",
          blocks: [
            "We use only strictly necessary cookies: the sign-in session (sb-…-auth-token) and the remembered language (NEXT_LOCALE). Browser storage keeps the player volume. We use no analytics or advertising cookies, so there is no consent banner. If that changes, we will ask for consent first.",
            "If you choose what to discover without an account, we keep that choice (country, genres, languages, mode) in the tw_discovery cookie on your device for a year — only so the feed remembers it; it never reaches our database.",
          ],
        },
        {
          id: "retention",
          title: "6. How long we keep data",
          blocks: [
            {
              list: [
                "Account, profile, library, playlists — until you delete your account (or delete them earlier).",
                "Listening history — 25 months (older months are deleted automatically), unless you clear it earlier.",
                "Monthly listening summaries — longer, as the basis for settlements with artists; after account deletion they remain without any link to you.",
                "Promo code attempts — 90 days; player diagnostics — 13 months; staff activity log — 2 years.",
                "Reports and moderation decisions — as long as needed for appeals and Digital Services Act obligations.",
                "Artists' rights declarations — while published and afterwards, as evidence in possible disputes; after account deletion without a link to the person.",
                "Discover feed events — 180 days; discovery points, achievements, saved songs and preferences — until your account is deleted.",
              ],
            },
          ],
        },
        {
          id: "rights",
          title: "7. Your rights",
          blocks: [
            "You have the right to access, rectify and erase your data, restrict processing, data portability and to object to processing based on legitimate interest. You can exercise most of them yourself:",
            {
              list: [
                "Settings → “Your data” → “Download my data” — all account data in one JSON file (access and portability);",
                "Settings — change your profile and activity visibility (rectification);",
                "Library — clear your listening history;",
                "Settings → “Delete account” — immediate account deletion (right to be forgotten).",
              ],
            },
            "For anything else write to {email} — we reply within one month. You also have the right to lodge a complaint with the President of the Personal Data Protection Office (UODO, ul. Stawki 2, 00-193 Warsaw, uodo.gov.pl).",
          ],
        },
        {
          id: "age",
          title: "8. Age",
          blocks: [
            "The service is for people aged 16 and over. If we learn that a younger person created an account, we will delete it.",
          ],
        },
        {
          id: "changes",
          title: "9. Changes",
          blocks: [
            "We will announce significant changes in the service or by email before they take effect.",
          ],
        },
      ],
    },

    contentPolicy: {
      title: "Content and Reporting Policy",
      lead: "What must not be published on Tunewick, how to report it and how we decide — in line with the Digital Services Act (DSA).",
      sections: [
        {
          id: "not-allowed",
          title: "1. What is not allowed",
          blocks: [
            {
              list: [
                "music, artwork and photos you have no rights to;",
                "unlawful content, including incitement to violence or hatred;",
                "harassment, threats, exposing other people's personal data;",
                "impersonating artists, bands or other people;",
                "spam, scams, fictitious gigs and venues;",
                "artificially inflating plays and statistics.",
              ],
            },
          ],
        },
        {
          id: "how-to-report",
          title: "2. How to report",
          blocks: [
            "Every artist, release, playlist, gig, venue and profile page has a “Report” link. Reporting requires signing in; if you have no account, write to {email}.",
            "Give a reason and a description (what breaks the law or these rules, and why). For copyright notices also give the rightsholder's name, a contact email and a good-faith statement.",
            "The person whose content was reported will not learn who reported it. They will see the decision and its reasons.",
          ],
        },
        {
          id: "decisions",
          title: "3. How we decide",
          blocks: [
            "Reports are decided by a human moderator, not an algorithm. Decisions are proportionate:",
            {
              list: [
                "dismissing the report;",
                "taking down a release;",
                "hiding a playlist (it becomes private);",
                "removing a gig from the Scene;",
                "removing a venue's address and website;",
                "clearing a profile's name and bio;",
                "suspending an artist profile.",
              ],
            },
            "Every decision that restricts someone's content has written reasons (what we decided and why) that the owner can see — on the artist management page, on the playlist or in Settings.",
          ],
        },
        {
          id: "appeals",
          title: "4. Appeals",
          blocks: [
            "You can appeal a decision once, within 6 months, using the button next to it. A different moderator than the one who decided handles the appeal. If it is upheld, the content is restored.",
            "You can also pursue your rights in court.",
          ],
        },
        {
          id: "repeat",
          title: "5. Repeated infringements",
          blocks: [
            "After repeated, confirmed copyright infringements we may suspend an artist profile. Only decisions not reversed on appeal count.",
          ],
        },
        {
          id: "contact",
          title: "6. Point of contact",
          blocks: [
            "Point of contact for users and for authorities of EU member states and the European Commission (Art. 11–12 DSA): {email}. We write in Polish and English.",
          ],
        },
      ],
    },
  },
};
