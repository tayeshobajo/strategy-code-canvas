// Phase 2C — ChatMessageProposals
// Renders any proposal cards associated with a specific chat message.
// Drop this below the message bubble in the chat route.
//
// Usage:
//   <ChatMessageProposals
//     projectId={projectId}
//     messageId={message.id}
//     threadId={threadId}
//     caps={caps}
//   />

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listChatProposals, type ChatCapabilities } from "@/lib/engine-chat-proposals.functions";
import { ProposalCard } from "./ProposalCard";

type Props = {
  projectId: string;
  messageId: string;
  threadId: string | null;
  caps: ChatCapabilities | undefined;
  /** If true, also shows dismissed proposals (hidden by default) */
  showDismissed?: boolean;
};

export function ChatMessageProposals({
  projectId,
  messageId,
  threadId,
  caps,
  showDismissed = false,
}: Props) {
  const listFn = useServerFn(listChatProposals);

  const { data } = useQuery({
    queryKey: ["engine", "chat", "proposals", projectId, "message", messageId],
    queryFn: async () => {
      const res = await listFn({
        data: { projectId, sourceMessageId: messageId },
      });
      return (res as { proposals: ReturnType<typeof listChatProposals> }).proposals ?? [];
    },
    staleTime: 30_000,
    enabled: !!projectId && !!messageId,
  });

  const proposals = Array.isArray(data) ? data : [];
  const visible = showDismissed
    ? proposals
    : proposals.filter((p) => p.status !== "dismissed");

  if (visible.length === 0) return null;

  return (
    <div className="mt-2 space-y-2" data-qa-role="chat-message-proposals">
      {visible.map((proposal) => (
        <ProposalCard
          key={proposal.id}
          projectId={projectId}
          threadId={threadId}
          sourceMessageId={messageId}
          proposal={proposal}
          caps={caps}
        />
      ))}
    </div>
  );
}
