const sections = [
  {
    title: "What we collect",
    body: "We collect account information supplied by your sign-in provider, your display name, age-confirmation status, duo membership, photos and meme text you submit, reactions, and basic technical data needed to run and secure the app.",
  },
  {
    title: "How we use it",
    body: "We use this information to create your account, link you with your chosen partner, generate and run game rounds, keep your submissions hidden until a reveal, deliver notifications when enabled, and improve the reliability and safety of Meme Us.",
  },
  {
    title: "Who can see your content",
    body: "Your daily submissions and reactions are intended for you and the partner linked to your duo. We do not sell personal information. Service providers that help us host the app, authenticate users, store images, or send notifications may process information only to provide those services.",
  },
  {
    title: "Photos, camera, and notifications",
    body: "Camera access is requested only when you choose to take a photo. You can choose a photo from your library instead. Push notifications are optional and can be turned off in your device settings. We do not use your camera or microphone in the background.",
  },
  {
    title: "Retention and deletion",
    body: "We keep account and game data while your account is active, unless a longer period is required for security or legal reasons. You can request deletion of your account from Settings; this removes your account and associated data subject to applicable technical and legal limits.",
  },
  {
    title: "Your choices and contact",
    body: "You may update your display name, disable notifications, or request account deletion. For privacy questions or requests, use the support contact published in the app. We may update this policy as the product evolves and will provide notice for significant changes.",
  },
];

export default function PrivacyPage() {
  return (
    <main className="flex-1 overflow-y-auto px-6 py-10 no-bar">
      <div className="mx-auto max-w-md pb-10">
        <p className="font-display text-xs font-bold text-grape">MEME US</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-ink">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted">Last updated: 13 July 2026</p>

        <aside className="mt-6 sticker-sm bg-mustard-light p-4 text-sm leading-6 text-ink">
          <strong>Pre-launch legal template.</strong> This draft needs review and approval by a qualified privacy professional before public launch.
        </aside>

        <p className="mt-6 text-sm leading-6 text-muted">
          This policy explains what information Meme Us uses, why we use it, and the choices available to you.
        </p>

        <div className="mt-8 space-y-7">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="font-display text-lg font-bold text-ink">{section.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted">{section.body}</p>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
