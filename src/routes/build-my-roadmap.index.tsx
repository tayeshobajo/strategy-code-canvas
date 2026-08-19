import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { IntakeLanding } from "@/components/intake/IntakeLanding";
import { ConversationRoom } from "@/components/intake/ConversationRoom";
import { useIntakeConversation } from "@/components/intake/use-intake-conversation";
import { recordFirstTouch } from "@/lib/website-intake/attribution";
import { trackEvent } from "@/lib/website-intake/track";

export const Route = createFileRoute("/build-my-roadmap/")({
  head: () => {
    const title = "Build My Roadmap | Trust Tai";
    const description =
      "A conversation, not a form. Tell us about your business in your own words — by typing or speaking — and we'll come back with what we see.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: "https://trusttai.com/build-my-roadmap" },
        { property: "og:site_name", content: "Trust Tai" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
      links: [{ rel: "canonical", href: "https://trusttai.com/build-my-roadmap" }],
    };
  },
  component: BuildMyRoadmap,
});

function BuildMyRoadmap() {
  const conversation = useIntakeConversation();
  const [open, setOpen] = React.useState(false);
  const [voiceFirst, setVoiceFirst] = React.useState(false);

  React.useEffect(() => {
    recordFirstTouch();
    trackEvent({ name: "intake_view", dedupe: "build-my-roadmap" });
  }, []);

  return (
    <div className="min-h-screen bg-cream text-ink">
      <SiteHeader />

      <main>
        <IntakeLanding
          resuming={conversation.resuming}
          resumed={conversation.hasProgress}
          onStart={() => {
            setVoiceFirst(false);
            setOpen(true);
          }}
          onStartVoice={() => {
            setVoiceFirst(true);
            setOpen(true);
          }}
        />
      </main>

      <SiteFooter />

      <ConversationRoom
        open={open}
        voiceFirst={voiceFirst}
        conversation={conversation}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
