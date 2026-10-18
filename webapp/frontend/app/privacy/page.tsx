import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy (draft) - Planet Hunter" };

// Mirrors docs/PRIVACY_NOTICE_DRAFT.md. Draft until an attorney reviews it (ADR 0005).
export default function PrivacyPage() {
  return (
    <div className="page prose">
      <p className="eyebrow">Draft</p>
      <h1>Privacy notice</h1>
      <p className="callout" role="note" data-testid="privacy-draft">
        <strong>This is a draft and has not been reviewed by an attorney yet.</strong> It describes what the site
        stores today.
      </p>
      <h2>Without an account</h2>
      <p>
        You can use everything except the classroom without an account. We do not ask who you are. Your unit settings
        and lesson progress stay in your own browser and are never sent to us. Maps, sky images and the picture of the
        day load from the services named on each page (OpenStreetMap, CDS Aladin, NASA), which receive your IP address
        when they load.
      </p>
      <h2>Teacher accounts</h2>
      <p>
        We store your email address, a hash of your password (never the password itself), the name you show students,
        the schools or groups you belong to and your role, the classes and assignments you create, and that you
        confirmed being 13 or older (not your birth date).
      </p>
      <h2>Student accounts</h2>
      <p>
        Students give no email and no real name. We store the nickname chosen for the class, a hash of the PIN, when
        they joined, that they confirmed being 13 or older (not the birth date), and their assignment results. Other
        students never see a student&apos;s nickname or results; their teachers do.
      </p>
      <h2>Signing in</h2>
      <p>
        A random session token is kept in a cookie for up to 30 days; we store only a hash of it. Failed sign-in
        attempts are counted for up to one day to slow down guessing.
      </p>
      <h2>Who can see what</h2>
      <p>
        Teachers see the classes of their own school or group and nothing from others. Role changes, removals,
        deletions and exports are recorded in an audit log.
      </p>
      <h2>Exporting and deleting</h2>
      <p>
        A teacher can export everything stored about a class, delete a class with all its students and results, or
        remove a single student.
      </p>
      <h2>Ages</h2>
      <p>
        Accounts are for people aged 13 and up. If you tell us you are younger, we do not create an account and do not
        keep your answer.
      </p>
    </div>
  );
}
