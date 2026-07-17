const sections = [
  {
    title: "1. Using Meme Us",
    body: "Meme Us is a private, invite-only game for two people. You may use it only if you are 18 or older and can form a binding agreement where you live. Please use the app lawfully and respectfully.",
  },
  {
    title: "2. Your account and duo",
    body: "Keep access to your account secure. A duo code is intended for the person you choose to play with; do not post it publicly. You are responsible for activity carried out through your account.",
  },
  {
    title: "3. Your photos and memes",
    body: "You keep ownership of the photos and text you submit. You give us the limited permission needed to store, process, and show that content to you and your linked partner so the game can work. Do not upload content that is unlawful, abusive, infringing, or violates someone else's privacy.",
  },
  {
    title: "4. Blind reveals and game features",
    body: "Daily prompts, streaks, reveals, Bingo, Flash Hunt, and other features are provided for fun. We may change, pause, or remove features as the product develops. We do not guarantee that every prompt or notification will be available at a particular time.",
  },
  {
    title: "5. Ending access",
    body: "You can stop using Meme Us at any time. We may suspend access if we reasonably believe these terms have been breached or the service is being misused. You can request deletion of your account from Settings.",
  },
  {
    title: "6. Changes and contact",
    body: "We may update these terms as Meme Us evolves. If changes are significant, we will provide reasonable notice in the app. Questions about these terms should be sent to the contact address listed in the app's published support details.",
  },
];

export default function TermsPage() {
  return (
    <main className="flex-1 overflow-y-auto px-6 py-10 no-bar">
      <div className="mx-auto max-w-md pb-10">
        <p className="font-display text-xs font-bold text-grape">MEME US</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-ink">Terms of Service</h1>
        <p className="mt-2 text-sm text-muted">Last updated: 13 July 2026</p>

        <aside className="mt-6 sticker-sm bg-mustard-light p-4 text-sm leading-6 text-ink">
          <strong>Pre-launch legal template.</strong> This plain-language draft needs review and approval by a qualified legal professional before public launch.
        </aside>

        <p className="mt-6 text-sm leading-6 text-muted">
          These terms explain the rules for using Meme Us. By creating an account or using the app, you agree to them.
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
